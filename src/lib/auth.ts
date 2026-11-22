import "server-only";
import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { magicLink } from "better-auth/plugins";
import { db } from "@/db/client";
import * as schema from "@/db/schema";
import {
  emailLinkEnabled,
  emailProblem,
  microsoftEnabled,
  normalizeEmail,
  waterlooTenantId,
} from "./auth-policy";
import { clientIp, trustedIpHeader } from "./client-ip";
import { EmailNotConfiguredError, sendEmail } from "./email";
import { consume, pruneExpired } from "./rate-limit";

// Email-link limits. IP limits only apply when the real client IP is known
// (TRUSTED_IP_HEADER); the per-recipient and global caps always apply.
const LINK_LIMITS = {
  perIp: { windowSec: 10 * 60, max: 20 }, // generous for students behind campus NAT
  perRecipient: { windowSec: 10 * 60, max: 3 },
  perRecipientDaily: { windowSec: 24 * 60 * 60, max: 10 },
  global: { windowSec: 10 * 60, max: 500 },
};

function tooMany(retryAfter: number | null): never {
  const wait = retryAfter ? ` Try again in ${Math.ceil(retryAfter / 60)} min.` : "";
  throw new APIError("TOO_MANY_REQUESTS", { message: `Too many sign-in emails.${wait}` });
}

// Option B: emailed sign-in link to a Waterloo address.
const emailLinkPlugins = emailLinkEnabled()
  ? [
      magicLink({
        expiresIn: 60 * 10,
        storeToken: "hashed",
        // Checked before anything is sent, so the form can't be used to email
        // arbitrary addresses.
        async sendMagicLink({ email, url }, ctx) {
          // 1. Per-IP, counted before validation so rejected addresses use up
          //    the budget too. Keys are IPs only, never the rejected address.
          const ip = clientIp(ctx?.headers ?? ctx?.request?.headers);
          if (ip) {
            const r = await consume(`ml:ip:${ip}`, LINK_LIMITS.perIp.windowSec, LINK_LIMITS.perIp.max);
            if (!r.allowed) tooMany(r.retryAfter);
          }

          // Expired counters can hold email addresses; clear them on every send.
          await pruneExpired();

          // 2. Only Waterloo addresses.
          const problem = emailProblem(email);
          if (problem) throw new APIError("BAD_REQUEST", { message: problem });
          const to = normalizeEmail(email);

          // 3. Global cap (bounds total email volume and counter rows), then a
          //    per-recipient cooldown so no inbox can be flooded, whatever the
          //    number of sources.
          const g = await consume("ml:global", LINK_LIMITS.global.windowSec, LINK_LIMITS.global.max);
          if (!g.allowed) tooMany(g.retryAfter);
          for (const [key, rule] of [
            [`ml:to:${to}`, LINK_LIMITS.perRecipient],
            [`ml:to-day:${to}`, LINK_LIMITS.perRecipientDaily],
          ] as const) {
            const r = await consume(key, rule.windowSec, rule.max);
            if (!r.allowed) tooMany(r.retryAfter);
          }

          try {
            await sendEmail({
              to,
              subject: "Your Wattle sign-in link",
              text: `Sign in to Wattle:\n\n${url}\n\nThis link expires in 10 minutes and works once. If you didn't request it, ignore this email.`,
              html: `<p>Sign in to Wattle:</p><p><a href="${url}">Sign in</a></p><p>This link expires in 10 minutes and works once. If you didn't request it, ignore this email.</p>`,
            });
          } catch (err) {
            if (err instanceof EmailNotConfiguredError) {
              throw new APIError("SERVICE_UNAVAILABLE", { message: "Email sign-in is unavailable." });
            }
            throw err;
          }
        },
      }),
    ]
  : [];

export const auth = betterAuth({
  appName: "Wattle",
  baseURL: process.env.BETTER_AUTH_URL,
  secret: process.env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, { provider: "pg", schema }),

  // Option A: Microsoft sign-in, pinned to Waterloo's Entra tenant. Pinning
  // the tenant makes Better Auth validate the token issuer for that tenant.
  socialProviders: microsoftEnabled()
    ? {
        microsoft: {
          clientId: process.env.MICROSOFT_CLIENT_ID!,
          clientSecret: process.env.MICROSOFT_CLIENT_SECRET!,
          tenantId: waterlooTenantId() ?? "organizations",
          // Only ask for basic sign-in scopes (no Graph access), which keeps
          // the consent prompt as small as possible.
          disableDefaultScope: true,
          scope: ["openid", "profile", "email"],
          disableProfilePhoto: true,
          prompt: "select_account",
          mapProfileToUser(profile) {
            // The UPN is the student's WatIAM login (e.g. jdoe@uwaterloo.ca).
            // Using it instead of the first.last alias keeps one stable email
            // per person.
            const upn = profile.preferred_username ?? profile.upn;
            const email = normalizeEmail(upn || profile.email || "");
            return { email, emailVerified: true };
          },
        },
      }
    : {},

  account: {
    accountLinking: {
      enabled: true,
      // A Microsoft sign-in with the same email joins an existing email-link account.
      trustedProviders: ["microsoft"],
    },
  },

  user: {
    additionalFields: {
      handle: { type: "string", required: false, input: false },
      faculty: { type: "string", required: false, input: false },
    },
    // Runs for every new user and for every Microsoft sign-in.
    validateUserInfo({ user, source }) {
      const problem = emailProblem(String(user.email ?? ""));
      if (problem) return { error: "not_waterloo", message: problem };

      if (source.method === "oauth" && source.oauth?.providerId === "microsoft") {
        const expected = waterlooTenantId();
        const tid = source.oauth.profile?.tid;
        if (!expected || tid !== expected) {
          return { error: "wrong_tenant", message: "Sign in with your Waterloo Microsoft account." };
        }
      }
    },
  },

  session: {
    expiresIn: 60 * 60 * 24 * 30,
    updateAge: 60 * 60 * 24,
  },

  // Better Auth's own per-IP limits, stored in the shared database table so
  // they survive restarts and apply across server processes. When the client
  // IP is unknown (no TRUSTED_IP_HEADER), these rules are skipped rather than
  // putting every student into one shared bucket; the email-specific limits
  // in sendMagicLink still apply.
  rateLimit: {
    enabled: true,
    window: 60,
    max: 100,
    customStorage: {
      consume: (key, rule) => consume(`ba:${key}`, rule.window, rule.max),
    },
    customRules: {
      "/sign-in/*": (req) => (clientIp(req.headers) ? { window: 60, max: 20 } : false),
      "/magic-link/verify": (req) => (clientIp(req.headers) ? { window: 60, max: 30 } : false),
    },
  },

  advanced: {
    ipAddress: {
      // Only trust the header our proxy sets. Without one, read no header at
      // all, so a spoofed x-forwarded-for can't pick the rate-limit bucket.
      ipAddressHeaders: [trustedIpHeader() ?? "x-wattle-no-trusted-ip-header"],
    },
  },

  onAPIError: {
    errorURL: "/sign-in",
  },

  // nextCookies stays last: it lets server actions set auth cookies.
  plugins: [...emailLinkPlugins, nextCookies()],
});

export type Session = typeof auth.$Infer.Session;

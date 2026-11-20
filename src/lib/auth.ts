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
import { sendEmail } from "./email";

// Option B: emailed sign-in link to a Waterloo address.
const emailLinkPlugins = emailLinkEnabled()
  ? [
      magicLink({
        expiresIn: 60 * 10,
        storeToken: "hashed",
        // Checked before anything is sent, so the form can't be used to email
        // arbitrary addresses.
        async sendMagicLink({ email, url }) {
          const problem = emailProblem(email);
          if (problem) throw new APIError("BAD_REQUEST", { message: problem });
          await sendEmail({
            to: normalizeEmail(email),
            subject: "Your Wattle sign-in link",
            text: `Sign in to Wattle:\n\n${url}\n\nThis link expires in 10 minutes and works once. If you didn't request it, ignore this email.`,
            html: `<p>Sign in to Wattle:</p><p><a href="${url}">Sign in</a></p><p>This link expires in 10 minutes and works once. If you didn't request it, ignore this email.</p>`,
          });
        },
      }),
    ]
  : [];

export const auth = betterAuth({
  appName: "Wattle",
  baseURL: process.env.BETTER_AUTH_URL,
  secret: process.env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, { provider: "sqlite", schema }),

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

  rateLimit: {
    enabled: true,
    window: 60,
    max: 60,
    customRules: {
      "/sign-in/magic-link": { window: 60 * 10, max: 3 },
    },
  },

  onAPIError: {
    errorURL: "/sign-in",
  },

  // nextCookies stays last: it lets server actions set auth cookies.
  plugins: [...emailLinkPlugins, nextCookies()],
});

export type Session = typeof auth.$Infer.Session;

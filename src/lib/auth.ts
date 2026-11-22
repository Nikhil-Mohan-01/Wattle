import "server-only";
import { betterAuth } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { emailOTP } from "better-auth/plugins";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import * as schema from "@/db/schema";
import { emailEnabled, emailProblem, googleEnabled, microsoftEnabled, normalizeEmail } from "./auth-policy";
import { clientIp, trustedIpHeader } from "./client-ip";
import { checkCodeEmail, deliverCode, EmailCodeError } from "./email-code";
import { consume } from "./rate-limit";

/**
 * Sign-in methods:
 * - Student email + 6-digit code (codes, not links, because university mail
 *   scanners open links and would use up one-time sign-in links). Signing in
 *   this way also verifies the student email.
 * - Microsoft or Google, with any account. These only sign you in; you still
 *   verify a student email with a code before you can play (lib/student.ts).
 *
 * Accounts are never merged automatically by matching email addresses. Each
 * sign-in method is its own account, which closes "nOAuth"-style takeovers
 * where an attacker controls the email claim of an OAuth identity.
 */

const socialProviders = {
  ...(microsoftEnabled()
    ? {
        microsoft: {
          clientId: process.env.MICROSOFT_CLIENT_ID!,
          clientSecret: process.env.MICROSOFT_CLIENT_SECRET!,
          // Any Microsoft account: personal, or any school's.
          tenantId: "common",
          // Basic sign-in scopes only (no Graph access) keep consent minimal.
          disableDefaultScope: true,
          scope: ["openid", "profile", "email"],
          disableProfilePhoto: true,
          prompt: "select_account" as const,
        },
      }
    : {}),
  ...(googleEnabled()
    ? {
        google: {
          clientId: process.env.GOOGLE_CLIENT_ID!,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
          prompt: "select_account" as const,
        },
      }
    : {}),
};

const emailPlugins = emailEnabled()
  ? [
      emailOTP({
        otpLength: 6,
        expiresIn: 10 * 60,
        allowedAttempts: 3,
        storeOTP: "hashed",
        // The address and rate limits are checked in hooks.before (below), so
        // the user gets a real error; the library sends this in the background.
        async sendVerificationOTP({ email, otp, type }) {
          if (type !== "sign-in") return;
          await deliverCode(email, otp);
        },
      }),
    ]
  : [];

function apiErrorFor(err: EmailCodeError): APIError {
  const status = err.kind === "invalid" ? "BAD_REQUEST" : err.kind === "rate_limited" ? "TOO_MANY_REQUESTS" : "SERVICE_UNAVAILABLE";
  return new APIError(status, { message: err.message });
}

export const auth = betterAuth({
  appName: "Wattle",
  baseURL: process.env.BETTER_AUTH_URL,
  secret: process.env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, { provider: "pg", schema }),
  socialProviders,

  account: {
    accountLinking: { enabled: false, disableImplicitLinking: true },
  },

  // Endpoints Wattle doesn't use stay off, so they can't be abused.
  disabledPaths: [
    "/email-otp/verify-email",
    "/email-otp/check-verification-otp",
    "/email-otp/request-email-change",
    "/email-otp/change-email",
    "/email-otp/request-password-reset",
    "/email-otp/reset-password",
    "/forget-password/email-otp",
    "/sign-up/email",
    "/sign-in/email",
    "/update-user",
    "/change-email",
    "/delete-user",
    "/link-social",
  ],

  user: {
    additionalFields: {
      handle: { type: "string", required: false, input: false },
      faculty: { type: "string", required: false, input: false },
      studentEmail: { type: "string", required: false, input: false },
      studentVerifiedAt: { type: "date", required: false, input: false },
    },
    // Code sign-in must be with a student email (the send step checks this
    // too). OAuth sign-ins can use any account.
    validateUserInfo({ user, source }) {
      if (source.method === "email-otp") {
        const problem = emailProblem(String(user.email ?? ""));
        if (problem) return { error: "not_student_email", message: problem };
      }
    },
  },

  databaseHooks: {
    user: {
      create: {
        // Signing in with a student email + code proves the student email.
        async before(user, ctx) {
          if (ctx?.path !== "/sign-in/email-otp") return;
          const email = normalizeEmail(user.email);
          if (emailProblem(email)) return false;
          return { data: { ...user, studentEmail: email, studentVerifiedAt: new Date() } };
        },
      },
    },
  },

  session: {
    expiresIn: 60 * 60 * 24 * 30,
    updateAge: 60 * 60 * 24,
  },

  // Better Auth's own per-IP limits, stored in the shared database table so
  // they survive restarts and apply across server processes. When the client
  // IP is unknown (no TRUSTED_IP_HEADER), these rules are skipped rather than
  // putting every student into one shared bucket; the per-recipient and
  // global email limits still apply.
  rateLimit: {
    enabled: true,
    window: 60,
    max: 100,
    customStorage: {
      consume: (key, rule) => consume(`ba:${key}`, rule.window, rule.max),
    },
    customRules: {
      "/sign-in/*": (req) => (clientIp(req.headers) ? { window: 60, max: 20 } : false),
      "/email-otp/*": (req) => (clientIp(req.headers) ? { window: 60, max: 20 } : false),
    },
  },

  advanced: {
    ipAddress: {
      // Only trust the header our proxy sets. Without one, read no header at
      // all, so a spoofed x-forwarded-for can't pick the rate-limit bucket.
      ipAddressHeaders: [trustedIpHeader() ?? "x-wattle-no-trusted-ip-header"],
    },
  },

  hooks: {
    // Validate and rate-limit code emails before the request is accepted.
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path === "/sign-in/email-otp") {
        // A code may only sign in to an account that *is* that student email.
        // If a Microsoft/Google account already uses this address as its
        // (provider-supplied, possibly unverified) email, refuse, so nobody
        // can pre-create an account under a student's address and later share
        // it with them.
        const email = normalizeEmail(String((ctx.body as { email?: unknown })?.email ?? ""));
        const existing = await db.query.user.findFirst({
          where: eq(schema.user.email, email),
          columns: { studentEmail: true },
        });
        if (existing && existing.studentEmail !== email) {
          throw new APIError("FORBIDDEN", {
            message: "This email is used by a Microsoft or Google sign-in. Use that button instead.",
          });
        }
        return;
      }
      if (ctx.path !== "/email-otp/send-verification-otp") return;
      const body = (ctx.body ?? {}) as { email?: unknown; type?: unknown };
      if (body.type !== "sign-in") throw new APIError("BAD_REQUEST", { message: "Unsupported request." });
      try {
        await checkCodeEmail(String(body.email ?? ""), ctx.headers ?? ctx.request?.headers);
      } catch (err) {
        if (err instanceof EmailCodeError) throw apiErrorFor(err);
        throw err;
      }
    }),
  },

  onAPIError: {
    errorURL: "/sign-in",
  },

  // nextCookies stays last: it lets server actions set auth cookies.
  plugins: [...emailPlugins, nextCookies()],
});

export type Session = typeof auth.$Infer.Session;

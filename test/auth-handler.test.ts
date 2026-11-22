// End-to-end checks of the real Better Auth handler: email-code sign-in and
// security findings SEC-001 and SEC-002 (see docs/security-fixes.md). Uses
// synthetic addresses and the in-memory test database; no email is sent.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sent: { to: string; text: string; subject: string }[] = [];

vi.mock("@/lib/email", () => {
  class EmailNotConfiguredError extends Error {}
  return {
    EmailNotConfiguredError,
    consoleEmailAllowed: () => false,
    emailConfigured: () => true,
    sendEmail: async (mail: { to: string; text: string; subject: string }) => {
      sent.push(mail);
    },
  };
});

const BASE = "https://wattle.test";

type Auth = { handler: (req: Request) => Promise<Response> };

async function loadAuth(env: Record<string, string>): Promise<Auth> {
  vi.resetModules();
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("BETTER_AUTH_URL", BASE);
  vi.stubEnv("BETTER_AUTH_SECRET", "synthetic-test-secret-that-is-at-least-32-chars");
  vi.stubEnv("MICROSOFT_CLIENT_ID", "");
  vi.stubEnv("MICROSOFT_CLIENT_SECRET", "");
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
  const { db } = await import("@/db/client");
  const { rateLimitBucket } = await import("@/db/schema");
  await db.delete(rateLimitBucket);
  return (await import("@/lib/auth")).auth as unknown as Auth;
}

function post(auth: Auth, path: string, body: unknown, headers: Record<string, string> = {}) {
  return auth.handler(
    new Request(`${BASE}/api/auth${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: BASE, ...headers },
      body: JSON.stringify(body),
    }),
  );
}

function requestLink(auth: Auth, email: string, headers: Record<string, string> = {}) {
  return post(auth, "/email-otp/send-verification-otp", { email, type: "sign-in" }, headers);
}

const codeFor = (to: string) => sent.filter((m) => m.to === to).at(-1)?.subject.slice(0, 6) ?? "";

let n = 0;
const fresh = () => `probe_${Date.now()}_${n++}@uwaterloo.ca`;

beforeEach(() => {
  sent.length = 0;
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("email-code sign-in", () => {
  it("signs in with the emailed code and records the student email", async () => {
    const auth = await loadAuth({ SMTP_URL: "smtp://mock" });
    const email = fresh();
    expect((await requestLink(auth, email)).status).toBe(200);
    const code = codeFor(email);
    expect(code).toMatch(/^\d{6}$/);

    const res = await post(auth, "/sign-in/email-otp", { email, otp: code });
    expect(res.status).toBe(200);
    expect(res.headers.get("set-cookie")).toMatch(/session_token/);

    const { db } = await import("@/db/client");
    const { user } = await import("@/db/schema");
    const { eq } = await import("drizzle-orm");
    const row = await db.query.user.findFirst({ where: eq(user.email, email) });
    expect(row?.studentEmail).toBe(email);
  });

  it("rejects wrong codes and burns the code after 3 tries", async () => {
    const auth = await loadAuth({ SMTP_URL: "smtp://mock" });
    const email = fresh();
    await requestLink(auth, email);
    const code = codeFor(email);
    const wrong = code === "000000" ? "111111" : "000000";
    for (let i = 0; i < 3; i++) {
      expect((await post(auth, "/sign-in/email-otp", { email, otp: wrong })).status).not.toBe(200);
    }
    // Even the right code no longer works.
    expect((await post(auth, "/sign-in/email-otp", { email, otp: code })).status).not.toBe(200);
  });

  it("won't sign in by code to an OAuth account that merely claims the address", async () => {
    const auth = await loadAuth({ SMTP_URL: "smtp://mock" });
    const email = fresh();
    const { db } = await import("@/db/client");
    const { user } = await import("@/db/schema");
    // e.g. created by "Continue with Microsoft" with an unverified email claim
    await db.insert(user).values({ id: `oauth-${email}`, name: "x", email, emailVerified: true });
    await requestLink(auth, email);
    const res = await post(auth, "/sign-in/email-otp", { email, otp: codeFor(email) });
    expect(res.status).toBe(403);
    expect(res.headers.get("set-cookie") ?? "").not.toMatch(/session_token=[^;]/);
  });

  it("keeps unused account endpoints switched off", async () => {
    const auth = await loadAuth({ SMTP_URL: "smtp://mock" });
    for (const path of ["/sign-up/email", "/update-user", "/email-otp/request-password-reset", "/change-email"]) {
      expect((await post(auth, path, {})).status, path).toBe(404);
    }
  });
});

describe("SEC-001: no sign-in emails without a mail server", () => {
  it("disables the email-code endpoint in production without SMTP", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const auth = await loadAuth({ SMTP_URL: "" });
    const res = await requestLink(auth, fresh());
    expect(res.status).toBe(404);
    expect(sent).toHaveLength(0);
    expect(log.mock.calls.flat().join(" ")).not.toMatch(/Wattle code/);
    log.mockRestore();
  });
});

describe("SEC-002: abuse limits", () => {
  it("caps links per recipient no matter how forwarding headers change", async () => {
    const auth = await loadAuth({ SMTP_URL: "smtp://mock", TRUSTED_IP_HEADER: "" });
    const to = fresh();
    const statuses = [];
    for (let i = 0; i < 5; i++) {
      const res = await requestLink(auth, to, { "x-forwarded-for": `198.51.100.${i}` });
      statuses.push(res.status);
    }
    expect(statuses).toEqual([200, 200, 200, 429, 429]);
    expect(sent).toHaveLength(3);
  });

  it("ignores spoofed x-forwarded-for when a trusted IP header is configured", async () => {
    const auth = await loadAuth({ SMTP_URL: "smtp://mock", TRUSTED_IP_HEADER: "cf-connecting-ip" });
    const statuses: number[] = [];
    // Same real client IP, a new spoofed x-forwarded-for and recipient every time.
    for (let i = 0; i < 22; i++) {
      const res = await requestLink(auth, fresh(), {
        "cf-connecting-ip": "203.0.113.7",
        "x-forwarded-for": `198.51.100.${i}`,
      });
      statuses.push(res.status);
    }
    expect(statuses.slice(0, 20).every((s) => s === 200)).toBe(true);
    expect(statuses.slice(20)).toEqual([429, 429]);

    // A different real client is unaffected (e.g. another student behind NAT is
    // still limited separately from this one).
    const other = await requestLink(auth, fresh(), { "cf-connecting-ip": "203.0.113.8" });
    expect(other.status).toBe(200);
  });

  it("counts rejected addresses against the IP budget without storing them", async () => {
    const auth = await loadAuth({ SMTP_URL: "smtp://mock", TRUSTED_IP_HEADER: "cf-connecting-ip" });
    const ip = { "cf-connecting-ip": "203.0.113.9" };
    for (let i = 0; i < 20; i++) {
      const res = await requestLink(auth, `victim${i}@example.invalid`, ip);
      expect(res.status).toBe(400);
    }
    expect((await requestLink(auth, fresh(), ip)).status).toBe(429);

    const { db } = await import("@/db/client");
    const { rateLimitBucket } = await import("@/db/schema");
    const keys = (await db.select({ key: rateLimitBucket.key }).from(rateLimitBucket)).map((r) => r.key);
    expect(keys.some((k) => k.includes("example.invalid"))).toBe(false);
  });
});

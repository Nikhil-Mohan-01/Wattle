// End-to-end checks of the real Better Auth handler for security findings
// SEC-001 and SEC-002 (see docs/security-fixes.md). Uses synthetic addresses
// and the disposable test database; no email is sent.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sent: { to: string; text: string }[] = [];

vi.mock("@/lib/email", () => {
  class EmailNotConfiguredError extends Error {}
  return {
    EmailNotConfiguredError,
    consoleEmailAllowed: () => false,
    emailConfigured: () => true,
    sendEmail: async (mail: { to: string; text: string }) => {
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
  vi.stubEnv("AUTH_EMAIL_LINK_ENABLED", "true");
  vi.stubEnv("MICROSOFT_CLIENT_ID", "");
  vi.stubEnv("MICROSOFT_CLIENT_SECRET", "");
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
  const { db } = await import("@/db/client");
  const { rateLimitBucket } = await import("@/db/schema");
  await db.delete(rateLimitBucket);
  return (await import("@/lib/auth")).auth as unknown as Auth;
}

function requestLink(auth: Auth, email: string, headers: Record<string, string> = {}) {
  return auth.handler(
    new Request(`${BASE}/api/auth/sign-in/magic-link`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: BASE, ...headers },
      body: JSON.stringify({ email, callbackURL: "/welcome" }),
    }),
  );
}

let n = 0;
const fresh = () => `probe_${Date.now()}_${n++}@uwaterloo.ca`;

beforeEach(() => {
  sent.length = 0;
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("SEC-001: no sign-in links without a mail server", () => {
  it("disables the email-link endpoint in production without SMTP", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const auth = await loadAuth({ SMTP_URL: "" });
    const res = await requestLink(auth, fresh());
    expect(res.status).toBe(404);
    expect(sent).toHaveLength(0);
    expect(log.mock.calls.flat().join(" ")).not.toContain("magic-link/verify");
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

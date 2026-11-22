import { afterEach, describe, expect, it, vi } from "vitest";
import { consume } from "@/lib/rate-limit";
import { clientIp } from "@/lib/client-ip";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("shared rate limiter", () => {
  it("allows up to max hits, then blocks with retryAfter", async () => {
    const key = `t:${Math.random()}`;
    for (let i = 0; i < 3; i++) expect((await consume(key, 60, 3)).allowed).toBe(true);
    const blocked = await consume(key, 60, 3);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfter).toBeGreaterThan(0);
  });

  it("is atomic under parallel requests", async () => {
    const key = `t:${Math.random()}`;
    const results = await Promise.all(Array.from({ length: 25 }, () => consume(key, 60, 5)));
    expect(results.filter((r) => r.allowed)).toHaveLength(5);
  });
});

describe("client IP", () => {
  const h = (o: Record<string, string>) => new Headers(o);

  it("ignores x-forwarded-for unless it is the configured trusted header", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("TRUSTED_IP_HEADER", "");
    expect(clientIp(h({ "x-forwarded-for": "1.2.3.4" }))).toBeNull();
  });

  it("reads only the trusted header and rejects lists or junk", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("TRUSTED_IP_HEADER", "cf-connecting-ip");
    expect(clientIp(h({ "cf-connecting-ip": "1.2.3.4", "x-forwarded-for": "9.9.9.9" }))).toBe("1.2.3.4");
    expect(clientIp(h({ "cf-connecting-ip": "1.2.3.4, 5.6.7.8" }))).toBeNull();
    expect(clientIp(h({ "cf-connecting-ip": "not-an-ip" }))).toBeNull();
    expect(clientIp(h({ "x-forwarded-for": "1.2.3.4" }))).toBeNull();
  });
});

describe("email sending", () => {
  it("refuses to log emails outside development when SMTP is missing", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SMTP_URL", "");
    vi.resetModules();
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const { sendEmail, EmailNotConfiguredError } = await import("@/lib/email");
    await expect(
      sendEmail({ to: "a@uwaterloo.ca", subject: "s", text: "SECRET-LINK", html: "SECRET-LINK" }),
    ).rejects.toBeInstanceOf(EmailNotConfiguredError);
    const printed = [...log.mock.calls, ...err.mock.calls].flat().join(" ");
    expect(printed).not.toContain("SECRET-LINK");
    log.mockRestore();
    err.mockRestore();
  });

  it("disables email codes in production without SMTP", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SMTP_URL", "");
    const { emailEnabled } = await import("@/lib/auth-policy");
    expect(emailEnabled()).toBe(false);
    vi.stubEnv("SMTP_URL", "smtps://u:p@smtp.example.com:465");
    expect(emailEnabled()).toBe(true);
  });
});

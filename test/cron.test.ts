import { afterEach, describe, expect, it, vi } from "vitest";
import { isAuthorizedCron } from "@/lib/cron-auth";

const req = (auth?: string) =>
  new Request("https://wattle.test/api/cron/daily", { headers: auth ? { authorization: auth } : {} });

afterEach(() => vi.unstubAllEnvs());

describe("cron authorization", () => {
  const secret = "s".repeat(32);

  it("accepts only the exact bearer secret", () => {
    expect(isAuthorizedCron(req(`Bearer ${secret}`), secret)).toBe(true);
    expect(isAuthorizedCron(req(`Bearer ${secret}x`), secret)).toBe(false);
    expect(isAuthorizedCron(req(secret), secret)).toBe(false);
    expect(isAuthorizedCron(req(), secret)).toBe(false);
  });

  it("refuses everything when no strong secret is configured", () => {
    expect(isAuthorizedCron(req("Bearer "), "")).toBe(false);
    expect(isAuthorizedCron(req("Bearer short"), "short")).toBe(false);
  });

  it("the daily route rejects unauthenticated calls and runs with the secret", async () => {
    vi.stubEnv("CRON_SECRET", secret);
    vi.stubEnv("WATTLE_DEV_DATE", "2030-01-12"); // a Saturday: no puzzle needed
    const { GET } = await import("@/app/api/cron/daily/route");
    expect((await GET(req())).status).toBe(401);
    const ok = await GET(req(`Bearer ${secret}`));
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ date: "2030-01-12", puzzle: "none (weekend)" });
  });
});

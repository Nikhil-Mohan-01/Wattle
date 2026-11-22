import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { checkProductionConfig } from "@/lib/config-check";

const good = {
  BETTER_AUTH_SECRET: "x".repeat(40),
  BETTER_AUTH_URL: "https://wattle.example",
  PUZZLE_SECRET: "y".repeat(32),
  MICROSOFT_CLIENT_ID: "id",
  MICROSOFT_CLIENT_SECRET: "secret",
  SMTP_URL: "smtps://u:p@smtp.example.com:465",
  TRUSTED_IP_HEADER: "cf-connecting-ip",
  DATABASE_URL: "postgresql://u:p@db.example:6543/postgres",
  CRON_SECRET: "z".repeat(32),
};

function rootWithContent() {
  const root = mkdtempSync(path.join(tmpdir(), "wattle-cfg-"));
  mkdirSync(path.join(root, "content", "private"), { recursive: true });
  for (const f of ["quads.json", "deepcut.json"]) writeFileSync(path.join(root, "content", "private", f), "[]");
  return root;
}

describe("production config check", () => {
  it("accepts a complete configuration", () => {
    expect(checkProductionConfig(good, rootWithContent())).toEqual({ errors: [], warnings: [] });
  });

  it("rejects missing secrets, http URLs and no sign-in method", () => {
    const { errors } = checkProductionConfig({}, rootWithContent());
    expect(errors.join("\n")).toMatch(/BETTER_AUTH_SECRET/);
    expect(errors.join("\n")).toMatch(/BETTER_AUTH_URL/);
    expect(errors.join("\n")).toMatch(/PUZZLE_SECRET/);
    expect(errors.join("\n")).toMatch(/SMTP_URL/);
    const http = checkProductionConfig({ ...good, BETTER_AUTH_URL: "http://wattle.example" }, rootWithContent());
    expect(http.errors).toContain("BETTER_AUTH_URL must use https.");
  });

  it("requires a Postgres database", () => {
    const { errors } = checkProductionConfig({ ...good, DATABASE_URL: "pglite://./data/pglite" }, rootWithContent());
    expect(errors.join()).toMatch(/postgres:\/\//);
  });

  it("requires sign-in provider credentials in pairs", () => {
    const { errors } = checkProductionConfig({ ...good, GOOGLE_CLIENT_ID: "id" }, rootWithContent());
    expect(errors.join()).toMatch(/GOOGLE_CLIENT_SECRET/);
  });

  it("warns about risky but workable settings", () => {
    const { errors, warnings } = checkProductionConfig(
      { ...good, TRUSTED_IP_HEADER: "", CRON_SECRET: "" },
      mkdtempSync(path.join(tmpdir(), "wattle-cfg-")),
    );
    expect(errors).toEqual([]);
    const all = warnings.join("\n");
    expect(all).toMatch(/TRUSTED_IP_HEADER/);
    expect(all).toMatch(/CRON_SECRET/);
    expect(all).toMatch(/content\/private\/quads.json/);
  });
});

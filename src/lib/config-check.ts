import { existsSync } from "node:fs";
import path from "node:path";

export type ConfigReport = { errors: string[]; warnings: string[] };

type Env = Record<string, string | undefined>;

/** Content files that hold answers and should be private in production. */
const PRIVATE_CONTENT = ["quads.json", "deepcut.json"];

/**
 * Checks production settings. Errors are settings the app can't run safely
 * without; warnings are things that work but probably aren't intended.
 */
export function checkProductionConfig(env: Env, root = process.cwd()): ConfigReport {
  const errors: string[] = [];
  const warnings: string[] = [];

  const secret = env.BETTER_AUTH_SECRET ?? "";
  if (secret.length < 32) errors.push("BETTER_AUTH_SECRET must be set to at least 32 characters.");

  const url = env.BETTER_AUTH_URL ?? "";
  try {
    const u = new URL(url);
    const local = u.hostname === "localhost" || u.hostname === "127.0.0.1";
    if (u.protocol !== "https:" && !local) errors.push("BETTER_AUTH_URL must use https.");
  } catch {
    errors.push("BETTER_AUTH_URL must be set to the app's public URL.");
  }

  if ((env.PUZZLE_SECRET ?? "").length < 16) {
    errors.push("PUZZLE_SECRET must be set to at least 16 characters (it decides each day's puzzle).");
  }

  const microsoft = Boolean(env.MICROSOFT_CLIENT_ID && env.MICROSOFT_CLIENT_SECRET);
  const emailWanted = (env.AUTH_EMAIL_LINK_ENABLED ?? "true") === "true";
  const email = emailWanted && Boolean(env.SMTP_URL);
  if (microsoft && !env.MICROSOFT_TENANT_ID) {
    errors.push("MICROSOFT_TENANT_ID must be set so only Waterloo accounts can sign in.");
  }
  if (!microsoft && !email) {
    errors.push("No sign-in method is configured: set the MICROSOFT_* variables and/or SMTP_URL.");
  }
  if (emailWanted && !env.SMTP_URL) {
    warnings.push("Email-link sign-in is switched off because SMTP_URL is not set.");
  }

  if (!env.TRUSTED_IP_HEADER) {
    warnings.push("TRUSTED_IP_HEADER is not set, so per-IP rate limits are skipped.");
  }
  if (!env.DATABASE_URL || env.DATABASE_URL.startsWith("file:")) {
    warnings.push("DATABASE_URL points at a local SQLite file; use a hosted database for multiple instances.");
  }
  if (env.WATTLE_DEV_DATE) warnings.push("WATTLE_DEV_DATE is set but ignored in production.");

  for (const file of PRIVATE_CONTENT) {
    if (!existsSync(path.join(root, "content", "private", file))) {
      warnings.push(`content/private/${file} is missing; using the public example puzzles.`);
    }
  }

  return { errors, warnings };
}

/**
 * Logs warnings and, if there are errors, exits so the host sees a failed
 * start instead of a server that answers every request with a 500.
 */
export function enforceProductionConfig(): void {
  const { errors, warnings } = checkProductionConfig(process.env);
  for (const w of warnings) console.warn(`[config] ${w}`);
  if (errors.length === 0) return;
  for (const e of errors) console.error(`[config] ${e}`);
  console.error(`[config] Wattle is misconfigured (${errors.length} problem(s)); exiting.`);
  process.exit(1);
}

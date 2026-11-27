import { existsSync } from "node:fs";
import path from "node:path";

export type ConfigReport = { errors: string[]; warnings: string[] };

type Env = Record<string, string | undefined>;

/** Content banks that hold answers; in production they come from content/encrypted/. */
const BANKS = ["quads-bank.json", "deepcut-bank.json"];

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

  // Every player verifies a student email with a code, so email must work.
  if (!env.SMTP_URL) {
    errors.push("SMTP_URL must be set: students verify their email with a code.");
  }
  if (Boolean(env.MICROSOFT_CLIENT_ID) !== Boolean(env.MICROSOFT_CLIENT_SECRET)) {
    errors.push("Set both MICROSOFT_CLIENT_ID and MICROSOFT_CLIENT_SECRET, or neither.");
  }
  if (Boolean(env.GOOGLE_CLIENT_ID) !== Boolean(env.GOOGLE_CLIENT_SECRET)) {
    errors.push("Set both GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET, or neither.");
  }

  if (!env.TRUSTED_IP_HEADER) {
    warnings.push("TRUSTED_IP_HEADER is not set, so per-IP rate limits are skipped.");
  }
  if (!/^postgres(ql)?:\/\//.test(env.DATABASE_URL ?? "")) {
    errors.push("DATABASE_URL must be a postgres:// URL (e.g. Supabase) in production.");
  }
  if ((env.CRON_SECRET ?? "").length < 16) {
    warnings.push("CRON_SECRET is not set (16+ characters), so the daily job is refused and Supabase may pause.");
  }
  if (env.WATTLE_DEV_DATE) warnings.push("WATTLE_DEV_DATE is set but ignored in production.");

  const encrypted = BANKS.filter((f) => existsSync(path.join(root, "content", "encrypted", `${f}.enc`)));
  if (encrypted.length > 0 && Buffer.from(env.CONTENT_KEY ?? "", "base64").length !== 32) {
    errors.push("CONTENT_KEY must be set (32 bytes, base64) to decrypt the puzzle banks.");
  }
  for (const file of BANKS) {
    const present = ["encrypted", "private"].some((dir) =>
      existsSync(path.join(root, "content", dir, dir === "encrypted" ? `${file}.enc` : file)),
    );
    if (!present) warnings.push(`No ${file} bank found; using the public example content.`);
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

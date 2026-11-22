import "server-only";
import { emailProblem, normalizeEmail } from "./auth-policy";
import { clientIp } from "./client-ip";
import { EmailNotConfiguredError, sendEmail } from "./email";
import { consume, pruneExpired } from "./rate-limit";

/**
 * Limits for every email Wattle sends a code to (sign-in codes and student
 * email codes share them). IP limits apply only when the real client IP is
 * known (TRUSTED_IP_HEADER); the per-recipient and global caps always apply.
 */
export const EMAIL_LIMITS = {
  perIp: { windowSec: 10 * 60, max: 20 }, // generous for students behind campus NAT
  perRecipient: { windowSec: 10 * 60, max: 3 },
  perRecipientDaily: { windowSec: 24 * 60 * 60, max: 10 },
  global: { windowSec: 10 * 60, max: 500 },
};

export class EmailCodeError extends Error {
  constructor(
    public kind: "invalid" | "rate_limited" | "unavailable",
    message: string,
  ) {
    super(message);
  }
}

function tooMany(retryAfter: number | null): never {
  const wait = retryAfter ? ` Try again in ${Math.ceil(retryAfter / 60)} min.` : "";
  throw new EmailCodeError("rate_limited", `Too many code emails.${wait}`);
}

/**
 * Validates the address and applies the abuse limits for one code email.
 * Returns the normalized address. Throws EmailCodeError.
 */
export async function checkCodeEmail(rawEmail: string, headers: Headers | undefined): Promise<string> {
  // 1. Per IP, counted before validation so rejected addresses use up the
  //    budget too. Keys are IPs only, never the rejected address.
  const ip = clientIp(headers);
  if (ip) {
    const r = await consume(`ml:ip:${ip}`, EMAIL_LIMITS.perIp.windowSec, EMAIL_LIMITS.perIp.max);
    if (!r.allowed) tooMany(r.retryAfter);
  }

  // Expired counters can hold email addresses; clear them on every send.
  await pruneExpired();

  // 2. Only student addresses.
  const problem = emailProblem(rawEmail);
  if (problem) throw new EmailCodeError("invalid", problem);
  const to = normalizeEmail(rawEmail);

  // 3. Global cap (bounds total email volume and counter rows), then a
  //    per-recipient cooldown so no inbox can be flooded from any number of
  //    sources.
  const g = await consume("ml:global", EMAIL_LIMITS.global.windowSec, EMAIL_LIMITS.global.max);
  if (!g.allowed) tooMany(g.retryAfter);
  for (const [key, rule] of [
    [`ml:to:${to}`, EMAIL_LIMITS.perRecipient],
    [`ml:to-day:${to}`, EMAIL_LIMITS.perRecipientDaily],
  ] as const) {
    const r = await consume(key, rule.windowSec, rule.max);
    if (!r.allowed) tooMany(r.retryAfter);
  }
  return to;
}

/** Emails a code to an address that already passed checkCodeEmail. */
export async function deliverCode(to: string, code: string): Promise<void> {
  // Defence in depth: never email a code to a non-student address.
  if (emailProblem(to)) throw new EmailCodeError("invalid", "Not a student email.");
  try {
    await sendEmail({
      to,
      subject: `${code} is your Wattle code`,
      text: `Your Wattle code is ${code}\n\nIt expires in 10 minutes. If you didn't ask for it, ignore this email.`,
      html: `<p>Your Wattle code is</p><p style="font-size:28px;font-weight:bold;letter-spacing:4px">${code}</p><p>It expires in 10 minutes. If you didn't ask for it, ignore this email.</p>`,
    });
  } catch (err) {
    if (err instanceof EmailCodeError) throw err;
    if (err instanceof EmailNotConfiguredError) {
      throw new EmailCodeError("unavailable", "Email is unavailable right now.");
    }
    throw err;
  }
}

/** Checks, rate-limits and emails a code. */
export async function sendCodeEmail(rawEmail: string, code: string, headers: Headers | undefined) {
  await deliverCode(await checkCodeEmail(rawEmail, headers), code);
}

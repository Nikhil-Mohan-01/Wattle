import "server-only";
import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { studentCode, user } from "@/db/schema";
import { normalizeEmail } from "./auth-policy";
import { sendCodeEmail } from "./email-code";
import { universityForEmail } from "./universities";

const CODE_TTL_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;

export class StudentVerifyError extends Error {
  constructor(
    public kind: "no_code" | "expired" | "wrong_code" | "too_many_attempts" | "taken" | "already_verified",
    message: string,
  ) {
    super(message);
  }
}

function isUniqueViolation(err: unknown): boolean {
  const e = err as { code?: string; cause?: { code?: string } };
  return e?.code === "23505" || e?.cause?.code === "23505";
}

function hashCode(userId: string, email: string, code: string): string {
  const secret = process.env.BETTER_AUTH_SECRET || "wattle-dev-secret";
  return createHmac("sha256", secret).update(`${userId}|${email}|${code}`).digest("hex");
}

export function newCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

/**
 * Emails a 6-digit code to the student address the signed-in user entered.
 * Replaces any earlier pending code. Throws EmailCodeError for bad addresses,
 * rate limits or email outages.
 */
export async function startStudentVerification(userId: string, rawEmail: string, headers?: Headers) {
  const me = await db.query.user.findFirst({ where: eq(user.id, userId), columns: { studentEmail: true } });
  if (me?.studentEmail) throw new StudentVerifyError("already_verified", "Your student email is already verified.");

  const email = normalizeEmail(rawEmail);
  const code = newCode();
  // Send first: it validates the address and applies the rate limits.
  await sendCodeEmail(email, code, headers);

  const row = {
    userId,
    email,
    codeHash: hashCode(userId, email, code),
    attempts: 0,
    expiresAt: new Date(Date.now() + CODE_TTL_MS),
    createdAt: new Date(),
  };
  await db.insert(studentCode).values(row).onConflictDoUpdate({ target: studentCode.userId, set: row });
  return { email };
}

/**
 * Checks the code and, if it matches, makes the address this account's
 * student email. Five wrong tries cancel the code.
 */
export async function finishStudentVerification(userId: string, rawCode: string): Promise<string> {
  const pending = await db.query.studentCode.findFirst({ where: eq(studentCode.userId, userId) });
  if (!pending) throw new StudentVerifyError("no_code", "Request a new code first.");
  if (pending.expiresAt.getTime() < Date.now()) {
    await db.delete(studentCode).where(eq(studentCode.userId, userId));
    throw new StudentVerifyError("expired", "That code expired. Request a new one.");
  }
  if (pending.attempts >= MAX_ATTEMPTS) {
    await db.delete(studentCode).where(eq(studentCode.userId, userId));
    throw new StudentVerifyError("too_many_attempts", "Too many wrong codes. Request a new one.");
  }

  const code = rawCode.replace(/\D/g, "");
  const given = Buffer.from(hashCode(userId, pending.email, code));
  const expected = Buffer.from(pending.codeHash);
  if (code.length !== 6 || !timingSafeEqual(given, expected)) {
    // Count the attempt atomically so parallel guesses can't skip the limit.
    const [row] = await db
      .update(studentCode)
      .set({ attempts: pending.attempts + 1 })
      .where(and(eq(studentCode.userId, userId), eq(studentCode.attempts, pending.attempts)))
      .returning({ attempts: studentCode.attempts });
    const left = MAX_ATTEMPTS - (row?.attempts ?? MAX_ATTEMPTS);
    throw new StudentVerifyError("wrong_code", left > 0 ? `Wrong code. ${left} tries left.` : "Wrong code. Request a new one.");
  }

  // Single-use: claim the code before using it.
  const claimed = await db
    .delete(studentCode)
    .where(and(eq(studentCode.userId, userId), eq(studentCode.codeHash, pending.codeHash)))
    .returning({ userId: studentCode.userId });
  if (claimed.length === 0) throw new StudentVerifyError("no_code", "Request a new code first.");

  try {
    const updated = await db
      .update(user)
      .set({
        studentEmail: pending.email,
        studentVerifiedAt: new Date(),
        university: universityForEmail(pending.email)?.id ?? null,
        updatedAt: new Date(),
      })
      .where(and(eq(user.id, userId), isNull(user.studentEmail)))
      .returning({ id: user.id });
    if (updated.length === 0) throw new StudentVerifyError("already_verified", "Your student email is already verified.");
  } catch (err) {
    if (err instanceof StudentVerifyError || !isUniqueViolation(err)) throw err;
    // Another account already verified this address.
    throw new StudentVerifyError(
      "taken",
      "That student email belongs to another Wattle account. Sign in with that email instead.",
    );
  }
  return pending.email;
}

import "server-only";
import { createHmac } from "node:crypto";
import { and, eq, lt } from "drizzle-orm";
import { db } from "@/db/client";
import { playTombstone } from "@/db/schema";
import { normalizeEmail } from "./auth-policy";
import { addDays } from "./time";

/** One-way, keyed hash of an email so tombstones can't be reversed into addresses. */
export function emailHash(email: string): string {
  const secret = process.env.BETTER_AUTH_SECRET || "wattle-dev-secret";
  return createHmac("sha256", secret).update(normalizeEmail(email)).digest("hex");
}

/** Remember that this email already played on these dates. */
export async function addTombstones(email: string, dates: string[], today: string): Promise<void> {
  const hash = emailHash(email);
  // Only today (and later) can still be played, so nothing older is worth keeping.
  await db.delete(playTombstone).where(lt(playTombstone.date, addDays(today, -1)));
  const keep = dates.filter((d) => d >= today);
  if (keep.length === 0) return;
  await db
    .insert(playTombstone)
    .values(keep.map((date) => ({ emailHash: hash, date })))
    .onConflictDoNothing();
}

export async function hasTombstone(email: string, date: string): Promise<boolean> {
  // Tombstones are only needed for the day they were made; clear older ones.
  await db.delete(playTombstone).where(lt(playTombstone.date, date));
  const row = await db.query.playTombstone.findFirst({
    where: and(eq(playTombstone.emailHash, emailHash(email)), eq(playTombstone.date, date)),
  });
  return Boolean(row);
}

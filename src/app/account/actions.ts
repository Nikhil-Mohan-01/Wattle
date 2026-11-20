"use server";

import { eq, inArray } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/db/client";
import { play, rateLimitBucket, user } from "@/db/schema";
import { auth } from "@/lib/auth";
import { normalizeEmail } from "@/lib/auth-policy";
import { getCurrentUser } from "@/lib/session";
import { currentPuzzleDate } from "@/lib/today";
import { addTombstones } from "@/lib/tombstone";

export type DeleteState = { error: string | null };

/**
 * Permanently deletes the signed-in player's account: profile, sessions,
 * linked sign-in accounts and every play (all cascade from the user row).
 * The player must type their leaderboard name to confirm.
 */
export async function deleteAccount(_prev: DeleteState, form: FormData): Promise<DeleteState> {
  const current = await getCurrentUser();
  if (!current) redirect("/sign-in");

  const typed = String(form.get("confirm") ?? "").trim();
  const expected = current.handle ?? current.email;
  if (typed.toLowerCase() !== expected.toLowerCase()) {
    return { error: `Type ${expected} exactly to confirm.` };
  }

  // Keep only a hashed record of today's attempt, so deleting the account and
  // signing back in can't be used to replay today's puzzle.
  const played = await db.select({ date: play.date }).from(play).where(eq(play.userId, current.id));
  await addTombstones(current.email, played.map((p) => p.date), currentPuzzleDate());

  // Sign out first so the session cookie is cleared, then delete everything.
  await auth.api.signOut({ headers: await headers() });
  await db.delete(user).where(eq(user.id, current.id));

  // Drop sign-in rate-limit counters that contain the email address.
  const email = normalizeEmail(current.email);
  await db.delete(rateLimitBucket).where(inArray(rateLimitBucket.key, [`ml:to:${email}`, `ml:to-day:${email}`]));
  redirect("/?deleted=1");
}

"use server";

import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/db/client";
import { user } from "@/db/schema";
import { auth } from "@/lib/auth";
import { getCurrentUser } from "@/lib/session";

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

  // Sign out first so the session cookie is cleared, then delete everything.
  await auth.api.signOut({ headers: await headers() });
  await db.delete(user).where(eq(user.id, current.id));
  redirect("/?deleted=1");
}

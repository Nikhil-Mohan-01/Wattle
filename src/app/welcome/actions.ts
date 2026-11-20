"use server";

import { and, eq, isNull, sql } from "drizzle-orm";
import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db/client";
import { user } from "@/db/schema";
import { isFacultyId } from "@/lib/faculties";
import { getCurrentUser } from "@/lib/session";

export type WelcomeState = { error: string | null };

const HANDLE_RE = /^[A-Za-z0-9_]{3,20}$/;

export async function saveProfile(_prev: WelcomeState, form: FormData): Promise<WelcomeState> {
  const current = await getCurrentUser();
  if (!current) redirect("/sign-in");

  const handle = String(form.get("handle") ?? "").trim();
  const faculty = String(form.get("faculty") ?? "");

  if (!HANDLE_RE.test(handle)) {
    return { error: "Names are 3–20 characters: letters, numbers and underscores." };
  }
  if (!isFacultyId(faculty)) return { error: "Pick your faculty." };

  const taken = await db
    .select({ id: user.id })
    .from(user)
    .where(sql`lower(${user.handle}) = ${handle.toLowerCase()}`)
    .limit(1);
  if (taken.length && taken[0].id !== current.id) return { error: "That name is taken." };

  try {
    // Only fills in a profile that hasn't been set, so the faculty can't be
    // switched later to move points between faculty leaderboards.
    await db
      .update(user)
      .set({ handle, faculty, updatedAt: new Date() })
      .where(and(eq(user.id, current.id), isNull(user.handle)));
  } catch {
    // Unique index race: someone grabbed the name between the check and the write.
    return { error: "That name is taken." };
  }

  // Re-render the header so it shows the new name.
  refresh();
  redirect("/");
}

import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "./auth";

export type CurrentUser = {
  id: string;
  email: string;
  /** Verified student email; null until the player confirms one with a code. */
  studentEmail: string | null;
  /** University id (lib/universities.ts), set with the student email. */
  university: string | null;
  handle: string | null;
  faculty: string | null;
};

export type Player = CurrentUser & { studentEmail: string; university: string; handle: string; faculty: string };

/** The signed-in user, or null. Reads the request, so call it inside <Suspense>. */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;
  const u = session.user as typeof session.user & Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" && v ? v : null);
  return {
    id: u.id,
    email: u.email,
    studentEmail: str(u.studentEmail),
    university: str(u.university),
    handle: str(u.handle),
    faculty: str(u.faculty),
  };
}

/** True once the user has a verified student email and a profile. */
export function isPlayer(user: CurrentUser | null): user is Player {
  return Boolean(user?.studentEmail && user.university && user.handle && user.faculty);
}

/** Requires a signed-in user who has finished the welcome steps. */
export async function requirePlayer(): Promise<Player> {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");
  if (!isPlayer(user)) redirect("/welcome");
  return user;
}

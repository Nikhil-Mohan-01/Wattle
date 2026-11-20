import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "./auth";

export type CurrentUser = {
  id: string;
  email: string;
  handle: string | null;
  faculty: string | null;
};

/** The signed-in user, or null. Reads the request, so call it inside <Suspense>. */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;
  const u = session.user;
  return {
    id: u.id,
    email: u.email,
    handle: (u.handle as string | null | undefined) ?? null,
    faculty: (u.faculty as string | null | undefined) ?? null,
  };
}

/** Requires a signed-in user who has finished the welcome step. */
export async function requirePlayer(): Promise<CurrentUser & { handle: string; faculty: string }> {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");
  if (!user.handle || !user.faculty) redirect("/welcome");
  return user as CurrentUser & { handle: string; faculty: string };
}

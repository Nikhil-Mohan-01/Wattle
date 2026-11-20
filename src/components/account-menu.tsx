import Link from "next/link";
import { getCurrentUser } from "@/lib/session";
import { facultyName } from "@/lib/faculties";
import { SignOutButton } from "./sign-out-button";

export async function AccountMenu() {
  const user = await getCurrentUser();
  if (!user) {
    return (
      <Link
        href="/sign-in"
        className="rounded-lg bg-gold px-3 py-1.5 text-sm font-semibold text-black hover:opacity-90"
      >
        Sign in
      </Link>
    );
  }
  return (
    <div className="flex items-center gap-3 text-sm">
      {user.handle ? (
        <Link href="/account" className="hover:underline" title="Your account">
          <span className="font-semibold">{user.handle}</span>
          <span className="text-muted"> · {facultyName(user.faculty)}</span>
        </Link>
      ) : (
        <Link href="/welcome" className="text-gold-deep underline">
          Finish setup
        </Link>
      )}
      <SignOutButton />
    </div>
  );
}

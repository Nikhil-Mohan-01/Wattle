import { Suspense } from "react";
import { count, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db/client";
import { play } from "@/db/schema";
import { facultyName } from "@/lib/faculties";
import { getCurrentUser } from "@/lib/session";
import { DeleteAccountForm } from "./delete-form";

export default function AccountPage() {
  return (
    <div className="mx-auto max-w-lg space-y-6 py-4">
      <h1 className="text-2xl font-bold">Your account</h1>
      <Suspense fallback={<p className="text-muted">Loading…</p>}>
        <AccountDetails />
      </Suspense>
    </div>
  );
}

async function AccountDetails() {
  const me = await getCurrentUser();
  if (!me) redirect("/sign-in");
  const [{ plays }] = await db.select({ plays: count() }).from(play).where(eq(play.userId, me.id));

  return (
    <>
      <p className="text-sm text-muted">Your emails are never shown to other players.</p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 rounded-xl border border-line bg-card p-5 text-sm">
        <dt className="text-muted">Signed in as</dt>
        <dd>{me.email}</dd>
        <dt className="text-muted">Student email</dt>
        <dd>{me.studentEmail ?? "Not verified"}</dd>
        <dt className="text-muted">Leaderboard name</dt>
        <dd>{me.handle ?? "Not set"}</dd>
        <dt className="text-muted">Faculty</dt>
        <dd>{facultyName(me.faculty)}</dd>
        <dt className="text-muted">Games played</dt>
        <dd>{plays}</dd>
      </dl>

      <section className="space-y-3 rounded-xl border border-red-400/40 p-5">
        <h2 className="font-semibold">Delete account</h2>
        <p className="text-sm text-muted">
          This permanently deletes your profile, your sign-in sessions and every game you&apos;ve
          played, and removes you from all leaderboards. It can&apos;t be undone.
        </p>
        <DeleteAccountForm confirmText={me.handle ?? me.email} />
      </section>
    </>
  );
}

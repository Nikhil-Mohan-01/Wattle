import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { FACULTIES } from "@/lib/faculties";
import { WelcomeForm } from "./welcome-form";

export default function WelcomePage() {
  return (
    <div className="mx-auto max-w-sm space-y-6 py-8">
      <div className="space-y-1 text-center">
        <h1 className="text-2xl font-bold">Welcome to Wattle</h1>
        <p className="text-sm text-muted">
          Pick the name shown on the leaderboard and the faculty you play for. Your email is never
          shown publicly.
        </p>
      </div>
      <Suspense fallback={<p className="text-center text-sm text-muted">Loading…</p>}>
        <WelcomeGate />
      </Suspense>
    </div>
  );
}

async function WelcomeGate() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");
  if (user.handle && user.faculty) redirect("/");
  return <WelcomeForm faculties={FACULTIES.map((f) => ({ id: f.id, name: f.name }))} />;
}

import { Suspense } from "react";
import { redirect } from "next/navigation";
import { allowedDomains } from "@/lib/auth-policy";
import { FACULTIES } from "@/lib/faculties";
import { getCurrentUser, isPlayer } from "@/lib/session";
import { StudentForm } from "./student-form";
import { WelcomeForm } from "./welcome-form";

export default function WelcomePage() {
  return (
    <div className="mx-auto max-w-sm space-y-6 py-8">
      <Suspense fallback={<p className="text-center text-sm text-muted">Loading…</p>}>
        <WelcomeGate />
      </Suspense>
    </div>
  );
}

async function WelcomeGate() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");
  if (isPlayer(user)) redirect("/");

  if (!user.studentEmail) {
    return (
      <>
        <Header
          step="Step 1 of 2"
          title="Confirm you're a student"
          text="Wattle is for university students. Enter your student email and we'll send a 6-digit code. It's never shown publicly."
        />
        <StudentForm example={`you@${allowedDomains()[0]}`} />
      </>
    );
  }

  return (
    <>
      <Header
        step="Step 2 of 2"
        title="Welcome to Wattle"
        text="Pick the name shown on the leaderboard and the faculty you play for."
      />
      <WelcomeForm faculties={FACULTIES.map((f) => ({ id: f.id, name: f.name }))} />
    </>
  );
}

function Header({ step, title, text }: { step: string; title: string; text: string }) {
  return (
    <div className="space-y-1 text-center">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">{step}</p>
      <h1 className="text-2xl font-bold">{title}</h1>
      <p className="text-sm text-muted">{text}</p>
    </div>
  );
}

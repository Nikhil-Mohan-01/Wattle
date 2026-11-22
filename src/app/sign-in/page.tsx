import { Suspense } from "react";
import { emailEnabled, googleEnabled, microsoftEnabled } from "@/lib/auth-policy";
import { enabledUniversities } from "@/lib/universities";
import { SignInForm } from "./sign-in-form";

export default function SignInPage() {
  return (
    <div className="mx-auto max-w-sm space-y-6 py-8">
      <div className="space-y-1 text-center">
        <h1 className="text-2xl font-bold">Sign in to Wattle</h1>
        <p className="text-sm text-muted">Wattle is for university students: you&apos;ll confirm a student email to play.</p>
      </div>
      <Suspense>
        <SignInForm
          microsoft={microsoftEnabled()}
          google={googleEnabled()}
          email={emailEnabled()}
          example="you@uwaterloo.ca"
        />
      </Suspense>
      <p className="text-center text-xs text-muted">
        Open to: {enabledUniversities().map((u) => u.shortName).join(", ")}.
      </p>
    </div>
  );
}

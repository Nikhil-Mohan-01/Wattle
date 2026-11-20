import { Suspense } from "react";
import { emailLinkEnabled, microsoftEnabled } from "@/lib/auth-policy";
import { SignInForm } from "./sign-in-form";

export default function SignInPage() {
  return (
    <div className="mx-auto max-w-sm space-y-6 py-8">
      <div className="space-y-1 text-center">
        <h1 className="text-2xl font-bold">Sign in to Wattle</h1>
        <p className="text-sm text-muted">Only Waterloo students can play and appear on the leaderboard.</p>
      </div>
      <Suspense>
        <SignInForm microsoft={microsoftEnabled()} emailLink={emailLinkEnabled()} />
      </Suspense>
    </div>
  );
}

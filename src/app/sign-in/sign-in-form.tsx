"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { authClient } from "@/lib/auth-client";

const ERROR_MESSAGES: Record<string, string> = {
  account_not_linked:
    "An account with this email already exists. Sign in the way you did the first time.",
  not_student_email: "Use your student email.",
  access_denied: "Sign-in was cancelled.",
};

const input = "w-full rounded-lg border border-line bg-card px-3 py-3 outline-none focus:border-gold";

type Props = { microsoft: boolean; google: boolean; email: boolean; example: string };

export function SignInForm({ microsoft, google, email: emailOn, example }: Props) {
  const router = useRouter();
  const urlError = useSearchParams().get("error");
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(
    urlError ? (ERROR_MESSAGES[urlError] ?? "Sign-in failed. Please try again.") : null,
  );

  async function social(provider: "microsoft" | "google") {
    setError(null);
    const res = await authClient.signIn.social({ provider, callbackURL: "/welcome", errorCallbackURL: "/sign-in" });
    if (res.error) setError(res.error.message ?? "Couldn't start sign-in.");
  }

  async function sendCode(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const res = await authClient.emailOtp.sendVerificationOtp({ email, type: "sign-in" });
    setBusy(false);
    if (res.error) {
      setError(res.error.status === 429 ? "Too many requests. Wait a few minutes." : (res.error.message ?? "Couldn't send the code."));
      return;
    }
    setStep("code");
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const res = await authClient.signIn.emailOtp({ email, otp: code.replace(/\D/g, "") });
    setBusy(false);
    if (res.error) {
      setError(res.error.message ?? "That code didn't work. Request a new one.");
      return;
    }
    router.push("/welcome");
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {error && (
        <p role="alert" className="rounded-lg border border-red-400/50 bg-red-500/10 p-3 text-sm">
          {error}
        </p>
      )}

      {microsoft && (
        <button onClick={() => social("microsoft")} className="flex w-full items-center justify-center gap-2 rounded-lg border border-line bg-card px-4 py-3 font-semibold hover:border-gold">
          <MicrosoftLogo /> Continue with Microsoft
        </button>
      )}
      {google && (
        <button onClick={() => social("google")} className="flex w-full items-center justify-center gap-2 rounded-lg border border-line bg-card px-4 py-3 font-semibold hover:border-gold">
          <GoogleLogo /> Continue with Google
        </button>
      )}

      {(microsoft || google) && emailOn && (
        <div className="flex items-center gap-3 text-xs text-muted">
          <div className="h-px flex-1 bg-line" />
          or use your student email
          <div className="h-px flex-1 bg-line" />
        </div>
      )}

      {emailOn && step === "email" && (
        <form onSubmit={sendCode} className="space-y-2">
          <label htmlFor="email" className="sr-only">
            Student email
          </label>
          <input id="email" type="email" required autoComplete="email" placeholder={example} value={email} onChange={(e) => setEmail(e.target.value)} className={input} />
          <button type="submit" disabled={busy} className="w-full rounded-lg bg-gold px-4 py-3 font-semibold text-black hover:opacity-90 disabled:opacity-60">
            {busy ? "Sending…" : "Email me a code"}
          </button>
        </form>
      )}

      {emailOn && step === "code" && (
        <form onSubmit={verify} className="space-y-2">
          <p className="text-sm text-muted">
            We sent a 6-digit code to <span className="font-medium text-foreground">{email}</span>. It expires in 10 minutes.
          </p>
          <label htmlFor="code" className="sr-only">
            6-digit code
          </label>
          <input id="code" required autoFocus inputMode="numeric" autoComplete="one-time-code" maxLength={7} placeholder="123456" value={code} onChange={(e) => setCode(e.target.value)} className={`${input} text-center font-mono text-2xl tracking-[0.4em]`} />
          <button type="submit" disabled={busy} className="w-full rounded-lg bg-gold px-4 py-3 font-semibold text-black hover:opacity-90 disabled:opacity-60">
            {busy ? "Checking…" : "Sign in"}
          </button>
          <div className="flex justify-between text-xs text-muted">
            <span>Check your junk folder if it hasn&apos;t arrived.</span>
            <button type="button" onClick={() => { setStep("email"); setCode(""); setError(null); }} className="underline">
              Change email
            </button>
          </div>
        </form>
      )}

      {!microsoft && !google && !emailOn && <p className="text-center text-sm text-muted">Sign-in isn&apos;t configured yet.</p>}
    </div>
  );
}

function MicrosoftLogo() {
  return (
    <svg width="16" height="16" viewBox="0 0 21 21" aria-hidden>
      <rect x="1" y="1" width="9" height="9" fill="#f25022" />
      <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
      <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
      <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
    </svg>
  );
}

function GoogleLogo() {
  return (
    <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

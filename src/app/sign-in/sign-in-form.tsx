"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { authClient } from "@/lib/auth-client";

const ERROR_MESSAGES: Record<string, string> = {
  not_waterloo: "That account isn't a Waterloo account. Use your @uwaterloo.ca address.",
  wrong_tenant: "Sign in with your Waterloo Microsoft account, not a personal one.",
  INVALID_TOKEN: "That sign-in link is invalid or was already used. Request a new one.",
  EXPIRED_TOKEN: "That sign-in link expired. Request a new one.",
  ATTEMPTS_EXCEEDED: "That sign-in link was already used. Request a new one.",
};

export function SignInForm({ microsoft, emailLink }: { microsoft: boolean; emailLink: boolean }) {
  const params = useSearchParams();
  const urlError = params.get("error");
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(
    urlError ? (ERROR_MESSAGES[urlError] ?? "Sign-in failed. Please try again.") : null,
  );

  async function signInWithMicrosoft() {
    setError(null);
    const res = await authClient.signIn.social({
      provider: "microsoft",
      callbackURL: "/welcome",
      errorCallbackURL: "/sign-in",
    });
    if (res.error) setError(res.error.message ?? "Couldn't start Microsoft sign-in.");
  }

  async function sendLink(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setStatus("sending");
    const res = await authClient.signIn.magicLink({
      email,
      callbackURL: "/welcome",
      errorCallbackURL: "/sign-in",
    });
    if (res.error) {
      setStatus("idle");
      setError(
        res.error.status === 429
          ? "Too many requests. Wait a few minutes and try again."
          : (res.error.message ?? "Couldn't send the link."),
      );
      return;
    }
    setStatus("sent");
  }

  if (status === "sent") {
    return (
      <div className="rounded-xl border border-line bg-card p-5 text-center">
        <p className="font-semibold">Check your inbox</p>
        <p className="mt-1 text-sm text-muted">
          We sent a sign-in link to <span className="font-medium text-foreground">{email}</span>. It
          expires in 10 minutes. Check your junk folder if it doesn&apos;t arrive.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error && (
        <p role="alert" className="rounded-lg border border-red-400/50 bg-red-500/10 p-3 text-sm">
          {error}
        </p>
      )}

      {microsoft && (
        <button
          onClick={signInWithMicrosoft}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-foreground px-4 py-3 font-semibold text-background hover:opacity-90"
        >
          <MicrosoftLogo />
          Continue with Waterloo (Microsoft)
        </button>
      )}

      {microsoft && emailLink && (
        <div className="flex items-center gap-3 text-xs text-muted">
          <div className="h-px flex-1 bg-line" />
          or get an email link
          <div className="h-px flex-1 bg-line" />
        </div>
      )}

      {emailLink && (
        <form onSubmit={sendLink} className="space-y-2">
          <label htmlFor="email" className="sr-only">
            Waterloo email
          </label>
          <input
            id="email"
            type="email"
            required
            autoComplete="email"
            placeholder="watiam@uwaterloo.ca"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-lg border border-line bg-card px-3 py-3 outline-none focus:border-gold"
          />
          <button
            type="submit"
            disabled={status === "sending"}
            className="w-full rounded-lg border border-line bg-card px-4 py-3 font-semibold hover:border-gold disabled:opacity-60"
          >
            {status === "sending" ? "Sending…" : "Email me a sign-in link"}
          </button>
        </form>
      )}

      {!microsoft && !emailLink && (
        <p className="text-center text-sm text-muted">Sign-in isn&apos;t configured yet.</p>
      )}
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

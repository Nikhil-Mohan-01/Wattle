"use client";

import { useActionState } from "react";
import { studentStep, type StudentState } from "./student-actions";

const input = "w-full rounded-lg border border-line bg-card px-3 py-3 outline-none focus:border-gold";
const button =
  "w-full rounded-lg bg-gold px-4 py-3 font-semibold text-black hover:opacity-90 disabled:opacity-60";

export function StudentForm({ example }: { example: string }) {
  const [state, action, pending] = useActionState<StudentState, FormData>(studentStep, {
    step: "email",
    email: "",
    error: null,
  });

  return (
    <div className="space-y-4">
      {state.error && (
        <p role="alert" className="rounded-lg border border-red-400/50 bg-red-500/10 p-3 text-sm">
          {state.error}
        </p>
      )}

      {state.step === "email" ? (
        <form action={action} className="space-y-2">
          <input type="hidden" name="intent" value="send" />
          <label htmlFor="student-email" className="text-sm font-medium">
            Your student email
          </label>
          <input
            id="student-email"
            name="email"
            type="email"
            required
            autoComplete="email"
            placeholder={example}
            defaultValue={state.email}
            className={input}
          />
          <button type="submit" disabled={pending} className={button}>
            {pending ? "Sending…" : "Email me a code"}
          </button>
        </form>
      ) : (
        <form action={action} className="space-y-2">
          <p className="text-sm text-muted">
            We sent a 6-digit code to <span className="font-medium text-foreground">{state.email}</span>. It
            expires in 10 minutes.
          </p>
          <label htmlFor="code" className="sr-only">
            6-digit code
          </label>
          <input
            id="code"
            name="code"
            required
            autoFocus
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9 ]{6,7}"
            maxLength={7}
            placeholder="123456"
            className={`${input} text-center font-mono text-2xl tracking-[0.4em]`}
          />
          {/* Named submit buttons pick the intent; Enter uses the first one. */}
          <button type="submit" name="intent" value="verify" disabled={pending} className={button}>
            {pending ? "Checking…" : "Verify"}
          </button>
          <div className="flex justify-between text-xs text-muted">
            <span>Check your junk folder if it hasn&apos;t arrived.</span>
            <button type="submit" name="intent" value="restart" formNoValidate className="underline">
              Change email
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

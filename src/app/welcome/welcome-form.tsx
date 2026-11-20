"use client";

import { useActionState } from "react";
import { saveProfile, type WelcomeState } from "./actions";

export function WelcomeForm({ faculties }: { faculties: { id: string; name: string }[] }) {
  const [state, action, pending] = useActionState<WelcomeState, FormData>(saveProfile, {
    error: null,
  });

  return (
    <form action={action} className="space-y-4">
      {state.error && (
        <p role="alert" className="rounded-lg border border-red-400/50 bg-red-500/10 p-3 text-sm">
          {state.error}
        </p>
      )}

      <div className="space-y-1">
        <label htmlFor="handle" className="text-sm font-medium">
          Leaderboard name
        </label>
        <input
          id="handle"
          name="handle"
          required
          minLength={3}
          maxLength={20}
          pattern="[A-Za-z0-9_]{3,20}"
          placeholder="goose_whisperer"
          className="w-full rounded-lg border border-line bg-card px-3 py-3 outline-none focus:border-gold"
        />
        <p className="text-xs text-muted">3–20 letters, numbers or underscores.</p>
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Faculty</legend>
        <div className="grid grid-cols-2 gap-2">
          {faculties.map((f) => (
            <label
              key={f.id}
              className="flex cursor-pointer items-center gap-2 rounded-lg border border-line bg-card px-3 py-2 has-[:checked]:border-gold"
            >
              <input type="radio" name="faculty" value={f.id} required className="accent-gold" />
              {f.name}
            </label>
          ))}
        </div>
        <p className="text-xs text-muted">This can&apos;t be changed later.</p>
      </fieldset>

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-gold px-4 py-3 font-semibold text-black hover:opacity-90 disabled:opacity-60"
      >
        {pending ? "Saving…" : "Start playing"}
      </button>
    </form>
  );
}

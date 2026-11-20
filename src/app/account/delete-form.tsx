"use client";

import { useActionState } from "react";
import { deleteAccount, type DeleteState } from "./actions";

export function DeleteAccountForm({ confirmText }: { confirmText: string }) {
  const [state, action, pending] = useActionState<DeleteState, FormData>(deleteAccount, { error: null });
  return (
    <form action={action} className="space-y-2">
      <label htmlFor="confirm" className="block text-sm">
        Type <span className="font-mono font-semibold">{confirmText}</span> to confirm
      </label>
      <input
        id="confirm"
        name="confirm"
        required
        autoComplete="off"
        className="w-full rounded-lg border border-line bg-card px-3 py-2 outline-none focus:border-red-400"
      />
      {state.error && (
        <p role="alert" className="text-sm text-red-500">
          {state.error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
      >
        {pending ? "Deleting…" : "Delete my account"}
      </button>
    </form>
  );
}

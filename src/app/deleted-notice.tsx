"use client";

import { useSearchParams } from "next/navigation";

/** Confirms an account deletion after the redirect to /?deleted=1. */
export function DeletedNotice() {
  if (useSearchParams().get("deleted") !== "1") return null;
  return (
    <p role="status" className="rounded-lg border border-line bg-card p-3 text-sm">
      Your account and all your games have been deleted.
    </p>
  );
}

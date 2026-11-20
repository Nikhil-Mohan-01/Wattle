import { Suspense } from "react";
import { requirePlayer } from "@/lib/session";
import { PlayClient } from "./play-client";

export default function PlayPage() {
  return (
    <Suspense fallback={<p className="text-muted">Loading…</p>}>
      <PlayGate />
    </Suspense>
  );
}

async function PlayGate() {
  await requirePlayer();
  return <PlayClient devTools={process.env.NODE_ENV !== "production"} />;
}

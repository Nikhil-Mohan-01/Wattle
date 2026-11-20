"use client";

import { GAME_CLIENTS } from "@/games/clients";
import { useGame } from "@/games/use-game";
import { GAMES } from "@/lib/games";

export function PlayClient({ devTools }: { devTools: boolean }) {
  const { today, start, move, busy, error, reload } = useGame();

  if (!today) {
    return error ? <ErrorBox message={error} /> : <p className="text-muted">Loading today&apos;s game…</p>;
  }
  if (today.gameId === null) {
    return (
      <div className="py-12 text-center">
        <h1 className="text-2xl font-bold">No game today</h1>
        <p className="mt-2 text-muted">Games run Monday to Friday. See you Monday.</p>
      </div>
    );
  }

  const info = GAMES[today.gameId];
  const Game = GAME_CLIENTS[today.gameId];

  return (
    <div className="space-y-6">
      <header className="flex items-baseline justify-between gap-4">
        <h1 className="text-2xl font-bold">
          <span aria-hidden>{info.emoji}</span> {info.name}
        </h1>
        <span className="text-sm text-muted">{today.date}</span>
      </header>

      {Game ? (
        <Game snapshot={today} start={start} move={move} busy={busy} error={error} />
      ) : (
        <p className="text-muted">{info.name} is coming soon.</p>
      )}

      {devTools && (
        <button
          onClick={async () => {
            await fetch("/api/dev/reset", { method: "POST" });
            await reload();
          }}
          className="text-xs text-muted underline"
        >
          Dev: reset my play for today
        </button>
      )}
    </div>
  );
}

function ErrorBox({ message }: { message: string }) {
  return <p className="rounded-lg border border-red-400/50 bg-red-500/10 p-3 text-sm">{message}</p>;
}

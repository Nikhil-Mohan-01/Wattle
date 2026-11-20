"use client";

import { useCallback, useEffect, useState } from "react";
import type { GameId } from "@/lib/games";

/** Mirrors Snapshot in engine/engine.ts. `view` is typed by each game. */
export type GameSnapshot<V = unknown> = {
  date: string;
  gameId: GameId;
  status: "new" | "playing" | "done";
  view: V;
  rawScore: number | null;
  startedAt: number | null;
  finishedAt: number | null;
};

export type GameProps<V = unknown, M = unknown> = {
  snapshot: GameSnapshot<V>;
  /** Starts the player's one attempt. */
  start: () => Promise<void>;
  /** Sends a move; resolves once the new snapshot has arrived. */
  move: (move: M) => Promise<boolean>;
  busy: boolean;
  error: string | null;
};

type TodayResponse = GameSnapshot | { date: string; gameId: null };

async function call(path: string, body?: unknown) {
  const res = await fetch(path, {
    method: body === undefined ? "GET" : "POST",
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.message ?? "Request failed"), { code: data.error });
  return data;
}

export function useGame() {
  const [today, setToday] = useState<TodayResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setToday(await call("/api/game/today"));
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    // Fetching on mount; the state updates happen after the request resolves.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const run = useCallback(
    async (path: string, body: unknown) => {
      setBusy(true);
      setError(null);
      try {
        setToday(await call(path, body));
        return true;
      } catch (e) {
        const err = e as Error & { code?: string };
        setError(err.message);
        if (err.code === "stale_date" || err.code === "conflict") await load();
        return false;
      } finally {
        setBusy(false);
      }
    },
    [load],
  );

  const date = today?.date;
  const start = useCallback(async () => {
    if (date) await run("/api/game/start", { date });
  }, [date, run]);
  const move = useCallback(
    (m: unknown) => (date ? run("/api/game/move", { date, move: m }) : Promise.resolve(false)),
    [date, run],
  );

  return { today, start, move, busy, error, reload: load };
}

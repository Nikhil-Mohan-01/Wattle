import type { GameId } from "@/lib/games";
import type { Rng } from "@/lib/rng";

type Awaitable<T> = T | Promise<T>;

export type MoveContext = {
  /** Server time in ms. Never trust a time sent by the browser. */
  now: number;
  /** When this player started, in ms (server time). */
  startedAt: number;
  date: string;
};

export type MoveOutcome<S> = { ok: true; state: S; done: boolean } | { ok: false; error: string };

/**
 * A daily game, implemented entirely on the server.
 *
 * P = full puzzle (includes answers, never sent to the browser)
 * S = one player's progress
 * M = a move the browser sends
 * V = what the browser is allowed to see
 */
export interface GameModule<P = unknown, S = unknown, M = unknown, V = unknown> {
  id: GameId;

  /** Build the puzzle for a date. `recentlyUsed` lists content ids, newest first. */
  generate(args: {
    rng: Rng;
    date: string;
    recentlyUsed: string[];
  }): Awaitable<{ contentId: string; puzzle: P }>;

  initialState(puzzle: P, ctx: { now: number }): S;

  /** Validate the shape of an untrusted move. Return null to reject it. */
  parseMove(raw: unknown): M | null;

  applyMove(puzzle: P, state: S, move: M, ctx: MoveContext): Awaitable<MoveOutcome<S>>;

  /**
   * The browser's view. Must not reveal answers the player hasn't earned
   * while `done` is false.
   */
  view(puzzle: P, state: S, ctx: { done: boolean; now: number; date: string }): Awaitable<V>;

  /** Raw score for a finished play; higher is better. */
  score(puzzle: P, state: S, ctx: { date: string }): Awaitable<number>;

  /**
   * Review flags the game has raised for this play (e.g. implausible timings).
   * Merged into the play's flags after every move; flagged plays are left off
   * leaderboards.
   */
  flags?(puzzle: P, state: S): string[];

  /** Finishing faster than this (ms) flags the play for review. */
  minPlausibleMs?: number;
}

// The registry holds modules with different type parameters.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyGameModule = GameModule<any, any, any, any>;

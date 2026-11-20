import "server-only";
import { randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { play, puzzle } from "@/db/schema";
import { gameModule } from "@/games/registry";
import type { AnyGameModule } from "@/games/types";
import { SCHEDULE, type GameId } from "@/lib/games";
import { seededRng } from "@/lib/rng";
import { weekdayOf } from "@/lib/time";
import { currentPuzzleDate } from "@/lib/today";

export class GameError extends Error {
  constructor(
    public code:
      | "no_game"
      | "not_ready"
      | "stale_date"
      | "not_started"
      | "already_done"
      | "bad_move"
      | "conflict",
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

type PuzzleRow = typeof puzzle.$inferSelect;
type PlayRow = typeof play.$inferSelect;

export type Snapshot = {
  date: string;
  gameId: GameId;
  status: "new" | "playing" | "done";
  view: unknown;
  rawScore: number | null;
  startedAt: number | null;
  finishedAt: number | null;
};

const RECENT_WINDOW = 400;

function moduleFor(gameId: GameId): AnyGameModule {
  const mod = gameModule(gameId);
  if (!mod) throw new GameError("not_ready", "This game isn't available yet.", 404);
  return mod;
}

/** The game scheduled for a date, or null on weekends. */
export function scheduledGame(date: string): GameId | null {
  return SCHEDULE[weekdayOf(date)] ?? null;
}

/**
 * The puzzle for a date. Created on first request and frozen afterwards, so
 * every player gets the same puzzle and it never changes mid-day.
 */
export async function getPuzzle(date: string): Promise<PuzzleRow> {
  const existing = await db.query.puzzle.findFirst({ where: eq(puzzle.date, date) });
  if (existing) return existing;

  const gameId = scheduledGame(date);
  if (!gameId) throw new GameError("no_game", "There's no game today.", 404);
  const mod = moduleFor(gameId);

  const recent = await db
    .select({ contentId: puzzle.contentId })
    .from(puzzle)
    .where(eq(puzzle.gameId, gameId))
    .orderBy(desc(puzzle.date))
    .limit(RECENT_WINDOW);

  const { contentId, puzzle: data } = await mod.generate({
    rng: seededRng("puzzle", gameId, date),
    date,
    recentlyUsed: recent.map((r) => r.contentId),
  });

  // If two requests race to create it, the first insert wins and both read it back.
  await db.insert(puzzle).values({ date, gameId, contentId, data }).onConflictDoNothing();
  const row = await db.query.puzzle.findFirst({ where: eq(puzzle.date, date) });
  if (!row) throw new Error(`Failed to create puzzle for ${date}`);
  return row;
}

async function findPlay(userId: string, date: string): Promise<PlayRow | undefined> {
  return db.query.play.findFirst({ where: and(eq(play.userId, userId), eq(play.date, date)) });
}

async function toSnapshot(p: PuzzleRow, row: PlayRow | undefined, now: number): Promise<Snapshot> {
  const gameId = p.gameId as GameId;
  const mod = moduleFor(gameId);
  const done = row?.status === "done";
  const state = row ? row.state : mod.initialState(p.data, { now });
  return {
    date: p.date,
    gameId,
    status: row ? row.status : "new",
    view: await mod.view(p.data, state, { done, now, date: p.date }),
    rawScore: done ? (row?.rawScore ?? null) : null,
    startedAt: row ? row.startedAt.getTime() : null,
    finishedAt: row?.finishedAt ? row.finishedAt.getTime() : null,
  };
}

function assertToday(date: string) {
  if (date !== currentPuzzleDate()) {
    throw new GameError("stale_date", "That puzzle has ended. Refresh for today's game.", 409);
  }
}

/** What a player sees for today's game. Doesn't start the clock. */
export async function getSnapshot(userId: string, date: string): Promise<Snapshot> {
  const p = await getPuzzle(date);
  return toSnapshot(p, await findPlay(userId, date), Date.now());
}

/** Starts the player's one attempt for today. Calling it again is a no-op. */
export async function startPlay(userId: string, date: string): Promise<Snapshot> {
  assertToday(date);
  const p = await getPuzzle(date);
  const mod = moduleFor(p.gameId as GameId);
  const now = Date.now();
  await db
    .insert(play)
    .values({
      id: randomUUID(),
      userId,
      date,
      gameId: p.gameId,
      status: "playing",
      state: mod.initialState(p.data, { now }),
      startedAt: new Date(now),
    })
    .onConflictDoNothing();
  return toSnapshot(p, await findPlay(userId, date), now);
}

/**
 * Applies one move. Everything is checked here on the server: the date, the
 * player's own play, the move's shape and legality, and the score.
 */
export async function submitMove(userId: string, date: string, rawMove: unknown): Promise<Snapshot> {
  assertToday(date);
  const p = await getPuzzle(date);
  const mod = moduleFor(p.gameId as GameId);

  const row = await findPlay(userId, date);
  if (!row) throw new GameError("not_started", "Start the game first.");
  if (row.status === "done") throw new GameError("already_done", "You've already finished today's game.", 409);

  const move = mod.parseMove(rawMove);
  if (move === null) throw new GameError("bad_move", "Invalid move.");

  const now = Date.now();
  const outcome = await mod.applyMove(p.data, row.state, move, {
    now,
    startedAt: row.startedAt.getTime(),
    date,
  });
  if (!outcome.ok) throw new GameError("bad_move", outcome.error);

  const finished = outcome.done;
  const rawScore = finished ? await mod.score(p.data, outcome.state, { date }) : null;
  const flags: string[] = [...(row.flags ?? [])];
  if (finished && mod.minPlausibleMs && now - row.startedAt.getTime() < mod.minPlausibleMs) {
    flags.push("too_fast");
  }

  const updated = await db
    .update(play)
    .set({
      state: outcome.state,
      status: finished ? "done" : "playing",
      rawScore,
      moveCount: row.moveCount + 1,
      version: row.version + 1,
      flags: flags.length ? flags : null,
      finishedAt: finished ? new Date(now) : null,
    })
    .where(and(eq(play.id, row.id), eq(play.version, row.version)))
    .returning({ id: play.id });

  // Another move landed first (double click, parallel requests). Reject this
  // one so the same move can't be counted twice or skip a check.
  if (updated.length === 0) {
    throw new GameError("conflict", "Another move was being processed. Try again.", 409);
  }

  return toSnapshot(p, await findPlay(userId, date), now);
}

import { beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { play } from "@/db/schema";
import { GameError, getPuzzle, getSnapshot, startPlay, submitMove } from "@/engine/engine";
import { GAME_MODULES } from "@/games/registry";
import type { GameModule } from "@/games/types";
import { DATES, makePlayer } from "./helpers";

// A tiny stand-in game: guess the secret number in 3 tries.
type P = { secret: number };
type S = { guesses: number[] };
type M = { n: number };
const guessNumber: GameModule<P, S, M, { guesses: number[]; secret?: number }> = {
  id: "honk",
  generate: ({ rng }) => {
    const secret = rng.int(100);
    return { contentId: `n${secret}`, puzzle: { secret } };
  },
  initialState: () => ({ guesses: [] }),
  parseMove: (raw) =>
    raw && typeof raw === "object" && Number.isInteger((raw as M).n) ? { n: (raw as M).n } : null,
  applyMove: (p, s, m) => {
    if (m.n < 0 || m.n > 99) return { ok: false, error: "Out of range" };
    const guesses = [...s.guesses, m.n];
    return { ok: true, state: { guesses }, done: m.n === p.secret || guesses.length >= 3 };
  },
  view: (p, s, { done }) => (done ? { guesses: s.guesses, secret: p.secret } : { guesses: s.guesses }),
  score: (p, s) => (s.guesses.includes(p.secret) ? 4 - s.guesses.length : 0),
};

const today = DATES.tue;

beforeAll(() => {
  GAME_MODULES.honk = guessNumber;
  process.env.WATTLE_DEV_DATE = today;
});

describe("puzzles", () => {
  it("has no game on weekends", async () => {
    await expect(getPuzzle(DATES.sat)).rejects.toMatchObject({ code: "no_game" });
  });

  it("creates a puzzle once and freezes it", async () => {
    const a = await getPuzzle(today);
    const b = await getPuzzle(today);
    expect(a.gameId).toBe("honk");
    expect(b.data).toEqual(a.data);
  });

  it("refuses unbuilt games", async () => {
    await expect(getPuzzle(DATES.wed)).rejects.toMatchObject({ code: "not_ready" });
  });
});

describe("plays", () => {
  it("never shows the answer before the play is done", async () => {
    const uid = await makePlayer();
    const before = await getSnapshot(uid, today);
    expect(before.status).toBe("new");
    expect(JSON.stringify(before)).not.toContain("secret");

    await startPlay(uid, today);
    const { secret } = (await getPuzzle(today)).data as P;
    const wrong = (secret + 1) % 100;
    const mid = await submitMove(uid, today, { n: wrong });
    expect(mid.status).toBe("playing");
    expect(JSON.stringify(mid.view)).not.toContain("secret");
    expect(mid.rawScore).toBeNull();
  });

  it("requires starting first and only allows one play per day", async () => {
    const uid = await makePlayer();
    await expect(submitMove(uid, today, { n: 1 })).rejects.toMatchObject({ code: "not_started" });
    const first = await startPlay(uid, today);
    const second = await startPlay(uid, today);
    expect(second.startedAt).toBe(first.startedAt);
    const rows = await db.select().from(play).where(and(eq(play.userId, uid), eq(play.date, today)));
    expect(rows).toHaveLength(1);
  });

  it("scores on the server and locks the play when done", async () => {
    const uid = await makePlayer();
    await startPlay(uid, today);
    const { secret } = (await getPuzzle(today)).data as P;
    const done = await submitMove(uid, today, { n: secret });
    expect(done.status).toBe("done");
    expect(done.rawScore).toBe(3);
    expect((done.view as { secret?: number }).secret).toBe(secret);
    await expect(submitMove(uid, today, { n: secret })).rejects.toMatchObject({ code: "already_done" });
  });

  it("rejects malformed and illegal moves", async () => {
    const uid = await makePlayer();
    await startPlay(uid, today);
    await expect(submitMove(uid, today, { n: "7" })).rejects.toMatchObject({ code: "bad_move" });
    await expect(submitMove(uid, today, { n: 500 })).rejects.toMatchObject({ code: "bad_move" });
    await expect(submitMove(uid, today, null)).rejects.toMatchObject({ code: "bad_move" });
  });

  it("rejects moves for a day that isn't today", async () => {
    const uid = await makePlayer();
    await expect(startPlay(uid, DATES.mon)).rejects.toMatchObject({ code: "stale_date" });
    await expect(submitMove(uid, DATES.mon, { n: 1 })).rejects.toMatchObject({ code: "stale_date" });
  });

  it("can't be pushed past the guess limit with parallel requests", async () => {
    const uid = await makePlayer();
    await startPlay(uid, today);
    const { secret } = (await getPuzzle(today)).data as P;
    const wrong = (secret + 1) % 100;
    const results = await Promise.allSettled(
      Array.from({ length: 10 }, () => submitMove(uid, today, { n: wrong })),
    );
    for (const r of results) {
      if (r.status === "rejected") expect(r.reason).toBeInstanceOf(GameError);
    }
    const row = await db.query.play.findFirst({
      where: and(eq(play.userId, uid), eq(play.date, today)),
    });
    const guesses = (row!.state as S).guesses;
    expect(guesses.length).toBeLessThanOrEqual(3);
    expect(row!.moveCount).toBe(guesses.length);
  });

  it("keeps each player's play separate", async () => {
    const a = await makePlayer();
    const b = await makePlayer();
    await startPlay(a, today);
    const { secret } = (await getPuzzle(today)).data as P;
    await submitMove(a, today, { n: secret });
    const snapB = await getSnapshot(b, today);
    expect(snapB.status).toBe("new");
    expect(JSON.stringify(snapB.view)).not.toContain(String(secret) + "}");
  });
});

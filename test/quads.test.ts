import { beforeAll, describe, expect, it } from "vitest";
import { getPuzzle, getSnapshot, startPlay, submitMove } from "@/engine/engine";
import { GAME_MODULES } from "@/games/registry";
import { loadQuadsContent, quads, quadsScore, type QuadsPuzzle, type QuadsState } from "@/games/quads/server";
import type { QuadsView } from "@/games/quads/types";
import { seededRng } from "@/lib/rng";
import { DATES, makePlayer } from "./helpers";

const today = DATES.wed;
const ctx = { now: 0, startedAt: 0, date: today };

beforeAll(() => {
  GAME_MODULES.quads = quads;
  process.env.WATTLE_DEV_DATE = today;
});

async function makePuzzle(seed = "a"): Promise<QuadsPuzzle> {
  return (await quads.generate({ rng: seededRng("t", seed), date: today, recentlyUsed: [] })).puzzle;
}

/** Applies a move directly against the module, failing the test on rejection. */
async function play(p: QuadsPuzzle, s: QuadsState, words: string[]) {
  const move = quads.parseMove({ words });
  expect(move).not.toBeNull();
  return quads.applyMove(p, s, move!, ctx);
}

async function ok(p: QuadsPuzzle, s: QuadsState, words: string[]) {
  const out = await play(p, s, words);
  if (!out.ok) throw new Error(out.error);
  return out;
}

/** Three words from group a and one from group b. */
const oneAway = (p: QuadsPuzzle, a = 0, b = 1) => [...p.groups[a].words.slice(0, 3), p.groups[b].words[0]];
/** Two from each of two groups. */
const twoTwo = (p: QuadsPuzzle, a: number, b: number, offset = 0) => [
  ...p.groups[a].words.slice(offset, offset + 2),
  ...p.groups[b].words.slice(offset, offset + 2),
];

describe("quads content", () => {
  it("loads and validates the example set", () => {
    const all = loadQuadsContent();
    expect(all.length).toBeGreaterThanOrEqual(12);
    for (const p of all) {
      const words = p.groups.flatMap((g) => g.words.map((w) => w.toLowerCase()));
      expect(new Set(words).size).toBe(16);
      expect(p.groups.map((g) => g.difficulty).sort()).toEqual([1, 2, 3, 4]);
    }
  });
});

describe("quads module", () => {
  it("never reveals the grouping before done", async () => {
    for (const seed of ["a", "b", "c", "d", "e", "f"]) {
      const p = await makePuzzle(seed);
      const s = quads.initialState(p, { now: 0 });
      const v = await quads.view(p, s, { done: false, now: 0, date: today });
      const json = JSON.stringify(v);
      for (const g of p.groups) expect(json).not.toContain(g.category);
      expect(v.groups).toBeUndefined();
      expect(v.history).toBeUndefined();
      expect(json).not.toContain("difficulty");
      // Tiles follow the shuffled board, not the content's group order.
      expect(v.tiles).toEqual(p.order);
      expect(v.tiles).not.toEqual(p.groups.flatMap((g) => g.words));
      expect([...v.tiles].sort()).toEqual(p.groups.flatMap((g) => g.words).sort());
    }
  });

  it("locks in a correct group and reveals only that one", async () => {
    const p = await makePuzzle();
    const out = await ok(p, quads.initialState(p, { now: 0 }), p.groups[2].words);
    expect(out.done).toBe(false);
    const v = await quads.view(p, out.state, { done: false, now: 0, date: today });
    expect(v.solved).toEqual([p.groups[2]]);
    expect(v.tiles).toHaveLength(12);
    expect(v.lastResult).toBe("correct");
    expect(JSON.stringify(v)).not.toContain(p.groups[0].category);
  });

  it("reports one away and costs a mistake", async () => {
    const p = await makePuzzle();
    const out = await ok(p, quads.initialState(p, { now: 0 }), oneAway(p));
    const v = await quads.view(p, out.state, { done: false, now: 0, date: today });
    expect(v.lastResult).toBe("one_away");
    expect(v.mistakesLeft).toBe(3);

    const two = await ok(p, out.state, twoTwo(p, 0, 1));
    expect((await quads.view(p, two.state, { done: false, now: 0, date: today })).lastResult).toBe("wrong");
  });

  it("doesn't charge for repeating a wrong guess (in any order)", async () => {
    const p = await makePuzzle();
    const guess = oneAway(p);
    const first = await ok(p, quads.initialState(p, { now: 0 }), guess);
    const again = await play(p, first.state, [...guess].reverse());
    expect(again.ok).toBe(false);
    expect(first.state.mistakes).toBe(1);
  });

  it("ends the game after 4 mistakes and reveals everything", async () => {
    const p = await makePuzzle();
    let s = quads.initialState(p, { now: 0 });
    const wrongs = [twoTwo(p, 0, 1), twoTwo(p, 2, 3), twoTwo(p, 0, 2), twoTwo(p, 1, 3)];
    for (let i = 0; i < 4; i++) {
      const out = await ok(p, s, wrongs[i]);
      s = out.state;
      expect(out.done).toBe(i === 3);
    }
    expect((await play(p, s, p.groups[0].words)).ok).toBe(false);
    const v = await quads.view(p, s, { done: true, now: 0, date: today });
    expect(v.won).toBe(false);
    expect(v.groups?.map((g) => g.difficulty)).toEqual([1, 2, 3, 4]);
    expect(v.history).toHaveLength(4);
    expect(await quads.score(p, s, { date: today })).toBe(0);
  });

  it("rejects malformed and illegal moves", async () => {
    const p = await makePuzzle();
    const s = quads.initialState(p, { now: 0 });
    const w = p.order;
    for (const bad of [
      null,
      "x",
      [],
      { words: w.slice(0, 3) },
      { words: w.slice(0, 5) },
      { words: [w[0], w[0], w[1], w[2]] },
      { words: [w[0], w[1], w[2], 7] },
      { words: [w[0], w[1], w[2], "x".repeat(41)] },
    ]) {
      expect(quads.parseMove(bad)).toBeNull();
    }
    expect((await play(p, s, [w[0], w[1], w[2], "NOT A TILE"])).ok).toBe(false);
    // Case must match the board exactly.
    expect((await play(p, s, [w[0].toLowerCase(), w[1], w[2], w[3]])).ok).toBe(false);
    // Words from a solved group can't be reused.
    const solved = await ok(p, s, p.groups[0].words);
    expect((await play(p, solved.state, oneAway(p, 0, 1))).ok).toBe(false);
  });

  it("scores 100 for a perfect solve and deducts for mistakes", async () => {
    const p = await makePuzzle();
    let s = quads.initialState(p, { now: 0 });
    s = (await ok(p, s, oneAway(p, 3, 0))).state;
    for (const g of p.groups) {
      const out = await ok(p, s, g.words);
      s = out.state;
    }
    expect(await quads.score(p, s, { date: today })).toBe(95);
    const v = await quads.view(p, s, { done: true, now: 0, date: today });
    expect(v.won).toBe(true);
    expect(v.history?.[0]).toEqual([4, 4, 4, 1]);

    expect(quadsScore(4, 0)).toBe(100);
    expect(quadsScore(4, 3)).toBe(85);
    expect(quadsScore(3, 4)).toBe(55);
    expect(quadsScore(0, 4)).toBe(0);
  });
});

describe("quads through the engine", () => {
  it("plays a full game with server-side scoring and no leaks", async () => {
    const uid = await makePlayer();
    const before = await getSnapshot(uid, today);
    expect(before.gameId).toBe("quads");
    const p = (await getPuzzle(today)).data as QuadsPuzzle;
    for (const g of p.groups) expect(JSON.stringify(before)).not.toContain(g.category);

    await startPlay(uid, today);
    let snap = before;
    for (const g of p.groups) snap = await submitMove(uid, today, { words: g.words });
    expect(snap.status).toBe("done");
    expect(snap.rawScore).toBe(100);
    expect((snap.view as QuadsView).groups).toHaveLength(4);
    await expect(submitMove(uid, today, { words: p.groups[0].words })).rejects.toMatchObject({
      code: "already_done",
    });
  });
});

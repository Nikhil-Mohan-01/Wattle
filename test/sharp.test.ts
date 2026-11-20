import { beforeAll, describe, expect, it } from "vitest";
import { getPuzzle, getSnapshot, startPlay, submitMove } from "@/engine/engine";
import { GAME_MODULES } from "@/games/registry";
import {
  angleDiff,
  closeness,
  sharp,
  tempoError,
  trackSamples,
  type SharpPuzzle,
  type SharpState,
} from "@/games/sharp/server";
import type { SharpMove, SharpView } from "@/games/sharp/shared";
import type { MoveContext } from "@/games/types";
import { seededRng } from "@/lib/rng";
import { DATES, makePlayer } from "./helpers";

const date = DATES.fri;

async function fresh(seed = "a"): Promise<{ p: SharpPuzzle; s: SharpState }> {
  const { puzzle } = await sharp.generate({ rng: seededRng("t", seed), date, recentlyUsed: [] });
  return { p: puzzle, s: sharp.initialState(puzzle, { now: 0 }) };
}

const ctx = (now: number): MoveContext => ({ now, startedAt: 0, date });

async function apply(p: SharpPuzzle, s: SharpState, raw: unknown, now: number) {
  const move = sharp.parseMove(raw);
  if (!move) throw new Error("parse failed");
  return sharp.applyMove(p, s, move, ctx(now));
}

/** Applies a move that must succeed and returns the new state. */
async function ok(p: SharpPuzzle, s: SharpState, raw: unknown, now: number): Promise<SharpState> {
  const out = await apply(p, s, raw, now);
  if (!out.ok) throw new Error(out.error);
  return out.state;
}

async function view(p: SharpPuzzle, s: SharpState, now: number, done = false): Promise<SharpView> {
  return sharp.view(p, s, { done, now, date });
}

function perfectTaps(intervalMs: number, jitter = [5, -12, 8, -3, 15, -7, 2, -10]) {
  return jitter.map((j, k) => (4 + k) * intervalMs + j);
}

/** Plays all five tests with perfect answers (tempo with human-like jitter). */
async function playAll(p: SharpPuzzle, s: SharpState) {
  let t = 1000;
  const answers: (number | number[])[] = [
    p.count.dots.length,
    p.track.landingX,
    p.angle.target,
    perfectTaps(p.tempo.intervalMs),
    p.split.target,
  ];
  let done = false;
  for (const value of answers) {
    s = await ok(p, s, { type: "begin" }, t);
    t += 13 * p.tempo.intervalMs; // long enough for every window minimum
    const out = await apply(p, s, { type: "answer", value }, t);
    if (!out.ok) throw new Error(out.error);
    s = out.state;
    done = out.done;
    t += 500;
  }
  return { s, done };
}

describe("scoring", () => {
  it("uses round(100 * exp(-0.5 * (e/t)^2))", () => {
    expect(closeness(0, 8)).toBe(100);
    expect(closeness(8, 8)).toBe(61);
    expect(closeness(16, 8)).toBe(14);
    expect(closeness(0.1, 0.2)).toBe(88);
    expect(closeness(1000, 60)).toBe(0);
  });

  it("measures angles the short way round", () => {
    expect(angleDiff(355, 5)).toBe(10);
    expect(angleDiff(5, 355)).toBe(10);
    expect(angleDiff(180, 0)).toBe(180);
    expect(angleDiff(360, 0)).toBe(0);
  });

  it("measures tempo drift from the ideal grid", () => {
    expect(tempoError(perfectTaps(500, [0, 0, 0, 0, 0, 0, 0, 0]), 500)).toBe(0);
    expect(tempoError(perfectTaps(500, [10, -10, 10, -10, 10, -10, 10, -10]), 500)).toBe(10);
  });

  it("averages to the final score", async () => {
    const { p, s } = await fresh();
    const { s: end, done } = await playAll(p, s);
    expect(done).toBe(true);
    expect(end.results.map((r) => r.score).slice(0, 3)).toEqual([100, 100, 100]);
    const expected = Math.round(end.results.reduce((a, r) => a + r.score, 0) / 5);
    expect(await sharp.score(p, end, { date })).toBe(expected);
    expect(expected).toBeGreaterThan(95);
  });
});

describe("generation", () => {
  it("keeps parameters in range", async () => {
    for (const seed of ["a", "b", "c", "d", "e", "f", "g", "h"]) {
      const { p } = await fresh(seed);
      expect(p.count.dots.length).toBeGreaterThanOrEqual(40);
      expect(p.count.dots.length).toBeLessThanOrEqual(90);
      expect(p.track.landingX).toBeGreaterThanOrEqual(0);
      expect(p.track.landingX).toBeLessThanOrEqual(1000);
      expect(p.angle.target).toBeGreaterThanOrEqual(10);
      expect(p.angle.target).toBeLessThanOrEqual(350);
      for (const m of [90, 180, 270]) expect(Math.abs(p.angle.target - m)).toBeGreaterThan(4);
      expect(p.tempo.intervalMs).toBeGreaterThanOrEqual(450);
      expect(p.tempo.intervalMs).toBeLessThanOrEqual(750);
      expect(p.split.target).toBeGreaterThan(0);
      expect(p.split.target).toBeLessThan(1);
      // The sampled arc stops well short of the floor.
      const last = trackSamples(p.track).at(-1)!;
      expect(last[1]).toBeGreaterThan(0);
    }
  });

  it("uses one content id per date", async () => {
    const out = await sharp.generate({ rng: seededRng("x"), date, recentlyUsed: [] });
    expect(out.contentId).toBe(`sharp-${date}`);
  });
});

describe("order and one answer per test", () => {
  it("requires begin before answering, and one test at a time", async () => {
    const { p, s } = await fresh();
    expect((await apply(p, s, { type: "answer", value: 50 }, 5000)).ok).toBe(false);
    const s1 = await ok(p, s, { type: "begin" }, 0);
    expect((await apply(p, s1, { type: "begin" }, 10)).ok).toBe(false);
  });

  it("answers always go to the current test, so test 3 can't be answered before 2", async () => {
    const { p, s } = await fresh();
    let st = await ok(p, s, { type: "begin" }, 0);
    st = await ok(p, st, { type: "answer", value: p.count.dots.length }, 3000);
    st = await ok(p, st, { type: "begin" }, 4000);
    // Sending the angle target now is graded as a Track answer.
    st = await ok(p, st, { type: "answer", value: p.angle.target }, 9000);
    expect(st.results[1].test).toBe("track");
    expect(st.results).toHaveLength(2);
    // And Track can't be answered twice.
    expect((await apply(p, st, { type: "answer", value: p.track.landingX }, 9500)).ok).toBe(false);
  });

  it("rejects moves once all tests are done", async () => {
    const { p, s } = await fresh();
    const { s: end } = await playAll(p, s);
    expect((await apply(p, end, { type: "begin" }, 1e9)).ok).toBe(false);
  });
});

describe("time windows", () => {
  it("count: zero before 2s or after 30s, scored in between", async () => {
    const { p, s } = await fresh();
    const n = p.count.dots.length;
    const began = await ok(p, s, { type: "begin" }, 10_000);
    expect((await ok(p, began, { type: "answer", value: n }, 11_999)).results[0].score).toBe(0);
    expect((await ok(p, began, { type: "answer", value: n }, 40_001)).results[0].score).toBe(0);
    expect((await ok(p, began, { type: "answer", value: n }, 12_000)).results[0].score).toBe(100);
    const early = await ok(p, began, { type: "answer", value: n }, 10_500);
    expect(early.flags).toContain("count_early");
  });

  it("track: zero before the visible flight ends or after 60s", async () => {
    const { p, s } = await fresh();
    let st = await ok(p, s, { type: "begin" }, 0);
    st = await ok(p, st, { type: "answer", value: p.count.dots.length }, 2500);
    const began = await ok(p, st, { type: "begin" }, 10_000);
    const x = p.track.landingX;
    expect((await ok(p, began, { type: "answer", value: x }, 10_000 + p.track.visibleMs - 1)).results[1].score).toBe(0);
    expect((await ok(p, began, { type: "answer", value: x }, 70_001)).results[1].score).toBe(0);
    expect((await ok(p, began, { type: "answer", value: x }, 15_000)).results[1].score).toBe(100);
  });
});

describe("validation", () => {
  it("rejects malformed moves at parse time", () => {
    const bad: unknown[] = [
      null,
      "begin",
      [],
      {},
      { type: "start" },
      { type: "begin", extra: 1 },
      { type: "answer" },
      { type: "answer", value: "12" },
      { type: "answer", value: Number.NaN },
      { type: "answer", value: Number.POSITIVE_INFINITY },
      { type: "answer", value: [1, "2"] },
      { type: "answer", value: [] },
      { type: "answer", value: new Array(17).fill(1) },
      { type: "answer", value: 1, score: 100 },
    ];
    for (const raw of bad) expect(sharp.parseMove(raw)).toBeNull();
    expect(sharp.parseMove({ type: "begin" })).toEqual({ type: "begin" });
    expect(sharp.parseMove({ type: "answer", value: [1, 2] })).toEqual({ type: "answer", value: [1, 2] });
  });

  it("rejects out-of-range or wrong-shaped answers without using up the test", async () => {
    const { p, s } = await fresh();
    const began = await ok(p, s, { type: "begin" }, 0);
    for (const value of [-1, 1001, 12.5, [1, 2]]) {
      expect((await apply(p, began, { type: "answer", value }, 3000)).ok).toBe(false);
    }
    // Still answerable afterwards.
    expect((await apply(p, began, { type: "answer", value: 50 }, 3000)).ok).toBe(true);
  });
});

/** State with the first three tests answered and Tempo begun at `beganAt`. */
async function atTempo(beganAt: number) {
  const { p, s } = await fresh();
  let st = s;
  let t = 0;
  for (const value of [p.count.dots.length, p.track.landingX, p.angle.target]) {
    st = await ok(p, st, { type: "begin" }, t);
    st = await ok(p, st, { type: "answer", value }, t + 5000);
    t += 6000;
  }
  st = await ok(p, st, { type: "begin" }, beganAt);
  return { p, st };
}

describe("tempo plausibility", () => {
  it("scores human-like taps", async () => {
    const { p, st } = await atTempo(100_000);
    const I = p.tempo.intervalMs;
    const out = await ok(p, st, { type: "answer", value: perfectTaps(I) }, 100_000 + 12 * I + 400);
    expect(out.results[3].score).toBeGreaterThan(90);
    expect(out.flags).not.toContain("tempo_too_perfect");
  });

  it("rejects wrong length and non-monotonic taps", async () => {
    const { p, st } = await atTempo(100_000);
    const I = p.tempo.intervalMs;
    const now = 100_000 + 13 * I;
    const taps = perfectTaps(I);
    expect((await apply(p, st, { type: "answer", value: taps.slice(0, 7) }, now)).ok).toBe(false);
    expect((await apply(p, st, { type: "answer", value: [...taps, taps[7] + I] }, now)).ok).toBe(false);
    const swapped = [...taps];
    [swapped[2], swapped[3]] = [swapped[3], swapped[2]];
    expect((await apply(p, st, { type: "answer", value: swapped }, now)).ok).toBe(false);
    const dup = [...taps];
    dup[4] = dup[3];
    expect((await apply(p, st, { type: "answer", value: dup }, now)).ok).toBe(false);
    expect((await apply(p, st, { type: "answer", value: taps.map((t) => t - 4 * I) }, now)).ok).toBe(false);
  });

  it("zeroes taps that claim more time than has passed on the server", async () => {
    const { p, st } = await atTempo(100_000);
    const I = p.tempo.intervalMs;
    const taps = perfectTaps(I);
    // Answer arrives before the taps could physically have happened.
    const out = await ok(p, st, { type: "answer", value: taps }, 100_000 + taps[7] - 500);
    expect(out.results[3].score).toBe(0);
    expect(out.flags).toContain("tempo_implausible");
    // Far too soon after begin.
    const fast = await ok(p, st, { type: "answer", value: taps }, 100_000 + 5 * I);
    expect(fast.results[3].score).toBe(0);
    // Way too late.
    const late = await ok(p, st, { type: "answer", value: taps }, 100_000 + 12 * I + 30_000);
    expect(late.results[3].score).toBe(0);
  });

  it("flags machine-perfect taps", async () => {
    const { p, st } = await atTempo(100_000);
    const I = p.tempo.intervalMs;
    const exact = perfectTaps(I, [0, 0, 0, 0, 0, 0, 0, 0]);
    const out = await ok(p, st, { type: "answer", value: exact }, 100_000 + 13 * I);
    expect(out.results[3].score).toBe(100);
    expect(out.flags).toContain("tempo_too_perfect");
  });
});

describe("hidden values", () => {
  it("never shows the dot count, landing x or targets before they're needed", async () => {
    const { p, s } = await fresh();
    const v0 = await view(p, s, 0);
    expect(v0.active).toBeNull();
    expect(v0.reveal).toBeNull();
    expect(JSON.stringify(v0)).not.toContain("dots");

    // Count: dots only during the 2s show window.
    let st = await ok(p, s, { type: "begin" }, 0);
    const showing = await view(p, st, 500);
    expect(showing.active).toMatchObject({ test: "count" });
    expect(showing.active && "dots" in showing.active && showing.active.dots).toHaveLength(p.count.dots.length);
    const hidden = await view(p, st, 2000);
    expect(JSON.stringify(hidden)).not.toContain("dots");

    // Track: visible samples only, never the landing x or launch formula.
    st = await ok(p, st, { type: "answer", value: 50 }, 3000);
    st = await ok(p, st, { type: "begin" }, 4000);
    const tv = await view(p, st, 4000);
    const json = JSON.stringify(tv);
    expect(json).not.toContain("landing");
    expect(json).not.toContain("vx");
    // No standalone number equal to the landing x (substrings like 496.2 are fine).
    expect(json).not.toMatch(new RegExp(`[\\[,:]${Math.round(p.track.landingX)}[,\\]}]`));
    if (tv.active?.test !== "track") throw new Error("expected track");
    const lastX = tv.active.samples.at(-1)![0];
    // The visible arc ends well before the landing point.
    expect(Math.abs(lastX - p.track.landingX)).toBeGreaterThan(100);
  });

  it("reveals true values once done", async () => {
    const { p, s } = await fresh();
    const { s: end } = await playAll(p, s);
    const v = await view(p, end, 1e9, true);
    expect(v.active).toBeNull();
    expect(v.results).toHaveLength(5);
    expect(v.reveal).toMatchObject({
      count: p.count.dots.length,
      angleTarget: p.angle.target,
      tempoIntervalMs: p.tempo.intervalMs,
      splitTarget: p.split.target,
    });
    expect(v.total).toBe(await sharp.score(p, end, { date }));
  });
});

describe("through the engine", () => {
  beforeAll(() => {
    GAME_MODULES.sharp = sharp;
    process.env.WATTLE_DEV_DATE = date;
  });

  it("starts, begins Count, and voids an instant answer", async () => {
    const uid = await makePlayer();
    const before = await getSnapshot(uid, date);
    expect(JSON.stringify(before)).not.toContain("dots");
    await startPlay(uid, date);
    const began = await submitMove(uid, date, { type: "begin" } satisfies SharpMove);
    const v = began.view as SharpView;
    expect(v.active?.test).toBe("count");
    const p = (await getPuzzle(date)).data as SharpPuzzle;
    const after = await submitMove(uid, date, { type: "answer", value: p.count.dots.length });
    expect((after.view as SharpView).results[0].score).toBe(0);
    expect(after.status).toBe("playing");
  });
});

import "server-only";
import type { GameModule, MoveOutcome } from "@/games/types";
import type { Rng } from "@/lib/rng";
import {
  COUNT_BOX,
  COUNT_DOT_R,
  COUNT_SHOW_MS,
  TEMPO_REF_BEATS,
  TEMPO_TAPS,
  TESTS,
  TRACK_BOX,
  type ActiveTest,
  type SharpMove,
  type SharpView,
  type TestName,
  type TestResult,
} from "./shared";

// ---------------------------------------------------------------------------
// Puzzle and state
// ---------------------------------------------------------------------------

export type TrackParams = {
  x0: number;
  y0: number;
  vx: number;
  vy: number;
  /** Gravity, box units / s². */
  g: number;
  /** Total flight time, seconds. */
  flightS: number;
  /** How long the ball is visible, ms. */
  visibleMs: number;
  landingX: number;
};

export type SharpPuzzle = {
  count: { dots: [number, number][] };
  track: TrackParams;
  angle: { target: number };
  tempo: { intervalMs: number };
  split: { num: number; den: number; from: "left" | "right"; target: number };
};

export type StoredResult = TestResult & {
  /** Raw error in the test's own unit (fraction, box units, degrees, ms); -1 if voided. */
  error: number;
  answer: number | number[];
};

export type SharpState = {
  results: StoredResult[];
  /** Server time the running test began; null between tests. */
  beganAt: number | null;
  /** Suspicious-looking results, for review. */
  flags: string[];
};

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

export const TOLERANCE: Record<TestName, number> = {
  count: 0.2,
  track: 60,
  angle: 8,
  tempo: 60,
  split: 0.05,
};

/** 100 at zero error, ~61 at one tolerance, ~14 at two. */
export function closeness(error: number, tolerance: number): number {
  return Math.round(100 * Math.exp(-0.5 * (error / tolerance) ** 2));
}

/** Smallest difference between two angles, degrees in [0, 180]. */
export function angleDiff(a: number, b: number): number {
  const d = (((a - b) % 360) + 360) % 360;
  return Math.min(d, 360 - d);
}

/** Mean absolute deviation of taps (ms from the first reference beat) from the ideal grid. */
export function tempoError(taps: number[], intervalMs: number): number {
  let sum = 0;
  taps.forEach((t, k) => {
    sum += Math.abs(t - (TEMPO_REF_BEATS + k) * intervalMs);
  });
  return sum / taps.length;
}

// Answer time windows (ms after "begin", server clock). Outside → score 0.
const WINDOW_MAX_MS = 60_000;
const COUNT_MAX_MS = 30_000;
const MIN_REACT_MS = 250;
/** Allowance for the browser's clock running a touch fast relative to ours. */
const TEMPO_CLOCK_SLACK_MS = 150;

function tempoWindow(intervalMs: number) {
  const span = (TEMPO_REF_BEATS + TEMPO_TAPS) * intervalMs;
  return {
    // The 4 reference beats plus 8 taps can't be done much faster than 70% of the beat.
    min: TEMPO_REF_BEATS * intervalMs + TEMPO_TAPS * intervalMs * 0.7,
    max: span + 20_000,
  };
}

// ---------------------------------------------------------------------------
// Generation
// ---------------------------------------------------------------------------

function genDots(rng: Rng): [number, number][] {
  const n = 40 + rng.int(51); // 40–90
  const margin = COUNT_DOT_R + 6;
  const minDist = COUNT_DOT_R * 2.6;
  const dots: [number, number][] = [];
  let tries = 0;
  while (dots.length < n && tries < 20_000) {
    tries++;
    const x = margin + rng.next() * (COUNT_BOX.w - 2 * margin);
    const y = margin + rng.next() * (COUNT_BOX.h - 2 * margin);
    if (dots.every(([a, b]) => (a - x) ** 2 + (b - y) ** 2 >= minDist ** 2)) {
      dots.push([Math.round(x), Math.round(y)]);
    }
  }
  return dots;
}

function genTrack(rng: Rng): TrackParams {
  const g = 900;
  const apex = 320 + rng.int(241); // 320–560
  const y0 = rng.int(Math.min(200, apex - 150) + 1);
  const vy = Math.sqrt(2 * g * (apex - y0));
  const flightS = vy / g + Math.sqrt((2 * apex) / g);
  // Launch from the left and land to the right, then mirror half the time.
  let x0 = 40 + rng.int(161);
  let landingX = x0 + 350 + rng.int(960 - x0 - 350 + 1);
  if (rng.next() < 0.5) {
    x0 = TRACK_BOX.w - x0;
    landingX = TRACK_BOX.w - landingX;
  }
  return {
    x0,
    y0,
    vx: (landingX - x0) / flightS,
    vy,
    g,
    flightS,
    visibleMs: Math.round(flightS * 1000 * 0.45),
    landingX,
  };
}

const TRACK_SAMPLE_MS = 20;

/** The visible part of the flight, sampled. The landing x is never sent. */
export function trackSamples(t: TrackParams): [number, number][] {
  const out: [number, number][] = [];
  for (let ms = 0; ms <= t.visibleMs; ms += TRACK_SAMPLE_MS) {
    const s = ms / 1000;
    const x = t.x0 + t.vx * s;
    const y = t.y0 + t.vy * s - 0.5 * t.g * s * s;
    out.push([Math.round(x * 10) / 10, Math.round(y * 10) / 10]);
  }
  return out;
}

function genAngle(rng: Rng): number {
  for (;;) {
    const a = 10 + rng.int(341); // 10–350
    if ([90, 180, 270].every((m) => Math.abs(a - m) > 4)) return a;
  }
}

const FRACTIONS: [number, number][] = [
  [1, 3], [2, 3], [1, 4], [3, 4], [1, 5], [2, 5], [3, 5], [4, 5],
  [1, 6], [5, 6], [2, 7], [3, 7], [4, 7], [5, 7], [3, 8], [5, 8], [7, 8], [3, 10], [7, 10],
];

// ---------------------------------------------------------------------------
// Per-test answer checks
// ---------------------------------------------------------------------------

type Graded = { error: number; detail: string; flag?: string } | { invalid: string } | { zero: string; flag?: string };

const fmt = (n: number, digits = 0) => n.toFixed(digits);

function grade(p: SharpPuzzle, test: TestName, value: number | number[], elapsed: number): Graded {
  if (test === "tempo") {
    if (!Array.isArray(value) || value.length !== TEMPO_TAPS) return { invalid: `Send exactly ${TEMPO_TAPS} taps.` };
    const I = p.tempo.intervalMs;
    for (let i = 0; i < value.length; i++) {
      const t = value[i];
      if (i > 0 && t <= value[i - 1]) return { invalid: "Taps must be in order." };
      if (t < (TEMPO_REF_BEATS - 1) * I || t > 30 * I) return { invalid: "Tap time out of range." };
    }
    const win = tempoWindow(I);
    if (elapsed > win.max) return { zero: "Too slow — time ran out." };
    // The taps happened after we started the test, so the last tap can't be
    // later (relative to the first beat) than the time that has passed here.
    if (elapsed < win.min || value[TEMPO_TAPS - 1] > elapsed + TEMPO_CLOCK_SLACK_MS) {
      return { zero: "Tap timings didn't match the clock.", flag: "tempo_implausible" };
    }
    const error = tempoError(value, I);
    const gaps = value.slice(1).map((t, i) => t - value[i]);
    const meanGap = gaps.reduce((a, b) => a + b, 0) / gaps.length;
    const sd = Math.sqrt(gaps.reduce((a, b) => a + (b - meanGap) ** 2, 0) / gaps.length);
    // Humans drift by tens of ms; near-zero error or jitter suggests a script.
    const flag = error < 3 || sd < 1.5 ? "tempo_too_perfect" : undefined;
    return { error, detail: `Average drift ${fmt(error)} ms`, flag };
  }

  if (typeof value !== "number") return { invalid: "Send a single number." };

  switch (test) {
    case "count": {
      if (!Number.isInteger(value) || value < 0 || value > 1000) return { invalid: "Enter a whole number from 0 to 1000." };
      if (elapsed < COUNT_SHOW_MS) return { zero: "Answered before the dots were hidden.", flag: "count_early" };
      if (elapsed > COUNT_MAX_MS) return { zero: "Too slow — time ran out." };
      const actual = p.count.dots.length;
      const error = Math.abs(value - actual) / actual;
      const off = Math.abs(value - actual);
      return { error, detail: off === 0 ? "Exactly right" : `Off by ${off} (${fmt(error * 100)}%)` };
    }
    case "track": {
      if (value < 0 || value > TRACK_BOX.w) return { invalid: "Pick a point on the floor." };
      if (elapsed < p.track.visibleMs) return { zero: "Answered before the throw finished." };
      if (elapsed > WINDOW_MAX_MS) return { zero: "Too slow — time ran out." };
      const error = Math.abs(value - p.track.landingX);
      return { error, detail: `Off by ${fmt(error)} units` };
    }
    case "angle": {
      if (value < 0 || value > 360) return { invalid: "Angle must be 0–360°." };
      if (elapsed < MIN_REACT_MS) return { zero: "Answered too fast." };
      if (elapsed > WINDOW_MAX_MS) return { zero: "Too slow — time ran out." };
      const error = angleDiff(value, p.angle.target);
      return { error, detail: `Off by ${fmt(error, 1)}°` };
    }
    case "split": {
      if (value < 0 || value > 1) return { invalid: "Position must be 0–1." };
      if (elapsed < MIN_REACT_MS) return { zero: "Answered too fast." };
      if (elapsed > WINDOW_MAX_MS) return { zero: "Too slow — time ran out." };
      const error = Math.abs(value - p.split.target);
      return { error, detail: `Off by ${fmt(error * 100, 1)}% of the line` };
    }
  }
}

// ---------------------------------------------------------------------------
// Module
// ---------------------------------------------------------------------------

const isFiniteNumber = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

function total(state: SharpState): number {
  if (state.results.length === 0) return 0;
  return Math.round(state.results.reduce((a, r) => a + r.score, 0) / TESTS.length);
}

function activeParams(p: SharpPuzzle, test: TestName, sinceBegin: number): ActiveTest {
  switch (test) {
    case "count": {
      const showMsLeft = Math.max(0, COUNT_SHOW_MS - sinceBegin);
      // Dots go out only while they're meant to be on screen.
      return showMsLeft > 0 ? { test, dots: p.count.dots, showMsLeft } : { test, showMsLeft: 0 };
    }
    case "track":
      return { test, samples: trackSamples(p.track), sampleMs: TRACK_SAMPLE_MS };
    case "angle":
      return { test, target: p.angle.target };
    case "tempo":
      return { test, intervalMs: p.tempo.intervalMs };
    case "split":
      return { test, num: p.split.num, den: p.split.den, from: p.split.from };
  }
}

export const sharp: GameModule<SharpPuzzle, SharpState, SharpMove, SharpView> = {
  id: "sharp",
  flags: (_puzzle, state) => state.flags,
  minPlausibleMs: 15_000,

  generate: ({ rng, date }) => {
    const [num, den] = rng.pick(FRACTIONS);
    const from = rng.next() < 0.5 ? "left" : "right";
    const puzzle: SharpPuzzle = {
      count: { dots: genDots(rng) },
      track: genTrack(rng),
      angle: { target: genAngle(rng) },
      tempo: { intervalMs: 450 + rng.int(301) },
      split: { num, den, from, target: from === "left" ? num / den : 1 - num / den },
    };
    // Every day is freshly generated, so the content id is just the date.
    return { contentId: `sharp-${date}`, puzzle };
  },

  initialState: () => ({ results: [], beganAt: null, flags: [] }),

  parseMove: (raw) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    const m = raw as Record<string, unknown>;
    if (m.type === "begin" && Object.keys(m).length === 1) return { type: "begin" };
    if (m.type !== "answer" || Object.keys(m).length !== 2) return null;
    const v = m.value;
    if (isFiniteNumber(v)) return { type: "answer", value: v };
    if (Array.isArray(v) && v.length >= 1 && v.length <= 16 && v.every(isFiniteNumber)) {
      return { type: "answer", value: [...v] };
    }
    return null;
  },

  applyMove: (p, s, move, ctx): MoveOutcome<SharpState> => {
    const index = s.results.length;
    if (index >= TESTS.length) return { ok: false, error: "All tests are done." };

    if (move.type === "begin") {
      if (s.beganAt !== null) return { ok: false, error: "This test is already running." };
      return { ok: true, state: { ...s, beganAt: ctx.now }, done: false };
    }

    if (s.beganAt === null) return { ok: false, error: "Begin the test first." };
    const test = TESTS[index];
    const graded = grade(p, test, move.value, ctx.now - s.beganAt);
    if ("invalid" in graded) return { ok: false, error: graded.invalid };

    const result: StoredResult =
      "zero" in graded
        ? { test, score: 0, error: -1, detail: graded.zero, answer: move.value }
        : {
            test,
            score: closeness(graded.error, TOLERANCE[test]),
            error: graded.error,
            detail: graded.detail,
            answer: move.value,
          };

    const flags = graded.flag ? [...s.flags, graded.flag] : s.flags;
    const results = [...s.results, result];
    return { ok: true, state: { results, beganAt: null, flags }, done: results.length === TESTS.length };
  },

  view: (p, s, { done, now }) => {
    const index = s.results.length;
    const running = !done && s.beganAt !== null && index < TESTS.length;
    return {
      tests: TESTS,
      results: s.results.map(({ test, score, detail }) => ({ test, score, detail })),
      nextIndex: index,
      active: running ? activeParams(p, TESTS[index], now - (s.beganAt as number)) : null,
      total: done ? total(s) : null,
      reveal: done
        ? {
            count: p.count.dots.length,
            trackLandingX: Math.round(p.track.landingX),
            angleTarget: p.angle.target,
            tempoIntervalMs: p.tempo.intervalMs,
            splitTarget: p.split.target,
            answers: TESTS.map((_, i) => s.results[i]?.answer ?? null),
          }
        : null,
    };
  },

  score: (_p, s) => total(s),
};

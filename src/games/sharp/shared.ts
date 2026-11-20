// Types and small helpers shared by the Sharp server module and its client.
// Nothing here is secret: answers live only in the server-side puzzle.

export const TESTS = ["count", "track", "angle", "tempo", "split"] as const;
export type TestName = (typeof TESTS)[number];

export const TEST_LABELS: Record<TestName, string> = {
  count: "Count",
  track: "Track",
  angle: "Angle",
  tempo: "Tempo",
  split: "Split",
};

/** Track arena size, in box units. Floor is y = 0, y grows upward. */
export const TRACK_BOX = { w: 1000, h: 600 } as const;
/** Count field size, in box units (SVG viewBox). */
export const COUNT_BOX = { w: 1000, h: 600 } as const;
export const COUNT_DOT_R = 10;
export const COUNT_SHOW_MS = 2000;
export const TEMPO_REF_BEATS = 4;
export const TEMPO_TAPS = 8;

export type SharpMove = { type: "begin" } | { type: "answer"; value: number | number[] };

/** Render parameters for the test that is currently running. */
export type ActiveTest =
  | {
      test: "count";
      /** Present only while the dots are meant to be visible. */
      dots?: [number, number][];
      /** How much longer the dots stay up (ms, server clock). */
      showMsLeft: number;
    }
  | {
      test: "track";
      /** Positions of the ball, one every `sampleMs`, for the visible part of the flight only. */
      samples: [number, number][];
      sampleMs: number;
    }
  | { test: "angle"; target: number }
  | { test: "tempo"; intervalMs: number }
  | { test: "split"; num: number; den: number; from: "left" | "right" };

export type TestResult = {
  test: TestName;
  score: number;
  /** Human-readable "how close" line, e.g. "Off by 4°". */
  detail: string;
};

export type SharpReveal = {
  count: number;
  trackLandingX: number;
  angleTarget: number;
  tempoIntervalMs: number;
  splitTarget: number;
  answers: (number | number[] | null)[];
};

export type SharpView = {
  tests: readonly TestName[];
  results: TestResult[];
  /** Index of the next test to begin (or the running one). */
  nextIndex: number;
  active: ActiveTest | null;
  total: number | null;
  reveal: SharpReveal | null;
};

/** Display-only grade letter. */
export function gradeFor(score: number): string {
  if (score >= 95) return "S";
  if (score >= 85) return "A";
  if (score >= 70) return "B";
  if (score >= 55) return "C";
  if (score >= 40) return "D";
  return "F";
}

export function squareFor(score: number): string {
  if (score >= 85) return "🟩";
  if (score >= 55) return "🟨";
  if (score >= 25) return "🟧";
  return "🟥";
}

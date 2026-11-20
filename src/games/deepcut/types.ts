// Types shared by the Deep Cut server module and its browser UI.
import type { Tier } from "./match";

export type { Tier };

/** Prompts per day. */
export const PROMPT_COUNT = 7;
/** Time per prompt, in ms. */
export const TIME_LIMIT_MS = 20_000;
/** Extra time the server allows for network lag before calling a timeout. */
export const GRACE_MS = 1_500;
/** Attempts (wrong + right) allowed per prompt. */
export const MAX_ATTEMPTS = 8;
/** Points for a correct answer by rarity tier. */
export const TIER_POINTS: Record<Tier, number> = { 1: 10, 2: 25, 3: 50, 4: 75, 5: 100 };
export const TIER_LABELS: Record<Tier, string> = {
  1: "Common",
  2: "Familiar",
  3: "Uncommon",
  4: "Rare",
  5: "Deep cut",
};

export type DeepCutMove = { type: "begin" } | { type: "answer"; text: string } | { type: "timeout" };

export type DeepCutOutcome = "correct" | "timeout" | "out_of_attempts";

export type DeepCutResultView = {
  prompt: string;
  outcome: DeepCutOutcome;
  /** What the player typed, for a correct answer. */
  given: string | null;
  /** The canonical answer it matched. */
  answer: string | null;
  tier: Tier | null;
  points: number;
};

export type DeepCutCurrentView = {
  prompt: string;
  /** Absolute server time (ms) when this prompt runs out. */
  deadline: number;
  /** Server time when this view was made, for estimating clock offset. */
  serverNow: number;
  attemptsLeft: number;
  /** Wrong guesses on this prompt so far, oldest first. */
  wrong: string[];
};

export type DeepCutRevealView = {
  prompt: string;
  answerCount: number;
  /** A few example answers per tier, rarest tier first. */
  examples: { tier: Tier; answers: string[] }[];
};

export type DeepCutView = {
  /** "ready": started but the first prompt isn't showing yet. */
  phase: "ready" | "playing" | "done";
  count: number;
  timeLimitMs: number;
  index: number;
  total: number;
  results: DeepCutResultView[];
  current: DeepCutCurrentView | null;
  /** Only once the play is done. */
  reveal: DeepCutRevealView[] | null;
};

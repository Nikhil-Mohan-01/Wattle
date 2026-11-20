import "server-only";
import { loadContent } from "@/lib/content";
import { pickFresh } from "@/lib/rng";
import type { GameModule } from "../types";
import { answerKey, answerKeys, matchAnswer, MAX_INPUT_LENGTH, type DeepCutAnswer, type Tier } from "./match";
import {
  GRACE_MS,
  MAX_ATTEMPTS,
  PROMPT_COUNT,
  TIER_POINTS,
  TIME_LIMIT_MS,
  type DeepCutMove,
  type DeepCutOutcome,
  type DeepCutRevealView,
  type DeepCutView,
} from "./types";

export type DeepCutPrompt = { id: string; prompt: string; answers: DeepCutAnswer[] };

/** The day's puzzle: the full prompts, answers included. Server only. */
export type DeepCutPuzzle = { prompts: DeepCutPrompt[] };

type ResultState = {
  promptId: string;
  outcome: DeepCutOutcome;
  given: string | null;
  /** Canonical text of the matched answer, kept for campus-wide rarity stats. */
  answer: string | null;
  tier: Tier | null;
  points: number;
  attempts: number;
  /** Server-measured time spent on the prompt. */
  ms: number;
};

export type DeepCutState = {
  /** Server time the first prompt was shown; null until the "begin" move. */
  begunAt: number | null;
  /** Index of the current prompt (equals the prompt count when finished). */
  index: number;
  /** Server time the current prompt became active. */
  activeSince: number | null;
  /** Attempts used on the current prompt. */
  attempts: number;
  /** Wrong guesses on the current prompt. */
  wrong: string[];
  results: ResultState[];
};

const EXAMPLES_PER_TIER = 3;
const MAX_PROMPT_LENGTH = 120;
const ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;

// ---------------------------------------------------------------------------
// Content

function fail(where: string, msg: string): never {
  throw new Error(`[deepcut] Bad content in ${where}: ${msg}`);
}

/** Checks the content file and returns it typed. Throws with a clear message on bad data. */
export function validateContent(raw: unknown): DeepCutPrompt[] {
  if (!Array.isArray(raw)) fail("file", "expected an array of prompts");
  if (raw.length < PROMPT_COUNT) fail("file", `needs at least ${PROMPT_COUNT} prompts`);
  const ids = new Set<string>();

  return raw.map((entry, i): DeepCutPrompt => {
    if (!entry || typeof entry !== "object") fail(`#${i}`, "not an object");
    const { id, prompt, answers } = entry as Record<string, unknown>;
    // Ids are joined with "," into the content id, so keep them simple.
    if (typeof id !== "string" || !ID_PATTERN.test(id)) fail(`#${i}`, "id must be lowercase letters, digits and dashes");
    if (ids.has(id)) fail(id, "duplicate id");
    ids.add(id);
    if (typeof prompt !== "string" || !prompt.trim() || prompt.length > MAX_PROMPT_LENGTH) {
      fail(id, "prompt must be a non-empty string");
    }
    if (!Array.isArray(answers) || answers.length < 3) fail(id, "needs at least 3 answers");

    const owner = new Map<string, string>();
    const parsed = answers.map((a, j): DeepCutAnswer => {
      if (!a || typeof a !== "object") fail(id, `answer #${j} is not an object`);
      const { text, aliases, tier } = a as Record<string, unknown>;
      if (typeof text !== "string" || !answerKey(text) || text.length > MAX_INPUT_LENGTH) {
        fail(id, `answer #${j} needs a text`);
      }
      if (aliases !== undefined && (!Array.isArray(aliases) || !aliases.every((x) => typeof x === "string" && answerKey(x)))) {
        fail(id, `aliases of "${text}" must be non-empty strings`);
      }
      if (typeof tier !== "number" || !Number.isInteger(tier) || tier < 1 || tier > 5) {
        fail(id, `tier of "${text}" must be 1–5`);
      }
      const answer: DeepCutAnswer = { text, tier: tier as Tier, ...(aliases ? { aliases: aliases as string[] } : {}) };
      for (const k of answerKeys(answer)) {
        const other = owner.get(k);
        if (other !== undefined) fail(id, `"${text}" and "${other}" share the spelling "${k}"`);
        owner.set(k, text);
      }
      return answer;
    });
    return { id, prompt: prompt.trim(), answers: parsed };
  });
}

let cache: DeepCutPrompt[] | null = null;
function prompts(): DeepCutPrompt[] {
  cache ??= validateContent(loadContent<unknown>("deepcut.json"));
  return cache;
}

/** Prompt ids from recent content ids ("a,b,c"), newest first. */
export function recentPromptIds(recentlyUsed: readonly string[]): string[] {
  return recentlyUsed.flatMap((cid) => cid.split(",")).filter(Boolean);
}

// ---------------------------------------------------------------------------
// Moves

function parseMove(raw: unknown): DeepCutMove | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const { type, text } = raw as Record<string, unknown>;
  if (type === "begin") return { type: "begin" };
  if (type === "timeout") return { type: "timeout" };
  if (type !== "answer" || typeof text !== "string") return null;
  const trimmed = text.trim();
  if (!trimmed || trimmed.length > MAX_INPUT_LENGTH || /[\u0000-\u001f\u007f]/.test(trimmed)) return null;
  return { type: "answer", text: trimmed };
}

/** Moves on to the next prompt, recording how the current one ended. */
function finishPrompt(
  puzzle: DeepCutPuzzle,
  state: DeepCutState,
  now: number,
  result: Omit<ResultState, "promptId" | "ms" | "attempts">,
) {
  const p = puzzle.prompts[state.index];
  const results: ResultState[] = [
    ...state.results,
    {
      promptId: p.id,
      attempts: state.attempts,
      ms: Math.max(0, now - (state.activeSince ?? now)),
      ...result,
    },
  ];
  const index = state.index + 1;
  const next: DeepCutState = { ...state, index, activeSince: now, attempts: 0, wrong: [], results };
  return { ok: true as const, state: next, done: index >= puzzle.prompts.length };
}

// ---------------------------------------------------------------------------
// Module

export const deepcut: GameModule<DeepCutPuzzle, DeepCutState, DeepCutMove, DeepCutView> = {
  id: "deepcut",
  minPlausibleMs: 7_000,

  generate({ rng, recentlyUsed }) {
    const pool = prompts();
    const used = recentPromptIds(recentlyUsed);
    const chosen: DeepCutPrompt[] = [];
    for (let i = 0; i < PROMPT_COUNT; i++) {
      const remaining = pool.filter((p) => !chosen.includes(p));
      chosen.push(pickFresh(rng, remaining, used));
    }
    return {
      contentId: chosen
        .map((p) => p.id)
        .sort()
        .join(","),
      // A copy, so the frozen puzzle doesn't change if the content file does.
      puzzle: { prompts: structuredClone(chosen) },
    };
  },

  // The clock for prompt 0 starts at the "begin" move, not here: the engine
  // also calls initialState to render the not-yet-started view, so starting
  // here would show the first prompt before the player pressed Start.
  initialState: () => ({ begunAt: null, index: 0, activeSince: null, attempts: 0, wrong: [], results: [] }),

  parseMove,

  applyMove(puzzle, state, move, { now }) {
    if (state.index >= puzzle.prompts.length) return { ok: false, error: "You've answered every prompt." };

    if (move.type === "begin") {
      if (state.begunAt !== null) return { ok: false, error: "Already under way." };
      return { ok: true, state: { ...state, begunAt: now, activeSince: now }, done: false };
    }
    if (state.begunAt === null || state.activeSince === null) return { ok: false, error: "Press Begin first." };

    // Timer checked on the server only. Anything after the deadline (plus a
    // little grace for lag) is a timeout, whatever the browser says.
    const late = now > state.activeSince + TIME_LIMIT_MS + GRACE_MS;
    const timeout = { outcome: "timeout" as const, given: null, answer: null, tier: null, points: 0 };
    if (move.type === "timeout" || late) return finishPrompt(puzzle, state, now, timeout);

    const key = answerKey(move.text);
    if (!key) return { ok: false, error: "Type an answer." };
    if (state.wrong.some((w) => answerKey(w) === key)) return { ok: false, error: "You already tried that." };

    const prompt = puzzle.prompts[state.index];
    const attempts = state.attempts + 1;
    const hit = matchAnswer(move.text, prompt.answers);
    if (hit !== null) {
      const a = prompt.answers[hit];
      return finishPrompt(puzzle, { ...state, attempts }, now, {
        outcome: "correct",
        given: move.text,
        answer: a.text,
        tier: a.tier,
        points: TIER_POINTS[a.tier],
      });
    }

    const wrong = [...state.wrong, move.text];
    if (attempts >= MAX_ATTEMPTS) {
      return finishPrompt(puzzle, { ...state, attempts, wrong }, now, {
        outcome: "out_of_attempts",
        given: null,
        answer: null,
        tier: null,
        points: 0,
      });
    }
    return { ok: true, state: { ...state, attempts, wrong }, done: false };
  },

  view(puzzle, state, { done, now }) {
    const results = state.results.map((r, i) => ({
      prompt: puzzle.prompts[i].prompt,
      outcome: r.outcome,
      given: r.given,
      answer: r.answer,
      tier: r.tier,
      points: r.points,
    }));
    const total = state.results.reduce((sum, r) => sum + r.points, 0);
    const playing = !done && state.begunAt !== null && state.activeSince !== null && state.index < puzzle.prompts.length;

    let reveal: DeepCutRevealView[] | null = null;
    if (done) {
      reveal = puzzle.prompts.map((p) => {
        const examples = ([5, 4, 3, 2, 1] as const)
          .map((tier) => ({
            tier,
            answers: p.answers.filter((a) => a.tier === tier).slice(0, EXAMPLES_PER_TIER).map((a) => a.text),
          }))
          .filter((e) => e.answers.length > 0);
        return { prompt: p.prompt, answerCount: p.answers.length, examples };
      });
    }

    return {
      phase: done ? "done" : playing ? "playing" : "ready",
      count: puzzle.prompts.length,
      timeLimitMs: TIME_LIMIT_MS,
      index: state.index,
      total,
      results,
      // Only the current prompt's text: never its answers, never later prompts.
      current: playing
        ? {
            prompt: puzzle.prompts[state.index].prompt,
            deadline: state.activeSince! + TIME_LIMIT_MS,
            serverNow: now,
            attemptsLeft: MAX_ATTEMPTS - state.attempts,
            wrong: state.wrong,
          }
        : null,
      reveal,
    };
  },

  score: (_puzzle, state) => state.results.reduce((sum, r) => sum + r.points, 0),
};

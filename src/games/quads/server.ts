import "server-only";
import { loadContent } from "@/lib/content";
import { pickFresh } from "@/lib/rng";
import type { GameModule } from "../types";
import type { Difficulty, QuadsGroup, QuadsMove, QuadsResult, QuadsView } from "./types";

export const MAX_MISTAKES = 4;
export const GROUP_SIZE = 4;
export const GROUP_COUNT = 4;
const MAX_WORD_LENGTH = 40;

type ContentPuzzle = { id: string; groups: QuadsGroup[] };

/** The full puzzle, stored on the server only. `order` is the shuffled board. */
export type QuadsPuzzle = ContentPuzzle & { order: string[] };

type Guess = { words: string[]; correct: boolean; oneAway: boolean };

export type QuadsState = {
  /** Indexes into puzzle.groups, in the order they were found. */
  solved: number[];
  guesses: Guess[];
  mistakes: number;
};

const key = (words: readonly string[]) => [...words].sort().join("\u0000");

function fail(id: string, msg: string): never {
  throw new Error(`[quads] Bad content in puzzle "${id}": ${msg}`);
}

/** Checks one content entry and returns it typed. Throws with a clear message on bad data. */
function validatePuzzle(raw: unknown, index: number): ContentPuzzle {
  if (!raw || typeof raw !== "object") fail(`#${index}`, "not an object");
  const { id, groups } = raw as { id?: unknown; groups?: unknown };
  if (typeof id !== "string" || !id.trim()) fail(`#${index}`, "missing id");
  if (!Array.isArray(groups) || groups.length !== GROUP_COUNT) fail(id, `needs exactly ${GROUP_COUNT} groups`);

  const seenWords = new Set<string>();
  const seenDifficulty = new Set<number>();
  const out: QuadsGroup[] = groups.map((g: unknown, gi) => {
    if (!g || typeof g !== "object") fail(id, `group ${gi} is not an object`);
    const { category, difficulty, words } = g as Record<string, unknown>;
    if (typeof category !== "string" || !category.trim()) fail(id, `group ${gi} has no category`);
    if (difficulty !== 1 && difficulty !== 2 && difficulty !== 3 && difficulty !== 4) {
      fail(id, `group ${gi} difficulty must be 1-4`);
    }
    if (seenDifficulty.has(difficulty)) fail(id, `difficulty ${difficulty} used twice`);
    seenDifficulty.add(difficulty);
    if (!Array.isArray(words) || words.length !== GROUP_SIZE) fail(id, `group ${gi} needs ${GROUP_SIZE} words`);
    for (const w of words) {
      if (typeof w !== "string" || !w.trim() || w.length > MAX_WORD_LENGTH || w !== w.trim()) {
        fail(id, `group ${gi} has an invalid word ${JSON.stringify(w)}`);
      }
      const lower = w.toLowerCase();
      if (seenWords.has(lower)) fail(id, `word "${w}" appears more than once`);
      seenWords.add(lower);
    }
    return { category, difficulty, words: [...(words as string[])] };
  });
  return { id, groups: out };
}

/** Loads and validates every puzzle. Exported for tests. */
export function loadQuadsContent(): ContentPuzzle[] {
  return validateQuadsContent(loadContent<unknown>("quads.json"));
}

/** Validates a parsed quads.json. Throws with a clear message on bad data. */
export function validateQuadsContent(raw: unknown): ContentPuzzle[] {
  if (!Array.isArray(raw) || raw.length === 0) throw new Error("[quads] quads.json must be a non-empty array.");
  const puzzles = raw.map(validatePuzzle);
  const ids = new Set<string>();
  for (const p of puzzles) {
    if (ids.has(p.id)) throw new Error(`[quads] Duplicate puzzle id "${p.id}".`);
    ids.add(p.id);
  }
  return puzzles;
}

const groupOf = (puzzle: QuadsPuzzle, word: string) => puzzle.groups.findIndex((g) => g.words.includes(word));

const isDone = (s: QuadsState) => s.solved.length === GROUP_COUNT || s.mistakes >= MAX_MISTAKES;

/**
 * Scoring (higher is better, 0..100):
 *   25 points per group found, minus 5 per mistake, floored at 0.
 * A perfect solve is 100; finding everything with 3 mistakes is 85; a loss
 * (4 mistakes) scores 25 × groups found − 20, e.g. 3 groups → 55, 0–1 → 0–5.
 */
export function quadsScore(solvedCount: number, mistakes: number): number {
  return Math.max(0, 25 * solvedCount - 5 * mistakes);
}

export const quads: GameModule<QuadsPuzzle, QuadsState, QuadsMove, QuadsView> = {
  id: "quads",

  generate: ({ rng, recentlyUsed }) => {
    const chosen = pickFresh(rng, loadQuadsContent(), recentlyUsed);
    // The board order is fixed per puzzle and never follows the grouping.
    const order = rng.shuffle(chosen.groups.flatMap((g) => g.words));
    return { contentId: chosen.id, puzzle: { ...chosen, order } };
  },

  initialState: () => ({ solved: [], guesses: [], mistakes: 0 }),

  parseMove: (raw) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    const words = (raw as { words?: unknown }).words;
    if (!Array.isArray(words) || words.length !== GROUP_SIZE) return null;
    if (!words.every((w) => typeof w === "string" && w.length > 0 && w.length <= MAX_WORD_LENGTH)) return null;
    const list = words as string[];
    if (new Set(list).size !== GROUP_SIZE) return null;
    return { words: [...list] };
  },

  applyMove: (puzzle, state, move) => {
    if (isDone(state)) return { ok: false, error: "This puzzle is already finished." };

    const solvedWords = new Set(state.solved.flatMap((i) => puzzle.groups[i].words));
    for (const w of move.words) {
      if (!puzzle.order.includes(w)) return { ok: false, error: "That word isn't on the board." };
      if (solvedWords.has(w)) return { ok: false, error: "That word is already in a found group." };
    }

    // Repeating an earlier guess is refused without costing a mistake.
    const k = key(move.words);
    if (state.guesses.some((g) => key(g.words) === k)) {
      return { ok: false, error: "You've already tried that group." };
    }

    const counts = new Map<number, number>();
    for (const w of move.words) {
      const gi = groupOf(puzzle, w);
      counts.set(gi, (counts.get(gi) ?? 0) + 1);
    }
    const best = Math.max(...counts.values());
    const correct = best === GROUP_SIZE;
    const guess: Guess = { words: move.words, correct, oneAway: best === GROUP_SIZE - 1 };

    const next: QuadsState = {
      solved: correct ? [...state.solved, groupOf(puzzle, move.words[0])] : state.solved,
      guesses: [...state.guesses, guess],
      mistakes: correct ? state.mistakes : state.mistakes + 1,
    };
    return { ok: true, state: next, done: isDone(next) };
  },

  view: (puzzle, state, { done }) => {
    const solvedWords = new Set(state.solved.flatMap((i) => puzzle.groups[i].words));
    const last = state.guesses.at(-1);
    const lastResult: QuadsResult | null = last
      ? last.correct
        ? "correct"
        : last.oneAway
          ? "one_away"
          : "wrong"
      : null;

    const view: QuadsView = {
      // Shuffled at generate time; never sorted by group.
      tiles: puzzle.order.filter((w) => !solvedWords.has(w)),
      solved: state.solved.map((i) => ({ ...puzzle.groups[i], words: [...puzzle.groups[i].words] })),
      mistakesLeft: Math.max(0, MAX_MISTAKES - state.mistakes),
      maxMistakes: MAX_MISTAKES,
      // The player's own wrong guesses, so the UI can warn before a repeat.
      wrongGuesses: state.guesses.filter((g) => !g.correct).map((g) => [...g.words]),
      lastResult,
    };

    if (done) {
      view.won = state.solved.length === GROUP_COUNT;
      view.groups = [...puzzle.groups]
        .sort((a, b) => a.difficulty - b.difficulty)
        .map((g) => ({ ...g, words: [...g.words] }));
      view.history = state.guesses.map(
        (g) => g.words.map((w) => puzzle.groups[groupOf(puzzle, w)].difficulty) as Difficulty[],
      );
    }
    return view;
  },

  score: (_puzzle, state) => quadsScore(state.solved.length, state.mistakes),

  minPlausibleMs: 8000,
};

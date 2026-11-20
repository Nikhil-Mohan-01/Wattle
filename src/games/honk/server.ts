import "server-only";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { GameModule } from "@/games/types";
import { pickFresh } from "@/lib/rng";
import { ANSWERS } from "./answers";
import { MAX_GUESSES, WORD_LENGTH, markGuess, type HonkMove, type HonkView } from "./feedback";

export type HonkPuzzle = { answer: string };
export type HonkState = { guesses: string[] };

const WORD_RE = /^[a-z]{5}$/;

let allowed: Set<string> | null = null;

/**
 * Valid guesses: the answers plus every five-letter a–z word in the
 * `word-list` package. Read once per server process. If the file is missing
 * (e.g. dev dependencies pruned in production), guesses fall back to the
 * answer list rather than failing.
 */
export function allowedGuesses(): Set<string> {
  if (allowed) return allowed;
  const set = new Set(ANSWERS);
  const file = path.join(process.cwd(), "node_modules", "word-list", "words.txt");
  if (existsSync(file)) {
    for (const line of readFileSync(file, "utf8").split("\n")) {
      const w = line.trim();
      if (WORD_RE.test(w)) set.add(w);
    }
  } else {
    console.warn("[honk] word-list not found; only answer words are accepted as guesses.");
  }
  allowed = set;
  return set;
}

function solved(puzzle: HonkPuzzle, state: HonkState): boolean {
  return state.guesses.includes(puzzle.answer);
}

function finished(puzzle: HonkPuzzle, state: HonkState): boolean {
  return solved(puzzle, state) || state.guesses.length >= MAX_GUESSES;
}

export const honk: GameModule<HonkPuzzle, HonkState, HonkMove, HonkView> = {
  id: "honk",
  minPlausibleMs: 4000,

  generate: ({ rng, recentlyUsed }) => {
    const pool = ANSWERS.map((w) => ({ id: w }));
    const { id } = pickFresh(rng, pool, recentlyUsed);
    return { contentId: id, puzzle: { answer: id } };
  },

  initialState: () => ({ guesses: [] }),

  parseMove: (raw) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    const keys = Object.keys(raw);
    if (keys.length !== 1 || keys[0] !== "guess") return null;
    const { guess } = raw as { guess: unknown };
    // Loose shape check only; applyMove gives friendly errors for bad words.
    if (typeof guess !== "string" || guess.length === 0 || guess.length > 16) return null;
    return { guess: guess.trim().toLowerCase() };
  },

  applyMove: (puzzle, state, move) => {
    if (finished(puzzle, state)) return { ok: false, error: "This game is already over." };
    if (move.guess.length !== WORD_LENGTH) {
      return { ok: false, error: "Guesses need exactly five letters." };
    }
    if (!WORD_RE.test(move.guess)) return { ok: false, error: "Letters A–Z only, please." };
    if (!allowedGuesses().has(move.guess)) {
      return { ok: false, error: `"${move.guess.toUpperCase()}" isn't in the word list.` };
    }
    const next = { guesses: [...state.guesses, move.guess] };
    return { ok: true, state: next, done: finished(puzzle, next) };
  },

  view: (puzzle, state, { done }) => {
    const rows = state.guesses.map((word) => ({ word, marks: markGuess(word, puzzle.answer) }));
    if (!done) return { rows, maxGuesses: MAX_GUESSES };
    return { rows, maxGuesses: MAX_GUESSES, answer: puzzle.answer, solved: solved(puzzle, state) };
  },

  score: (puzzle, state) => {
    const i = state.guesses.indexOf(puzzle.answer);
    return i === -1 ? 0 : MAX_GUESSES + 1 - (i + 1);
  },
};

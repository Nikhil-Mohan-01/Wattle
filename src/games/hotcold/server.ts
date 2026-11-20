import "server-only";
import type { GameModule } from "@/games/types";
import { pickFresh } from "@/lib/rng";
import { ANSWER_IDS, COUNTRY_BY_ID, resolveCountry } from "./countries";
import { distanceKm } from "./geo";

export const MAX_GUESSES = 60;
const MAX_NAME_LENGTH = 80;

/** The answer: an ISO numeric code. Never sent to the browser while playing. */
export type HotColdPuzzle = { answerId: string };

export type HotColdState = {
  /** Guesses in the order made, with the server-computed distance. */
  guesses: { id: string; km: number }[];
  solved: boolean;
  gaveUp: boolean;
};

export type HotColdMove = { country: string } | { giveUp: true };

export type HotColdGuess = {
  id: string;
  name: string;
  distanceKm: number;
  /** 1-based order in which it was guessed. */
  n: number;
};

export type HotColdView = {
  /** Closest first. */
  guesses: HotColdGuess[];
  count: number;
  maxGuesses: number;
  closestKm: number | null;
  latestId: string | null;
  solved: boolean;
  gaveUp: boolean;
  /** Only once the play is done. */
  answer?: { id: string; name: string };
};

function isOver(s: HotColdState): boolean {
  return s.solved || s.gaveUp || s.guesses.length >= MAX_GUESSES;
}

export function scoreFor(s: HotColdState): number {
  if (!s.solved) return 0;
  return Math.max(1, 100 - 5 * (s.guesses.length - 1));
}

export const hotcold: GameModule<HotColdPuzzle, HotColdState, HotColdMove, HotColdView> = {
  id: "hotcold",
  minPlausibleMs: 5000,

  generate: ({ rng, recentlyUsed }) => {
    const pick = pickFresh(
      rng,
      ANSWER_IDS.map((id) => ({ id })),
      recentlyUsed,
    );
    return { contentId: pick.id, puzzle: { answerId: pick.id } };
  },

  initialState: () => ({ guesses: [], solved: false, gaveUp: false }),

  parseMove: (raw) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    const keys = Object.keys(raw);
    if (keys.length !== 1) return null;
    const r = raw as Record<string, unknown>;
    if (keys[0] === "giveUp") return r.giveUp === true ? { giveUp: true } : null;
    if (keys[0] === "country" && typeof r.country === "string") {
      const country = r.country.trim();
      if (country.length < 1 || country.length > MAX_NAME_LENGTH) return null;
      return { country };
    }
    return null;
  },

  applyMove: (puzzle, state, move) => {
    if (isOver(state)) return { ok: false, error: "This game is over." };

    if ("giveUp" in move) {
      const next = { ...state, gaveUp: true };
      return { ok: true, state: next, done: true };
    }

    // Unknown and repeated guesses are rejected, so they don't use up a guess.
    const id = resolveCountry(move.country);
    if (!id) return { ok: false, error: `"${move.country}" isn't a country we know.` };
    if (state.guesses.some((g) => g.id === id)) {
      return { ok: false, error: `You've already guessed ${COUNTRY_BY_ID.get(id)?.name ?? "that"}.` };
    }

    const solved = id === puzzle.answerId;
    const km = solved ? 0 : distanceKm(id, puzzle.answerId);
    const next: HotColdState = { ...state, guesses: [...state.guesses, { id, km }], solved };
    return { ok: true, state: next, done: isOver(next) };
  },

  view: (puzzle, state, { done }) => {
    const guesses = state.guesses
      .map((g, i) => ({ id: g.id, name: COUNTRY_BY_ID.get(g.id)?.name ?? g.id, distanceKm: g.km, n: i + 1 }))
      .sort((a, b) => a.distanceKm - b.distanceKm || a.n - b.n);
    const view: HotColdView = {
      guesses,
      count: state.guesses.length,
      maxGuesses: MAX_GUESSES,
      closestKm: guesses.length ? guesses[0].distanceKm : null,
      latestId: state.guesses.at(-1)?.id ?? null,
      solved: state.solved,
      gaveUp: state.gaveUp,
    };
    if (done) {
      view.answer = { id: puzzle.answerId, name: COUNTRY_BY_ID.get(puzzle.answerId)?.name ?? puzzle.answerId };
    }
    return view;
  },

  score: (_puzzle, state) => scoreFor(state),
};

// Central registry of the daily games and the Monday–Friday schedule.
// Names are Wattle's own; each game uses a mechanic players already know.

export type GameId = "deepcut" | "honk" | "quads" | "hotcold" | "sharp";

export type GameInfo = {
  id: GameId;
  name: string;
  tagline: string;
  // Short "you already know this one" hint shown on the card.
  familiarAs: string;
  emoji: string;
};

export const GAMES: Record<GameId, GameInfo> = {
  deepcut: {
    id: "deepcut",
    name: "Deep Cut",
    tagline: "Seven prompts. The rarer your correct answer, the more it's worth.",
    familiarAs: "Rarity trivia",
    emoji: "🪸",
  },
  honk: {
    id: "honk",
    name: "Honk",
    tagline: "Find the five-letter word in six guesses.",
    familiarAs: "Five-letter word guess",
    emoji: "🪿",
  },
  quads: {
    id: "quads",
    name: "Quads",
    tagline: "Sort sixteen words into four hidden groups.",
    familiarAs: "Group-of-four puzzle",
    emoji: "🧩",
  },
  hotcold: {
    id: "hotcold",
    name: "Hot & Cold",
    tagline: "Guess the mystery country. Closer guesses glow hotter.",
    familiarAs: "Country proximity globe",
    emoji: "🌍",
  },
  sharp: {
    id: "sharp",
    name: "Sharp",
    tagline: "Five quick perception tests: count, track, angle, tempo, split.",
    familiarAs: "Perception tests",
    emoji: "🎯",
  },
};

// JS getDay(): 0 = Sunday … 6 = Saturday. Weekends have no game.
export const SCHEDULE: Record<number, GameId | null> = {
  0: null,
  1: "deepcut",
  2: "honk",
  3: "quads",
  4: "hotcold",
  5: "sharp",
  6: null,
};

export const WEEKDAYS = [
  { day: 1, label: "Mon" },
  { day: 2, label: "Tue" },
  { day: 3, label: "Wed" },
  { day: 4, label: "Thu" },
  { day: 5, label: "Fri" },
] as const;

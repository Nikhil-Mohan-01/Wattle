// Types shared by the Quads server module and its browser UI.

export type Difficulty = 1 | 2 | 3 | 4;

export type QuadsGroup = { category: string; difficulty: Difficulty; words: string[] };

export type QuadsMove = { words: string[] };

export type QuadsResult = "correct" | "one_away" | "wrong";

export type QuadsView = {
  /** Words not yet in a found group, in the puzzle's shuffled order. */
  tiles: string[];
  /** Groups found so far, in the order found. */
  solved: QuadsGroup[];
  mistakesLeft: number;
  maxMistakes: number;
  wrongGuesses: string[][];
  lastResult: QuadsResult | null;
  /** Only when done. */
  won?: boolean;
  /** Only when done: every group, easiest first. */
  groups?: QuadsGroup[];
  /** Only when done: each guess as the difficulties of its four words. */
  history?: Difficulty[][];
};

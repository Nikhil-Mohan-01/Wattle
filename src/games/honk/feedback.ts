// Pure helpers shared by the server module and the browser UI. No word lists here.

export const WORD_LENGTH = 5;
export const MAX_GUESSES = 6;

/** correct = right letter, right spot; present = in the word elsewhere; absent = not (or no more) in the word. */
export type Mark = "correct" | "present" | "absent";

export type HonkMove = { guess: string };
export type HonkRow = { word: string; marks: Mark[] };
/** What the browser sees. */
export type HonkView = {
  rows: HonkRow[];
  maxGuesses: number;
  /** Only present once the play is done. */
  answer?: string;
  solved?: boolean;
};

/**
 * Marks a guess against the answer. Duplicate letters are count-limited:
 * exact matches are claimed first, then each remaining copy of a letter in the
 * answer can turn at most one more guessed copy "present", left to right.
 */
export function markGuess(guess: string, answer: string): Mark[] {
  const marks: Mark[] = Array.from({ length: guess.length }, () => "absent");
  const unclaimed = new Map<string, number>();

  for (let i = 0; i < guess.length; i++) {
    if (guess[i] === answer[i]) {
      marks[i] = "correct";
    } else {
      unclaimed.set(answer[i], (unclaimed.get(answer[i]) ?? 0) + 1);
    }
  }
  for (let i = 0; i < guess.length; i++) {
    if (marks[i] === "correct") continue;
    const left = unclaimed.get(guess[i]) ?? 0;
    if (left > 0) {
      marks[i] = "present";
      unclaimed.set(guess[i], left - 1);
    }
  }
  return marks;
}

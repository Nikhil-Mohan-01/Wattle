// Answer matching for Deep Cut. Pure functions, no server imports, so they're
// easy to test. Only the server calls them (the answer lists never leave it).

export type Tier = 1 | 2 | 3 | 4 | 5;

export type DeepCutAnswer = {
  text: string;
  aliases?: string[];
  tier: Tier;
};

/** Longest answer a player may type. */
export const MAX_INPUT_LENGTH = 60;

/**
 * Canonical form for comparing answers: lowercase, accents and punctuation
 * stripped, single spaces, no leading "the". Symbols that carry meaning in
 * names ("C++", "C#", "Q&A") are spelled out first so they don't vanish.
 */
export function normalise(input: string): string {
  let s = input.normalize("NFKD").replace(/\p{M}+/gu, "").toLowerCase();
  s = s.replace(/&/g, " and ").replace(/\+/g, " plus ").replace(/#/g, " sharp ");
  // Apostrophes join words ("St. John's" -> "st johns"); other punctuation splits them.
  s = s.replace(/['‘’`]/g, "");
  s = s.replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  s = s.replace(/^the /, "");
  return s;
}

/** The key answers are compared on: normalised, with spaces removed. */
export function answerKey(input: string): string {
  return normalise(input).replace(/ /g, "");
}

/**
 * Damerau-Levenshtein distance (optimal string alignment variant): insertions,
 * deletions, substitutions and swaps of adjacent letters each cost 1.
 */
export function editDistance(a: string, b: string): number {
  const n = a.length;
  const m = b.length;
  if (n === 0) return m;
  if (m === 0) return n;
  // Three rolling rows: two back (for transpositions), previous and current.
  let prev2 = new Array<number>(m + 1).fill(0);
  let prev = Array.from({ length: m + 1 }, (_, j) => j);
  let cur = new Array<number>(m + 1).fill(0);
  for (let i = 1; i <= n; i++) {
    cur[0] = i;
    for (let j = 1; j <= m; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let d = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d = Math.min(d, prev2[j - 2] + 1);
      }
      cur[j] = d;
    }
    [prev2, prev, cur] = [prev, cur, prev2];
  }
  return prev[m];
}

/** Typos allowed against an answer key of this length. */
export function typoAllowance(keyLength: number): number {
  if (keyLength >= 9) return 2;
  if (keyLength >= 5) return 1;
  return 0;
}

/** All comparison keys of one answer (text + aliases), deduplicated. */
export function answerKeys(answer: DeepCutAnswer): string[] {
  return [...new Set([answer.text, ...(answer.aliases ?? [])].map(answerKey).filter(Boolean))];
}

/**
 * Finds which answer (by index) the player's input matches, or null.
 *
 * An exact match on any text/alias wins. Otherwise the closest key is used if
 * it is within the typo allowance for its length, and only if no *other*
 * answer is equally close (an ambiguous typo is rejected, not guessed).
 */
export function matchAnswer(input: string, answers: readonly DeepCutAnswer[]): number | null {
  if (input.length > MAX_INPUT_LENGTH) return null;
  const key = answerKey(input);
  if (!key) return null;

  let best = Infinity;
  let bestAnswers = new Set<number>();
  let bestWithinAllowance = false;

  for (let i = 0; i < answers.length; i++) {
    for (const k of answerKeys(answers[i])) {
      if (k === key) return i;
      // Cheap lower bound: no point computing a distance that can't win.
      if (Math.abs(k.length - key.length) > Math.min(best, 2)) continue;
      const d = editDistance(key, k);
      const within = d <= typoAllowance(k.length);
      if (d < best) {
        best = d;
        bestAnswers = new Set([i]);
        bestWithinAllowance = within;
      } else if (d === best) {
        bestAnswers.add(i);
        bestWithinAllowance ||= within;
      }
    }
  }

  if (!bestWithinAllowance || bestAnswers.size !== 1) return null;
  return [...bestAnswers][0];
}

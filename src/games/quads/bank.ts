// Builds a fresh Quads puzzle every day from a bank of categories.
//
// Each day: pick one category per difficulty (1–4), all from different
// "families" so related categories never share a board, then sample 4 words
// from each. A board is rejected if any word could belong to another chosen
// category (it's listed in both), so every puzzle has exactly one solution
// according to the bank.
import type { Rng } from "@/lib/rng";

export type BankCategory = {
  id: string;
  name: string;
  difficulty: 1 | 2 | 3 | 4;
  family: string;
  words: string[];
};

export type QuadsBank = { categories: BankCategory[] };

export type GeneratedGroup = { category: string; difficulty: 1 | 2 | 3 | 4; words: string[] };
export type GeneratedPuzzle = { id: string; groups: GeneratedGroup[] };

const ID_RE = /^[a-z0-9-]{1,40}$/;
const WORD_RE = /^[A-Z][A-Z -]*$/;
const MIN_WORDS = 6;
const MAX_WORDS = 20;
const MAX_WORD = 14;
const ATTEMPTS = 200;
/** Categories used in this many recent puzzles are avoided while possible. */
export const RECENT_PUZZLES = 26;

function fail(id: string, msg: string): never {
  throw new Error(`[quads-bank] ${id}: ${msg}`);
}

/** Validates the bank's shape and rules. Throws with a clear message. */
export function validateQuadsBank(raw: unknown): QuadsBank {
  const cats = (raw as { categories?: unknown })?.categories;
  if (!Array.isArray(cats)) fail("file", 'expected { "categories": [...] }');
  const ids = new Set<string>();
  const categories = cats.map((c: unknown, i): BankCategory => {
    const { id, name, difficulty, family, words } = (c ?? {}) as Record<string, unknown>;
    const label = typeof id === "string" ? id : `#${i}`;
    if (typeof id !== "string" || !ID_RE.test(id)) fail(label, "id must be lowercase letters, digits and dashes");
    if (ids.has(id)) fail(id, "duplicate id");
    ids.add(id);
    if (typeof name !== "string" || !name.trim() || name.length > 40) fail(id, "name must be 1–40 characters");
    if (difficulty !== 1 && difficulty !== 2 && difficulty !== 3 && difficulty !== 4) fail(id, "difficulty must be 1–4");
    if (typeof family !== "string" || !family.trim()) fail(id, "family is required");
    if (!Array.isArray(words) || words.length < MIN_WORDS || words.length > MAX_WORDS) {
      fail(id, `needs ${MIN_WORDS}–${MAX_WORDS} words`);
    }
    const seen = new Set<string>();
    for (const w of words) {
      if (typeof w !== "string" || !WORD_RE.test(w) || w.length > MAX_WORD || w !== w.trim()) {
        fail(id, `invalid word ${JSON.stringify(w)} (UPPERCASE A–Z, spaces, hyphens, ≤ ${MAX_WORD})`);
      }
      if (seen.has(w)) fail(id, `duplicate word ${w}`);
      seen.add(w);
    }
    return { id, name: name.trim(), difficulty, family: family.trim(), words: [...(words as string[])] };
  });
  for (const d of [1, 2, 3, 4] as const) {
    const families = new Set(categories.filter((c) => c.difficulty === d).map((c) => c.family));
    if (families.size === 0) fail("file", `no categories with difficulty ${d}`);
  }
  return { categories };
}

/** Category ids used by recent generated puzzles (content ids "qg:a+b+c+d"). */
export function recentCategoryIds(recentlyUsed: readonly string[]): Set<string> {
  return new Set(
    recentlyUsed
      .slice(0, RECENT_PUZZLES)
      .filter((cid) => cid.startsWith("qg:"))
      .flatMap((cid) => cid.slice(3).split("+")),
  );
}

/**
 * Generates one puzzle. Prefers categories not used recently; falls back to
 * any category if the fresh ones can't form a valid board.
 */
export function generateFromBank(bank: QuadsBank, rng: Rng, recentlyUsed: readonly string[]): GeneratedPuzzle {
  const recent = recentCategoryIds(recentlyUsed);
  const fresh = bank.categories.filter((c) => !recent.has(c.id));
  for (const pool of [fresh, bank.categories]) {
    for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
      const board = tryBoard(pool, rng);
      if (board) return board;
    }
  }
  throw new Error("[quads-bank] Couldn't build a valid board; the bank needs more variety.");
}

function tryBoard(pool: BankCategory[], rng: Rng): GeneratedPuzzle | null {
  const chosen: BankCategory[] = [];
  const families = new Set<string>();
  for (const d of rng.shuffle([1, 2, 3, 4] as const)) {
    const options = pool.filter((c) => c.difficulty === d && !families.has(c.family));
    if (options.length === 0) return null;
    const pick = rng.pick(options);
    chosen.push(pick);
    families.add(pick.family);
  }

  const groups: GeneratedGroup[] = [];
  const used = new Set<string>();
  for (const cat of chosen) {
    // Words that also appear in another chosen category would make the board
    // ambiguous, so they're never used.
    const others = chosen.filter((c) => c !== cat);
    const safe = cat.words.filter((w) => !used.has(w) && !others.some((o) => o.words.includes(w)));
    if (safe.length < 4) return null;
    const words = rng.shuffle(safe).slice(0, 4);
    words.forEach((w) => used.add(w));
    groups.push({ category: cat.name, difficulty: cat.difficulty, words });
  }
  groups.sort((a, b) => a.difficulty - b.difficulty);
  const ids = chosen.map((c) => c.id).sort();
  return { id: `qg:${ids.join("+")}`, groups };
}

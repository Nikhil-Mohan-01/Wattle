import "server-only";
import { createHmac } from "node:crypto";

export type Rng = {
  /** Uniform float in [0, 1). */
  next(): number;
  /** Uniform integer in [0, n). */
  int(n: number): number;
  pick<T>(items: readonly T[]): T;
  shuffle<T>(items: readonly T[]): T[];
};

function puzzleSecret(): string {
  const secret = process.env.PUZZLE_SECRET;
  if (secret) return secret;
  if (process.env.NODE_ENV === "production") {
    throw new Error("PUZZLE_SECRET must be set in production.");
  }
  return "wattle-dev-secret";
}

/**
 * Deterministic RNG keyed by a server-only secret. Without the secret, nobody
 * can predict which puzzle a future date will get, even with the content
 * lists in hand.
 */
export function seededRng(...parts: string[]): Rng {
  const digest = createHmac("sha256", puzzleSecret()).update(parts.join("|")).digest();
  let a = digest.readUInt32LE(0);
  let b = digest.readUInt32LE(4);
  let c = digest.readUInt32LE(8);
  let d = digest.readUInt32LE(12);

  // sfc32
  const next = () => {
    a |= 0;
    b |= 0;
    c |= 0;
    d |= 0;
    const t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
  for (let i = 0; i < 12; i++) next();

  const int = (n: number) => Math.floor(next() * n);
  return {
    next,
    int,
    pick: (items) => items[int(items.length)],
    shuffle: (items) => {
      const out = [...items];
      for (let i = out.length - 1; i > 0; i--) {
        const j = int(i + 1);
        [out[i], out[j]] = [out[j], out[i]];
      }
      return out;
    },
  };
}

/**
 * Picks an item, preferring ones not used recently, so content only repeats
 * once the whole pool has been played.
 */
export function pickFresh<T extends { id: string }>(
  rng: Rng,
  pool: readonly T[],
  recentlyUsed: readonly string[],
): T {
  if (pool.length === 0) throw new Error("Content pool is empty.");
  const used = new Set(recentlyUsed);
  const fresh = pool.filter((item) => !used.has(item.id));
  if (fresh.length > 0) return rng.pick(fresh);
  // Everything has been used: reuse whatever was used longest ago.
  const order = new Map(recentlyUsed.map((id, i) => [id, i]));
  const oldest = [...pool].sort((x, y) => (order.get(y.id) ?? 0) - (order.get(x.id) ?? 0));
  return oldest[0];
}

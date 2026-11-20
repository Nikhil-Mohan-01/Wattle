import "server-only";
import { lt, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { rateLimitBucket } from "@/db/schema";

export type ConsumeResult = { allowed: boolean; retryAfter: number | null };

/**
 * Records one hit against `key` and reports whether it's within `max` hits per
 * `windowSec`. The check and the increment are one SQL statement, so it's
 * atomic across parallel requests, server processes and restarts.
 */
export async function consume(key: string, windowSec: number, max: number): Promise<ConsumeResult> {
  const now = Date.now();
  const windowMs = windowSec * 1000;
  const [row] = await db
    .insert(rateLimitBucket)
    .values({ key, windowStart: now, expiresAt: now + windowMs, count: 1 })
    .onConflictDoUpdate({
      target: rateLimitBucket.key,
      set: {
        // Start a new window if the old one has expired, otherwise count the hit.
        count: sql`CASE WHEN ${rateLimitBucket.expiresAt} <= ${now} THEN 1 ELSE ${rateLimitBucket.count} + 1 END`,
        windowStart: sql`CASE WHEN ${rateLimitBucket.expiresAt} <= ${now} THEN ${now} ELSE ${rateLimitBucket.windowStart} END`,
        expiresAt: sql`CASE WHEN ${rateLimitBucket.expiresAt} <= ${now} THEN ${now + windowMs} ELSE ${rateLimitBucket.expiresAt} END`,
      },
    })
    .returning({ count: rateLimitBucket.count, expiresAt: rateLimitBucket.expiresAt });

  // Occasionally clear out expired counters so the table stays small.
  if (Math.random() < 0.01) await pruneExpired(now);

  if (row.count <= max) return { allowed: true, retryAfter: null };
  return { allowed: false, retryAfter: Math.max(1, Math.ceil((row.expiresAt - now) / 1000)) };
}

/** Convenience wrapper: true if allowed. */
export async function allow(key: string, max: number, windowSec: number): Promise<boolean> {
  return (await consume(key, windowSec, max)).allowed;
}

/** Deletes expired counters (some keys contain email addresses). */
export async function pruneExpired(now = Date.now()): Promise<void> {
  await db.delete(rateLimitBucket).where(lt(rateLimitBucket.expiresAt, now));
}

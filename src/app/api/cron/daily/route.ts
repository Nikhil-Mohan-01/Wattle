import { lt } from "drizzle-orm";
import { db } from "@/db/client";
import { playTombstone } from "@/db/schema";
import { getPuzzle, scheduledGame } from "@/engine/engine";
import { isAuthorizedCron } from "@/lib/cron-auth";
import { pruneExpired } from "@/lib/rate-limit";
import { addDays } from "@/lib/time";
import { currentPuzzleDate } from "@/lib/today";

/**
 * Daily housekeeping, run by Vercel Cron shortly after midnight Toronto time:
 * - creates today's puzzle ahead of the first player, so a generation
 *   problem shows up in the logs rather than in front of a student;
 * - clears expired rate-limit counters and old tombstones;
 * - keeps the Supabase free-tier database active so it never pauses.
 */
export async function GET(req: Request) {
  if (!isAuthorizedCron(req)) return new Response("Unauthorized", { status: 401 });

  const date = currentPuzzleDate();
  const gameId = scheduledGame(date);
  let puzzle: string = "none (weekend)";
  if (gameId) {
    try {
      await getPuzzle(date);
      puzzle = `${gameId} ready`;
    } catch (err) {
      console.error(`[cron] Failed to create the ${gameId} puzzle for ${date}`, err);
      puzzle = `${gameId} FAILED`;
    }
  }

  await pruneExpired();
  await db.delete(playTombstone).where(lt(playTombstone.date, addDays(date, -1)));

  return Response.json({ date, puzzle }, { headers: { "Cache-Control": "no-store" } });
}

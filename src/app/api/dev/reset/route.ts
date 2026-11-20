import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { play } from "@/db/schema";
import { handleGameRequest } from "@/engine/http";
import { currentPuzzleDate } from "@/lib/today";

// Development only: delete your own play for today so you can replay it.
export async function POST(req: Request) {
  if (process.env.NODE_ENV === "production") return new Response("Not found", { status: 404 });
  return handleGameRequest(req, async (player) => {
    await db.delete(play).where(and(eq(play.userId, player.id), eq(play.date, currentPuzzleDate())));
    return { ok: true };
  });
}

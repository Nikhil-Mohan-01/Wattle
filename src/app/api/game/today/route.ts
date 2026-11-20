import { getSnapshot, scheduledGame } from "@/engine/engine";
import { handleGameRequest } from "@/engine/http";
import { currentPuzzleDate } from "@/lib/today";

// Today's game for the signed-in player. Does not start the clock.
export async function GET(req: Request) {
  return handleGameRequest(req, async (player) => {
    const date = currentPuzzleDate();
    if (!scheduledGame(date)) return { date, gameId: null };
    return getSnapshot(player.id, date);
  });
}

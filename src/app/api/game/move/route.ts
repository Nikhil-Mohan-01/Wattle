import { GameError, submitMove } from "@/engine/engine";
import { handleGameRequest, readJson } from "@/engine/http";
import { isValidDate } from "@/lib/today";

export async function POST(req: Request) {
  return handleGameRequest(req, async (player) => {
    const { date, move } = await readJson(req);
    if (!isValidDate(date)) throw new GameError("bad_move", "Missing date.");
    return submitMove(player.id, date, move);
  });
}

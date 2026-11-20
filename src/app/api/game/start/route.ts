import { GameError, startPlay } from "@/engine/engine";
import { handleGameRequest, readJson } from "@/engine/http";
import { isValidDate } from "@/lib/today";

export async function POST(req: Request) {
  return handleGameRequest(req, async (player) => {
    const { date } = await readJson(req);
    if (!isValidDate(date)) throw new GameError("bad_move", "Missing date.");
    return startPlay(player.id, date);
  });
}

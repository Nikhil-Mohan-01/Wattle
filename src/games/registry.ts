import "server-only";
import type { GameId } from "@/lib/games";
import type { AnyGameModule } from "./types";

/** Server modules for each game. A game without a module isn't playable yet. */
export const GAME_MODULES: Partial<Record<GameId, AnyGameModule>> = {};

export function gameModule(id: GameId): AnyGameModule | undefined {
  return GAME_MODULES[id];
}

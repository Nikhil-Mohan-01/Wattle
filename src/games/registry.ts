import "server-only";
import type { GameId } from "@/lib/games";
import { deepcut } from "./deepcut/server";
import { honk } from "./honk/server";
import { hotcold } from "./hotcold/server";
import { quads } from "./quads/server";
import { sharp } from "./sharp/server";
import type { AnyGameModule } from "./types";

/** Server modules for each game. A game without a module isn't playable yet. */
export const GAME_MODULES: Partial<Record<GameId, AnyGameModule>> = {
  deepcut,
  honk,
  quads,
  hotcold,
  sharp,
};

export function gameModule(id: GameId): AnyGameModule | undefined {
  return GAME_MODULES[id];
}

"use client";

import type { ComponentType } from "react";
import type { GameId } from "@/lib/games";
import type { GameProps } from "./use-game";

/** Browser UI for each game. A game without an entry shows "coming soon". */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const GAME_CLIENTS: Partial<Record<GameId, ComponentType<GameProps<any, any>>>> = {};

"use client";

import type { ComponentType } from "react";
import type { GameId } from "@/lib/games";
import DeepCutClient from "./deepcut/client";
import HonkClient from "./honk/client";
import HotColdClient from "./hotcold/client";
import QuadsClient from "./quads/client";
import SharpClient from "./sharp/client";
import type { GameProps } from "./use-game";

/** Browser UI for each game. A game without an entry shows "coming soon". */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const GAME_CLIENTS: Partial<Record<GameId, ComponentType<GameProps<any, any>>>> = {
  deepcut: DeepCutClient,
  honk: HonkClient,
  quads: QuadsClient,
  hotcold: HotColdClient,
  sharp: SharpClient,
};

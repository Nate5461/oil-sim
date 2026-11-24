import type { GameConfig } from "./types";

/** The step 1 game rules, all in one place. */
export const DEFAULT_CONFIG: Readonly<GameConfig> = Object.freeze({
  historyDays: 60,
  playDays: 60,
  rebaseTo: 100,
  leverage: 5,
  feeBps: 5,
  liquidationFraction: 0.5,
  startingEquity: 10_000,
});

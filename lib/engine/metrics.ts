import { initState, step } from "./engine";
import type { Episode, GameConfig, GameState } from "./types";

/** Final equity over starting equity, minus 1 (0.1 is +10%). */
export function totalReturn(equityCurve: readonly number[]): number {
  return equityCurve[equityCurve.length - 1] / equityCurve[0] - 1;
}

/** The largest fall from a running peak, as a fraction of that peak (0.25 is 25%). */
export function maxDrawdown(equityCurve: readonly number[]): number {
  let peak = 0;
  let worst = 0;
  for (const equity of equityCurve) {
    peak = Math.max(peak, equity);
    if (peak > 0) worst = Math.max(worst, (peak - equity) / peak);
  }
  return worst;
}

/**
 * The baseline: 5x long from the first decision to the end, under the same
 * rules as the player. It pays one entry fee and can be liquidated.
 */
export function buyAndHold(episode: Episode, config: GameConfig): GameState {
  let state = initState(episode, config);
  while (state.status === "playing") state = step(state, "long", config);
  return state;
}

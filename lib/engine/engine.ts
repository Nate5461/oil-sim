import type { Episode, GameConfig, GameState, Position, Status, Trade } from "./types";

/** The direction of each position's exposure. */
const SIGN: Readonly<Record<Position, number>> = { long: 1, short: -1, flat: 0 };

/**
 * The state at the close of the last history day, before the first decision:
 * flat, with the starting equity.
 */
export function initState(episode: Episode, config: GameConfig): GameState {
  const { id, prices } = episode;
  const days = config.historyDays + config.playDays;
  if (prices.length !== days) {
    throw new Error(`Episode ${id} has ${prices.length} prices; the config expects ${days}.`);
  }
  if (!prices.every((p) => Number.isFinite(p) && p > 0)) {
    throw new Error(`Episode ${id} has a price that isn't a positive number.`);
  }
  return {
    prices,
    t: config.historyDays - 1,
    position: "flat",
    equity: config.startingEquity,
    equityCurve: [config.startingEquity],
    trades: [],
    status: "playing",
  };
}

/**
 * Decide at day t's close: hold `action` from t to t+1, paying the fee if it
 * changes the position, then move to t+1's close. Reads prices t and t+1 only.
 * Once the game is over, returns the state unchanged.
 */
export function step(state: GameState, action: Position, config: GameConfig): GameState {
  if (state.status !== "playing") return state;
  if (!Object.hasOwn(SIGN, action)) throw new Error(`Unknown action: ${String(action)}`);

  const { prices, t } = state;
  const trades: Trade[] = [...state.trades];
  let equity = state.equity;

  if (action !== state.position) {
    const fee = (equity * config.leverage * config.feeBps) / 10_000;
    equity -= fee;
    trades.push({ t, from: state.position, to: action, fee, liquidation: false });
  }

  const move = prices[t + 1] / prices[t] - 1;
  equity = Math.max(0, equity * (1 + SIGN[action] * config.leverage * move));

  const next = t + 1;
  const liquidated = equity < config.liquidationFraction * config.startingEquity;
  if (liquidated && action !== "flat") {
    trades.push({ t: next, from: action, to: "flat", fee: 0, liquidation: true });
  }

  let status: Status = "playing";
  if (liquidated) status = "liquidated";
  else if (next === prices.length - 1) status = "finished";

  return {
    prices,
    t: next,
    position: liquidated ? "flat" : action,
    equity,
    equityCurve: [...state.equityCurve, equity],
    trades,
    status,
  };
}

/** The closes the player can see at day t: everything up to and including t. */
export function visiblePrices(state: GameState): number[] {
  return state.prices.slice(0, state.t + 1);
}

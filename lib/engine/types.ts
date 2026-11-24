/** What the player holds from one close to the next. */
export type Position = "long" | "short" | "flat";

/** One blind episode: rebased prices only, no dates. */
export interface Episode {
  id: string;
  /** historyDays + playDays daily closes, rebased so the last history day is 100. */
  prices: readonly number[];
}

/** The game rules. DEFAULT_CONFIG in config.ts holds the step 1 values. */
export interface GameConfig {
  /** Days of price history shown before the first decision. */
  historyDays: number;
  /** Days played. Each one is a decision followed by one day's move. */
  playDays: number;
  /** The last history day's price after rebasing. */
  rebaseTo: number;
  /** Exposure as a multiple of equity, long or short. */
  leverage: number;
  /** Fee per position change, in basis points of exposure (equity times leverage). */
  feeBps: number;
  /** The game ends when equity falls below this fraction of the starting equity. */
  liquidationFraction: number;
  startingEquity: number;
}

/** A position change at the close of day t. */
export interface Trade {
  t: number;
  from: Position;
  to: Position;
  fee: number;
  /** The forced flat when equity falls below the liquidation level. It pays no fee. */
  liquidation: boolean;
}

export type Status = "playing" | "finished" | "liquidated";

export interface GameState {
  /** The whole episode. The player may only see prices[0..t]: use visiblePrices. */
  prices: readonly number[];
  /** Index of the latest close the player has seen. */
  t: number;
  /** The position held into the next day. */
  position: Position;
  equity: number;
  /** Equity at each close, from the last history day through t. */
  equityCurve: readonly number[];
  trades: readonly Trade[];
  status: Status;
}

import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "./config";
import { initState, step, visiblePrices } from "./engine";
import { mulberry32 } from "./rng";
import type { GameConfig, GameState, Position } from "./types";

// Short episodes keep the arithmetic checkable by hand: one history day (the
// starting close, t = 0), then one play day per price after it.
function rules(days: number, overrides: Partial<GameConfig> = {}): GameConfig {
  return { ...DEFAULT_CONFIG, historyDays: 1, playDays: days - 1, ...overrides };
}

function play(
  prices: number[],
  actions: Position[],
  overrides: Partial<GameConfig> = {},
): GameState {
  const config = rules(prices.length, overrides);
  const start = initState({ id: "test", prices }, config);
  return actions.reduce((state, action) => step(state, action, config), start);
}

const NO_FEE = { feeBps: 0 };

describe("initState", () => {
  it("starts flat at the last history close, with the starting equity", () => {
    const config = { ...DEFAULT_CONFIG, historyDays: 3, playDays: 2 };
    const state = initState({ id: "test", prices: [96, 98, 100, 101, 99] }, config);
    expect(state).toMatchObject({
      t: 2,
      position: "flat",
      equity: 10_000,
      equityCurve: [10_000],
      trades: [],
      status: "playing",
    });
  });

  it("rejects an episode whose length doesn't match the config", () => {
    expect(() => initState({ id: "short", prices: [100, 101] }, DEFAULT_CONFIG)).toThrow(/120/);
  });

  it("rejects prices at or below 0", () => {
    const config = rules(3);
    expect(() => initState({ id: "zero", prices: [100, 0, 101] }, config)).toThrow(/positive/);
    expect(() => initState({ id: "negative", prices: [100, -37, 101] }, config)).toThrow(/positive/);
  });
});

describe("step", () => {
  it("keeps equity unchanged when flat and there is no fee", () => {
    const state = play([100, 103, 97, 110], ["flat", "flat", "flat"], NO_FEE);
    expect(state.equityCurve).toEqual([10_000, 10_000, 10_000, 10_000]);
  });

  // Long gains on an up day and loses on a down day; short does the reverse.
  // At 5x, a 2% move is 10% of equity.
  it.each<[Position, number, number]>([
    ["long", 102, 11_000],
    ["long", 98, 9_000],
    ["short", 102, 9_000],
    ["short", 98, 11_000],
  ])("%s from 100 to %d leaves equity at %d", (position, next, expected) => {
    expect(play([100, next], [position], NO_FEE).equity).toBeCloseTo(expected, 6);
  });

  it.each([1, 2, 5])("multiplies the move by the leverage (%dx)", (leverage) => {
    const state = play([100, 101], ["long"], { ...NO_FEE, leverage });
    expect(state.equity / 10_000 - 1).toBeCloseTo(leverage * 0.01, 12);
  });

  it("charges the fee only when the position changes", () => {
    // Prices never move, so every change in equity is a fee: 5 bp of 5x
    // exposure is 0.25% of equity.
    const state = play([100, 100, 100, 100, 100, 100], ["long", "long", "flat", "flat", "short"]);
    expect(state.trades.map(({ t, from, to }) => [t, from, to])).toEqual([
      [0, "flat", "long"],
      [2, "long", "flat"],
      [4, "flat", "short"],
    ]);
    expect(state.trades[0].fee).toBe(25);
    const kept = 1 - 0.0025;
    expect(state.equityCurve).toEqual([
      10_000,
      expect.closeTo(10_000 * kept, 6),
      expect.closeTo(10_000 * kept, 6),
      expect.closeTo(10_000 * kept ** 2, 6),
      expect.closeTo(10_000 * kept ** 2, 6),
      expect.closeTo(10_000 * kept ** 3, 6),
    ]);
  });

  it("charges one fee for going straight from long to short", () => {
    const state = play([100, 100, 100], ["long", "short"]);
    expect(state.trades.map((trade) => trade.to)).toEqual(["long", "short"]);
    expect(state.equity).toBeCloseTo(10_000 * 0.9975 ** 2, 6);
  });

  it("liquidates below 50% of starting equity: forces flat and ends the game", () => {
    // 5x long through an 11% drop loses 55%, with two days still to play.
    const prices = [100, 89, 95, 100];
    const state = play(prices, ["long"], NO_FEE);
    expect(state.status).toBe("liquidated");
    expect(state.position).toBe("flat");
    expect(state.equity).toBeCloseTo(4_500, 6);
    expect(state.trades.at(-1)).toEqual({ t: 1, from: "long", to: "flat", fee: 0, liquidation: true });
    expect(step(state, "long", rules(prices.length, NO_FEE))).toBe(state);
  });

  it("keeps playing just above the liquidation level", () => {
    // A 9% drop at 5x loses 45%: equity 5,500, still above 5,000.
    const state = play([100, 91, 95], ["long"], NO_FEE);
    expect(state.status).toBe("playing");
    expect(state.equity).toBeCloseTo(5_500, 6);
  });

  it("floors equity at 0 when a move is bigger than the equity can take", () => {
    // At 5x, a 30% move against the position would leave -50% equity.
    expect(play([100, 70], ["long"], NO_FEE).equity).toBe(0);
    expect(play([100, 130], ["short"], NO_FEE).equity).toBe(0);
  });

  it("never takes equity below 0, whatever the prices and actions", () => {
    const rng = mulberry32(1);
    const positions: Position[] = ["long", "short", "flat"];
    const outcomes = { finished: 0, liquidated: 0, wipedOut: 0 };
    for (let game = 0; game < 300; game++) {
      // Daily moves of up to 1% to 40%, so some games last and some blow up.
      const size = 0.01 + 0.39 * rng();
      const prices = [100];
      while (prices.length < 31) prices.push(prices.at(-1)! * (1 + size * (2 * rng() - 1)));
      const config = rules(prices.length);
      let state = initState({ id: `random-${game}`, prices }, config);
      while (state.status === "playing") {
        state = step(state, positions[Math.floor(rng() * 3)], config);
        expect(state.equity).toBeGreaterThanOrEqual(0);
        expect(Number.isFinite(state.equity)).toBe(true);
      }
      outcomes[state.status] += 1;
      if (state.equity === 0) outcomes.wipedOut += 1;
    }
    // Both endings, and the floor itself, were actually exercised.
    expect(outcomes.finished).toBeGreaterThan(0);
    expect(outcomes.liquidated).toBeGreaterThan(0);
    expect(outcomes.wipedOut).toBeGreaterThan(0);
  });

  it("plays 60 days after 60 days of history with the default rules", () => {
    const prices = Array.from({ length: 120 }, (_, i) => 100 + Math.sin(i));
    let state = initState({ id: "default", prices }, DEFAULT_CONFIG);
    expect(state.t).toBe(59);
    let days = 0;
    while (state.status === "playing") {
      state = step(state, "flat", DEFAULT_CONFIG);
      days += 1;
    }
    expect(days).toBe(60);
    expect(state).toMatchObject({ t: 119, status: "finished" });
    expect(state.equityCurve).toHaveLength(61);
    expect(step(state, "long", DEFAULT_CONFIG)).toBe(state);
  });

  it("returns a new state and leaves the old one untouched", () => {
    const config = rules(3);
    const before = initState({ id: "test", prices: [100, 102, 101] }, config);
    // Frozen, so any attempt to change it in place throws.
    Object.freeze(before);
    Object.freeze(before.equityCurve);
    Object.freeze(before.trades);
    const after = step(before, "long", config);
    expect(after).not.toBe(before);
    expect(before).toMatchObject({ t: 0, position: "flat", equity: 10_000, equityCurve: [10_000] });
  });

  it("rejects an unknown action", () => {
    const config = rules(2);
    const state = initState({ id: "test", prices: [100, 101] }, config);
    expect(() => step(state, "buy" as Position, config)).toThrow(/unknown action/i);
  });
});

describe("no look-ahead", () => {
  it("a step at t never reads a price past t+1", () => {
    const raw = [100, 101, 99, 102, 98, 103, 97];
    const actions: Position[] = ["long", "short", "flat", "long", "long", "short"];
    // Throws on any read past `limit`, and records the furthest index read.
    let limit = Infinity;
    let furthest = -1;
    const prices = new Proxy(raw, {
      get(target, key, receiver) {
        if (typeof key === "string" && /^\d+$/.test(key)) {
          const i = Number(key);
          if (i > limit) throw new Error(`read prices[${i}] in a step at t = ${limit - 1}`);
          furthest = Math.max(furthest, i);
        }
        return Reflect.get(target, key, receiver);
      },
    });
    const config = rules(raw.length);
    let state = initState({ id: "guarded", prices }, config);
    for (const action of actions) {
      limit = state.t + 1;
      furthest = -1;
      state = step(state, action, config);
      // The step did read p[t+1] through the guard, so the guard was in the way.
      expect(furthest).toBe(limit);
    }
    expect(state.status).toBe("finished");
    expect(state.equityCurve).toEqual(play(raw, actions).equityCurve);
  });

  it("visiblePrices shows the player prices up to t only", () => {
    const config = { ...DEFAULT_CONFIG, historyDays: 2, playDays: 2 };
    let state = initState({ id: "test", prices: [99, 100, 105, 110] }, config);
    expect(visiblePrices(state)).toEqual([99, 100]);
    state = step(state, "long", config);
    expect(visiblePrices(state)).toEqual([99, 100, 105]);
  });
});

import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "./config";
import { buyAndHold, maxDrawdown, totalReturn } from "./metrics";

describe("totalReturn", () => {
  it("is final equity over starting equity, minus 1", () => {
    expect(totalReturn([10_000, 12_000, 11_000])).toBeCloseTo(0.1, 12);
    expect(totalReturn([10_000, 4_500])).toBeCloseTo(-0.55, 12);
    expect(totalReturn([10_000])).toBe(0);
  });
});

describe("maxDrawdown", () => {
  it("is the largest fall from a running peak, as a fraction of that peak", () => {
    // 120 to 90 is 25%; 130 to 65 is 50%.
    expect(maxDrawdown([100, 120, 90, 130, 65, 140])).toBeCloseTo(0.5, 12);
  });

  it("is 0 when equity never falls", () => {
    expect(maxDrawdown([100, 100, 105, 110])).toBe(0);
  });

  it("is 1 when equity goes to 0", () => {
    expect(maxDrawdown([100, 50, 0])).toBe(1);
  });
});

describe("buyAndHold", () => {
  const config = { ...DEFAULT_CONFIG, historyDays: 1, playDays: 3 };

  it("goes 5x long on the first day and holds, paying one fee", () => {
    const prices = [100, 101, 102, 103];
    const state = buyAndHold({ id: "test", prices }, config);
    expect(state.status).toBe("finished");
    expect(state.trades).toEqual([{ t: 0, from: "flat", to: "long", fee: 25, liquidation: false }]);
    let expected = 10_000 - 25;
    for (let t = 0; t < 3; t++) expected *= 1 + 5 * (prices[t + 1] / prices[t] - 1);
    expect(state.equity).toBeCloseTo(expected, 6);
  });

  it("is liquidated by the same rules as a player", () => {
    // 5x long through a 12% drop loses 60%.
    const state = buyAndHold({ id: "test", prices: [100, 88, 120, 130] }, config);
    expect(state).toMatchObject({ status: "liquidated", t: 1, position: "flat" });
  });
});

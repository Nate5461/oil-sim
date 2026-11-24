import { describe, expect, it } from "vitest";
import { mulberry32 } from "./rng";

const draw = (seed: number, n: number) => Array.from({ length: n }, mulberry32(seed));

describe("mulberry32", () => {
  it("matches the reference implementation", () => {
    // Output of bryc's public-domain mulberry32 (github.com/bryc/code,
    // jshash/PRNGs.md). Changing the generator reshuffles every episode.
    expect(draw(1, 3)).toEqual([0.6270739405881613, 0.002735721180215478, 0.5274470399599522]);
    expect(draw(2026, 3)).toEqual([0.45540769933722913, 0.30849614599719644, 0.6611574492417276]);
  });

  it("repeats the same sequence for the same seed", () => {
    expect(draw(42, 1_000)).toEqual(draw(42, 1_000));
  });

  it("gives a different sequence for a different seed", () => {
    expect(draw(42, 5)).not.toEqual(draw(43, 5));
  });

  it("returns floats in [0, 1), spread evenly", () => {
    const xs = draw(7, 10_000);
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...xs)).toBeLessThan(1);
    const mean = xs.reduce((sum, x) => sum + x, 0) / xs.length;
    expect(Math.abs(mean - 0.5)).toBeLessThan(0.01);
  });
});

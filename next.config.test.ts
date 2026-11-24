import { describe, expect, it } from "vitest";
import nextConfig from "@/next.config";

// The portfolio's rewrites point at these two paths. Changing either one here
// breaks nathanbissett.com/oil until the portfolio is updated to match.
describe("multi-zone config", () => {
  it("serves pages under /oil", () => {
    expect(nextConfig.basePath).toBe("/oil");
  });

  it("serves /_next assets under /oil-static", () => {
    expect(nextConfig.assetPrefix).toBe("/oil-static");
  });
});

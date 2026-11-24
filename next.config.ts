import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Multi-zones: this app is a zone of the portfolio, which rewrites /oil,
  // /oil/:path+ and /oil-static/:path+ to this deployment (see README).
  basePath: "/oil",
  // Serves this zone's /_next assets under /oil-static/_next/... so they can't
  // collide with the portfolio's own assets.
  assetPrefix: "/oil-static",
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;

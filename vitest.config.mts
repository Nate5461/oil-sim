import { defineConfig } from "vitest/config";

export default defineConfig({
  // Resolve the "@/*" alias from tsconfig.json (built into Vite 8).
  resolve: { tsconfigPaths: true },
  test: {
    // The engine and build scripts are plain TypeScript; no DOM needed.
    environment: "node",
  },
});

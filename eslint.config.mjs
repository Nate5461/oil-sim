import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const PURE = "The engine is pure: no I/O, clocks or unseeded randomness.";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // The UI, the episode builder and step 2's scoring all run this one
    // engine, so the same inputs must give the same results everywhere.
    files: ["lib/engine/**/*.ts"],
    ignores: ["lib/engine/**/*.test.ts"],
    rules: {
      "no-restricted-globals": [
        "error",
        ...[
          "Date",
          "performance",
          "crypto",
          "fetch",
          "process",
          "window",
          "document",
          "localStorage",
          "sessionStorage",
        ].map((name) => ({ name, message: PURE })),
      ],
      "no-restricted-properties": [
        "error",
        { object: "Math", property: "random", message: "Use mulberry32 from lib/engine/rng.ts." },
      ],
      "no-restricted-imports": [
        "error",
        { patterns: [{ regex: "^(?!\\.\\.?/)", message: "The engine only imports its own files." }] },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;

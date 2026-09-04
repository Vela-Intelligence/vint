import { createRequire } from "node:module"
import { dirname, join } from "node:path"
import { defineConfig } from "vitest/config"

// The Solid differential suite (tests/reactive.solid-diff.test.ts) must run
// Solid's BROWSER build: under Node's export conditions `solid-js` resolves
// to dist/server.js, where createEffect is a no-op and memos compute once —
// every trace would be empty and the comparison meaningless.
const solidBrowserBuild = join(
  dirname(createRequire(import.meta.url).resolve("solid-js/package.json")),
  "dist/solid.js",
)

export default defineConfig({
  define: { __VINT_FULL__: JSON.stringify(process.env.VINT_FULL === "1") },
  resolve: {
    alias: { "solid-js": solidBrowserBuild },
  },
  test: {
    environment: "happy-dom",
    globals: true,
    include: ["tests/**/*.test.ts"],
    exclude: ["tests/browser/**", "node_modules/**"],
    coverage: {
      provider: "v8",
      include: ["src/**"],
      exclude: ["src/props.generated.ts"],
      reporter: ["text", "html"],
      // Ratcheted upward as the rebuild lands (assessment §9, Phase 1):
      // start just under the measured baseline, end at 95/95.
      thresholds: { lines: 90, branches: 85, functions: 90, statements: 90 },
    },
  },
})

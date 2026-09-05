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
  define: {
    __VINT_FULL__: JSON.stringify(process.env.VINT_FULL !== "0"),
    // property/fuzz seeds and length (F4): CI runs a small seed matrix and a
    // long round; locally `VINT_SEED=777 VINT_RUNS=2500 npx vitest run tests/reactive.property.test.ts`
    __VINT_SEED__: JSON.stringify(Number(process.env.VINT_SEED ?? 20260904)),
    __VINT_RUNS__: JSON.stringify(Number(process.env.VINT_RUNS ?? 200)),
  },
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
      // Ratcheted as the rebuild landed (assessment §9): measured 97.6 /
      // 93.6 / 96.7 / 97.6 after Phase 3; branches sit at 90 until the
      // prod-only (DEV === false) paths get their own suite run.
      thresholds: { lines: 95, branches: 90, functions: 95, statements: 95 },
    },
  },
})

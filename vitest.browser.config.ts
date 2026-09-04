import { defineConfig } from "vitest/config"

// Real-browser run (assessment §9, Phase 1). The whole unit suite plus
// tests/browser/**, which covers what happy-dom cannot model: focus and
// selection survival across For moves, script never executing from the
// children path, SVG IDL routing, the platform's createElement validation,
// CSS transitions across style diffs. CI runs this once per browser with
// --browser.name=chromium|firefox|webkit.
export default defineConfig({
  define: { __VINT_FULL__: JSON.stringify(process.env.VINT_FULL === "1") },
  test: {
    globals: true,
    include: ["tests/**/*.test.ts"],
    // the Solid differential suite is a Node comparison, not a DOM test
    exclude: ["tests/reactive.solid-diff.test.ts", "node_modules/**"],
    browser: {
      enabled: true,
      provider: "playwright",
      name: "chromium",
      headless: true,
      screenshotFailures: false,
    },
  },
})

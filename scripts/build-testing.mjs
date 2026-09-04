// dist/vint-testing.js and dist/vint-testing.pkg.js — the verification loop
// (contract §T). Built twice from src/testing.ts, and the ONLY difference is
// the import specifier for vint itself: the testing helpers must run against
// the same scheduler instance as the app, or a binding created by `render`
// would read the app's signals under a different `Listener` and subscribe to
// nothing — silent staleness, with no warning. So vint is EXTERNAL here, and
// the specifier matches how the consumer imports it:
//   vendored:  ./vint.js   (side by side with vint.js → the same file URL)
//   package:   vint        (resolves through the same exports map and
//                           conditions the app used → the same file)
import { readFileSync } from "node:fs"
import { build } from "esbuild"

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"))
const banner = `/* vint/testing ${pkg.version} — MIT License, Copyright (c) 2026 Robert Salesas. https://github.com/Vela-Intelligence/vint */`

const rewriteVint = (to) => ({
  name: "vint-external",
  setup(b) {
    b.onResolve({ filter: /^\.\/index$/ }, () => ({ path: to, external: true }))
  },
})

for (const [outfile, specifier] of [
  ["dist/vint-testing.js", "./vint.js"],
  ["dist/vint-testing.pkg.js", "vint"],
]) {
  await build({
    entryPoints: ["src/testing.ts"],
    bundle: true,
    format: "esm",
    outfile,
    banner: { js: banner },
    plugins: [rewriteVint(specifier)],
    logLevel: "info",
  })
}

// dist/vint.prod.js — DEV statically false (contract §E). Two esbuild passes
// on purpose: pass 1 bundles with __VINT_DEV__ defined false, which inlines
// the imported DEV const as a literal at every `if (DEV)` site — but esbuild
// does not re-run dead-code elimination after cross-module inlining, so
// `if (false) throw ...` survives. Pass 2 re-parses that output: the literal
// conditions are now visible at parse time, the dead branches go, and the
// dev-only message objects they referenced tree-shake with them. The smoke
// test greps the result for dev-only codes to prove it.
import { readFileSync } from "node:fs"
import { build } from "esbuild"

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"))
const banner = `/* vint ${pkg.version} — MIT License, Copyright (c) 2026 Robert Salesas. https://github.com/Vela-Intelligence/vint */`

const pass1 = await build({
  entryPoints: ["src/index.ts"],
  bundle: true,
  format: "esm",
  minify: true,
  define: { __VINT_DEV__: "false" },
  write: false,
  logLevel: "error",
})

await build({
  stdin: { contents: pass1.outputFiles[0].text, loader: "js", resolveDir: "dist" },
  bundle: true,
  format: "esm",
  minify: true,
  banner: { js: banner },
  outfile: "dist/vint.prod.js",
  logLevel: "info",
})

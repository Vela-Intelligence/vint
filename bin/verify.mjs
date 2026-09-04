#!/usr/bin/env node
// vint verify — run an app's tests in Node with happy-dom, no framework.
//
//   npx vint verify tests/          (package install)
//   node verify.mjs tests/          (vendored: copy this file next to vint.js)
//
// Finds *.test.mjs / *.test.js under the given paths (or explicit files),
// registers a happy-dom document, provides global `test`/`describe` in the
// vitest `globals: true` shape (so the same files run under vitest unchanged),
// runs every test in order, and prints PASS/FAIL per test with everything the
// app wrote to the console — vint's E-* warnings are the diagnosis. Exits 1
// on any failure, 2 when happy-dom is missing. VINT_VERBOSE=1 also streams
// console output live, for debugging a hang.
import { readdirSync, statSync } from "node:fs"
import { createRequire } from "node:module"
import { join, resolve } from "node:path"
import { pathToFileURL } from "node:url"

const args = process.argv.slice(2).filter((a) => a !== "verify")
const cwd = process.cwd()

let GlobalRegistrator
try {
  ;({ GlobalRegistrator } = createRequire(join(cwd, "package.json"))("@happy-dom/global-registrator"))
} catch {
  console.error("vint verify needs happy-dom: npm i -D happy-dom @happy-dom/global-registrator")
  process.exit(2)
}
GlobalRegistrator.register()

const tests = []
const prefix = []
globalThis.test = (name, fn) => tests.push({ name: [...prefix, name].join(" › "), fn })
globalThis.describe = (name, fn) => {
  prefix.push(name)
  fn()
  prefix.pop()
}

const files = []
const walk = (p) => {
  const st = statSync(p)
  if (st.isDirectory()) {
    for (const entry of readdirSync(p)) if (entry !== "node_modules") walk(join(p, entry))
  } else if (/\.test\.(mjs|js)$/.test(p)) files.push(p)
}
for (const a of args.length ? args : ["."]) walk(resolve(cwd, a))
if (!files.length) {
  console.error(`vint verify: no *.test.mjs or *.test.js files under ${args.join(", ") || "."}`)
  process.exit(1)
}
for (const f of files) await import(pathToFileURL(f).href)

let failed = 0
for (const t of tests) {
  const lines = []
  const originals = {}
  for (const level of ["warn", "error", "log"]) {
    originals[level] = console[level]
    console[level] = (...a) => {
      lines.push(`console.${level}: ${a.map(String).join(" ")}`)
      if (process.env.VINT_VERBOSE) originals[level](...a)
    }
  }
  document.body.replaceChildren()
  let error = null
  const onRejection = (err) => {
    error ??= err
  }
  process.on("unhandledRejection", onRejection)
  try {
    await t.fn()
  } catch (err) {
    error = err
  } finally {
    process.off("unhandledRejection", onRejection)
    for (const level of ["warn", "error", "log"]) console[level] = originals[level]
  }
  if (error) {
    failed++
    console.log(`FAIL ${t.name}`)
    console.log(
      `  ${String(error?.stack ?? error)
        .split("\n")
        .slice(0, 8)
        .join("\n  ")}`,
    )
    for (const line of lines) console.log(`  ${line}`)
  } else {
    console.log(`PASS ${t.name}`)
    for (const line of lines) if (/\bE-[A-Z-]+/.test(line)) console.log(`  note: ${line}`)
  }
}
console.log(
  `\n${tests.length - failed} passed, ${failed} failed (${files.length} file${files.length === 1 ? "" : "s"})`,
)
process.exit(failed ? 1 : 0)

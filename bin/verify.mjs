#!/usr/bin/env node
// vint verify — run an app's tests in Node with happy-dom, no framework.
//
//   node verify.mjs tests/          (vendored: copy this file next to vint.js)
//   npm run verify                  (git install: "verify": "vint verify tests/")
//
// Finds *.test.mjs / *.test.js under the given paths (or explicit files),
// registers a happy-dom document, provides global `test`/`it`/`describe`/
// `test.skip`/`beforeEach`/`afterEach` in the vitest `globals: true` shape (so
// the same files run under vitest unchanged; hooks are scoped to their
// describe), runs every test in order, and prints PASS/FAIL/SKIP per test with
// everything the app wrote to the console — vint's E-* warnings are the
// diagnosis. After each test every root `render` left mounted is disposed
// (vint/testing registers `disposeAll` on a well-known global), so a forgotten
// `dispose()` never leaks subscriptions into the next test. Exits 1 on any
// failure, 2 when happy-dom is missing. VINT_VERBOSE=1 also streams console
// output live, for debugging a hang.
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

// --- registration: vitest's globals shape, describe-scoped hooks --------------
const tests = []
/** The describe stack: each level has a name and the hooks declared in it. */
const scopes = [{ name: null, before: [], after: [] }]
const current = () => scopes[scopes.length - 1]
const register = (name, fn, skip) => {
  tests.push({
    name: scopes
      .map((s) => s.name)
      .filter(Boolean)
      .concat(name)
      .join(" › "),
    fn,
    skip,
    before: scopes.flatMap((s) => s.before), // outer first
    after: scopes.flatMap((s) => s.after).reverse(), // inner first
  })
}
const test = (name, fn) => register(name, fn, false)
test.skip = (name, fn) => register(name, fn, true)
globalThis.test = test
globalThis.it = test
globalThis.describe = (name, fn) => {
  scopes.push({ name, before: [], after: [] })
  try {
    fn()
  } finally {
    scopes.pop()
  }
}
globalThis.beforeEach = (fn) => current().before.push(fn)
globalThis.afterEach = (fn) => current().after.push(fn)

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

// --- run --------------------------------------------------------------------
/** vint/testing's disposeAll, if the app's tests loaded it (T1). */
const disposeAll = () => globalThis[Symbol.for("vint.testing")]?.disposeAll?.()

let failed = 0
let skipped = 0
for (const t of tests) {
  if (t.skip) {
    skipped++
    console.log(`SKIP ${t.name}`)
    continue
  }
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
    for (const hook of t.before) await hook()
    await t.fn()
  } catch (err) {
    error = err
  } finally {
    // afterEach hooks run even when the test threw; their own throw is the
    // failure only if the test itself passed
    for (const hook of t.after) {
      try {
        await hook()
      } catch (err) {
        error ??= err
      }
    }
    try {
      disposeAll()
    } catch (err) {
      error ??= err
    }
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
const passed = tests.length - failed - skipped
console.log(
  `\n${passed} passed, ${failed} failed${skipped ? `, ${skipped} skipped` : ""} (${files.length} file${files.length === 1 ? "" : "s"})`,
)
process.exit(failed ? 1 : 0)

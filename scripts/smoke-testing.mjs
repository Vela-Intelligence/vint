// Smoke test for the built testing bundles, with a DOM: both variants load,
// export exactly the §T surface, and — the one that matters — share the
// app's vint instance: a signal created through `vint` drives a view
// rendered through `vint/testing`. Two scheduler copies would render once.
import { GlobalRegistrator } from "@happy-dom/global-registrator"

GlobalRegistrator.register()

const expected = [
  "byText",
  "captureWarnings",
  "click",
  "disposeAll",
  "fire",
  "pressKey",
  "render",
  "setValue",
  "settle",
  "text",
  "type",
  "visibleText",
  "waitFor",
]
const fail = (msg) => {
  console.error(`smoke-testing FAIL — ${msg}`)
  process.exit(1)
}

const vint = await import("../dist/vint.js")
for (const file of ["vint-testing.js", "vint-testing.pkg.js"]) {
  const testing = await import(`../dist/${file}`)
  const missing = expected.filter((n) => !(n in testing))
  if (missing.length) fail(`${file}: missing exports: ${missing.join(", ")}`)
  const extra = Object.keys(testing).filter((n) => !expected.includes(n))
  if (extra.length) fail(`${file}: unexpected exports: ${extra.join(", ")}`)

  const [n, setN] = vint.createSignal(1)
  const { container, dispose } = testing.render(() => vint.tags.div(() => `n=${n()}`))
  if (testing.text(container) !== "n=1") fail(`${file}: first render: ${testing.text(container)}`)
  setN(2)
  if (testing.text(container) !== "n=2") {
    fail(`${file}: the view did not update — vint/testing is running a SECOND vint instance`)
  }
  const codes = testing.captureWarnings(() => vint.createEffect(() => {}))
  if (!codes.includes("E-NO-OWNER")) fail(`${file}: captureWarnings missed E-NO-OWNER (${codes})`)
  dispose()
  if (document.body.contains(container)) fail(`${file}: dispose left the container`)
}
console.log(
  "smoke-testing OK — both testing bundles: export surface, one vint instance, captureWarnings",
)

// vint verify itself: the fixture has passing tests, a failing test whose
// report must carry the app's E-SAMEREF-SET warning, a passing test whose
// warning must appear as a note, an `it` wrapped in describe-scoped hooks, a
// skipped test, and a pair proving the runner disposed a root the previous
// test left mounted (T1 disposeAll). Exit code 1.
import { execFileSync } from "node:child_process"

let out = ""
let code = 0
try {
  out = execFileSync(process.execPath, ["bin/verify.mjs", "scripts/verify-fixture"], {
    encoding: "utf8",
  })
} catch (err) {
  out = String(err.stdout)
  code = err.status
}
if (code !== 1) fail(`vint verify exit code ${code}, expected 1\n${out}`)
for (const needle of [
  "PASS counter › increments",
  "FAIL counter › a deliberate failure",
  "E-SAMEREF-SET",
  "note: console.warn: E-DEAD-BINDING",
  "PASS counter › it is an alias of test, and the describe's hooks ran around it",
  "SKIP counter › a skipped test is reported and never run",
  "PASS runner disposes what a test left mounted › the previous test's root was disposed before this one ran",
  "5 passed, 1 failed, 1 skipped (1 file)",
]) {
  if (!out.includes(needle)) fail(`vint verify output lacks ${JSON.stringify(needle)}\n${out}`)
}
console.log("smoke-testing OK — vint verify: report shape, warnings as diagnosis, exit code")

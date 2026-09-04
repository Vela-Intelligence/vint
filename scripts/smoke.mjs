// Smoke test for the built bundles: plain-Node import of BOTH files, export
// surface, a reactive round-trip, and the DEV matrix (contract §E) —
// dist/vint.js must warn in dev, dist/vint.prod.js must be silent AND must
// not contain the dev-only text at all. Runs with no DOM on purpose.
import { readFileSync } from "node:fs"

const expected = [
  "batch",
  "createEffect",
  "createMemo",
  "createRenderEffect",
  "createResource",
  "createRoot",
  "createSignal",
  "For",
  "getOwner",
  "Match",
  "mount",
  "on",
  "onCleanup",
  "onMount",
  "runWithOwner",
  "Show",
  "Switch",
  "tags",
  "tagsNS",
  "untrack",
]

const fail = (msg) => {
  console.error(`smoke FAIL — ${msg}`)
  process.exit(1)
}

async function check(file, dev) {
  const vint = await import(`../dist/${file}`)
  const missing = expected.filter((name) => !(name in vint))
  if (missing.length) fail(`${file}: missing exports: ${missing.join(", ")}`)
  const extra = Object.keys(vint).filter((name) => !expected.includes(name))
  if (extra.length) fail(`${file}: unexpected exports: ${extra.join(", ")}`)

  const seen = []
  let setN
  const dispose = vint.createRoot((d) => {
    const [n, set] = vint.createSignal(1)
    setN = set
    vint.createEffect(() => {
      seen.push(n())
    })
    return d
  })
  setN(2)
  dispose()
  setN(3) // disposed: must not run
  if (JSON.stringify(seen) !== "[1,2]") fail(`${file}: reactive round-trip: ${seen}`)

  // DEV matrix: E-NO-OWNER is a dev-only warning — dev warns, prod is silent
  const warned = []
  const origWarn = console.warn
  console.warn = (m) => warned.push(String(m))
  vint.createEffect(() => {})
  console.warn = origWarn
  const sawNoOwner = warned.some((w) => w.startsWith("E-NO-OWNER"))
  if (dev && !sawNoOwner) fail(`${file}: DEV should be on — E-NO-OWNER did not warn`)
  if (!dev && sawNoOwner) fail(`${file}: DEV should be off — E-NO-OWNER warned`)

  // always-on checks survive both builds
  let threw = false
  try {
    vint.mount(null, () => null)
  } catch (e) {
    threw = String(e.message).startsWith("E-MOUNT-CONTAINER")
  }
  if (!threw) fail(`${file}: always-on E-MOUNT-CONTAINER missing`)

  // the prod file must not carry dev-only text; the dev file must
  const src = readFileSync(new URL(`../dist/${file}`, import.meta.url), "utf8")
  for (const code of [
    "E-EVENT-VALUE",
    "E-SAMEREF-SET",
    "E-DEAD-BINDING",
    "E-WRITE-IN-MEMO",
    "E-DISPOSED-MEMO",
  ]) {
    const present = src.includes(code)
    if (dev && !present) fail(`${file}: dev bundle lost ${code}`)
    if (!dev && present) fail(`${file}: prod bundle still contains ${code} — DEV was not folded`)
  }
  for (const code of ["E-NO-REF", "E-MOUNT-CONTAINER", "E-FOR-DUPKEY", "E-LOOP"]) {
    if (!src.includes(code)) fail(`${file}: always-on ${code} missing from bundle`)
  }
}

await check("vint.js", true)
await check("vint.prod.js", false)
console.log("smoke OK — both bundles: export surface, reactive round-trip, DEV matrix")

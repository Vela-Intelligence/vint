// Smoke test for the built bundle: plain-Node import (exercises the
// import.meta.env seam in dev.ts), export surface, and a reactive round-trip.
import * as vint from "../dist/vint.js"

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
const missing = expected.filter((name) => !(name in vint))
if (missing.length) {
  console.error("smoke FAIL — missing exports:", missing.join(", "))
  process.exit(1)
}

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
if (JSON.stringify(seen) !== "[1,2]") {
  console.error("smoke FAIL — reactive round-trip:", seen)
  process.exit(1)
}
console.log("smoke OK — export surface + reactive round-trip")

// Alignment guard: the agent-facing artifacts (docs/llms.txt,
// skills/vint/SKILL.md, docs/contract.md) must never drift from the code.
// Mechanical checks only — anything checkable here is checked here, so CI
// catches misalignment before an agent inherits it.
//
// Checks:
//   1. Error codes: every code in src/dev.ts MESSAGES appears in llms.txt,
//      SKILL.md, and contract.md — and no artifact names a code that no
//      longer exists.
//   2. Exports: every value export in src/index.ts appears in llms.txt's and
//      SKILL.md's export lists — and no artifact lists a phantom export.
//   3. Contract clauses: every clause id cited anywhere (src, tests,
//      llms.txt, SKILL.md) exists as a defined clause in contract.md.
//   4. README bundle-size claim stays within 20% of the built dist/vint.js.
//      (Skipped with a note when dist/ hasn't been built.)

import { readFileSync, existsSync, statSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const read = (p) => readFileSync(join(root, p), "utf8")

const failures = []
const fail = (msg) => failures.push(msg)

// --- sources of truth -------------------------------------------------------

const devSrc = read("src/dev.ts")
const indexSrc = read("src/index.ts")
const llms = read("docs/llms.txt")
const skill = read("skills/vint/SKILL.md")
const contract = read("docs/contract.md")
const readme = read("README.md")

// 1. Error codes ------------------------------------------------------------

const codesInDev = new Set([...devSrc.matchAll(/^\s+"(E-[A-Z-]+)":/gm)].map((m) => m[1]))
if (codesInDev.size === 0) fail("could not parse any E-* codes out of src/dev.ts — check the parser")

for (const [name, text] of [
  ["docs/llms.txt", llms],
  ["skills/vint/SKILL.md", skill],
  ["docs/contract.md", contract],
]) {
  for (const code of codesInDev) {
    if (!text.includes(code)) fail(`${name} is missing error code ${code} (defined in src/dev.ts)`)
  }
  for (const m of text.matchAll(/E-[A-Z]+(?:-[A-Z]+)*/g)) {
    if (!codesInDev.has(m[0])) fail(`${name} names ${m[0]}, which does not exist in src/dev.ts`)
  }
}

// 2. Exports ----------------------------------------------------------------

// value exports only (export { a, b } from ...), not `export type`
const exportBlocks = [...indexSrc.matchAll(/^export \{([^}]+)\}/gm)].map((m) => m[1])
const exportsInIndex = new Set(
  exportBlocks
    .flatMap((b) => b.split(","))
    .map((s) => s.trim())
    .filter(Boolean),
)
if (exportsInIndex.size === 0) fail("could not parse any value exports out of src/index.ts")

const exportListOf = (text, name) => {
  const m = text.match(/Exports(?: \(complete\))?:([\s\S]*?)\.\n/)
  if (!m) {
    fail(`${name} has no "Exports:" list`)
    return new Set()
  }
  return new Set(m[1].split(/[\s,]+/).filter((w) => /^[a-zA-Z]+$/.test(w)))
}

for (const [name, text] of [
  ["docs/llms.txt", llms],
  ["skills/vint/SKILL.md", skill],
]) {
  const listed = exportListOf(text, name)
  if (listed.size === 0) continue
  for (const exp of exportsInIndex) {
    if (!listed.has(exp)) fail(`${name} export list is missing "${exp}" (exported from src/index.ts)`)
  }
  for (const exp of listed) {
    if (!exportsInIndex.has(exp)) fail(`${name} export list names "${exp}", which src/index.ts does not export`)
  }
}

// 3. Contract clause ids ----------------------------------------------------

// defined clauses: "- **R8. ..." style bullets in contract.md
const definedClauses = new Set([...contract.matchAll(/\*\*([RODCA]\d+)\./g)].map((m) => m[1]))
if (definedClauses.size === 0) fail("could not parse any clause definitions out of docs/contract.md")

const clauseRef = /\b([RODCA]\d{1,2})\b/g
const srcFiles = ["src/reactive.ts", "src/dom.ts", "src/control.ts", "src/resource.ts", "src/dev.ts"]
const citers = [
  ...srcFiles.map((f) => [f, read(f)]),
  ["docs/llms.txt", llms],
  ["skills/vint/SKILL.md", skill],
]
for (const [name, text] of citers) {
  for (const m of text.matchAll(clauseRef)) {
    // only treat it as a citation when it looks like one: parenthesized,
    // comma-listed, or "contract X" — a bare match like variable "A1" is
    // too noisy, so require the clause-letter prefix set and a digit range
    // that contract.md could plausibly define
    if (!definedClauses.has(m[1])) {
      fail(`${name} cites contract clause ${m[1]}, which docs/contract.md does not define`)
    }
  }
}

// 4. README bundle-size claim ----------------------------------------------

const sizeClaim = readme.match(/~(\d+)\s?kB ESM file/)
if (!sizeClaim) {
  fail("README no longer states the bundle size (\"~NN kB ESM file\") — keep the claim, keep it honest")
} else if (existsSync(join(root, "dist/vint.js"))) {
  const actual = statSync(join(root, "dist/vint.js")).size / 1000
  const claimed = Number(sizeClaim[1])
  if (Math.abs(actual - claimed) / actual > 0.2) {
    fail(
      `README claims ~${claimed} kB but dist/vint.js is ${actual.toFixed(1)} kB — update the README claim`,
    )
  }
} else {
  console.log("note: dist/vint.js not built — size-claim check skipped (run npm run build first)")
}

// --- report ----------------------------------------------------------------

if (failures.length) {
  console.error(`alignment check FAILED (${failures.length}):`)
  for (const f of failures) console.error(`  - ${f}`)
  process.exit(1)
}
console.log(
  `alignment OK — ${codesInDev.size} error codes, ${exportsInIndex.size} exports, ${definedClauses.size} contract clauses consistent across code, llms.txt, and SKILL.md`,
)

// Cross-run summary: the five-framework × four-engine table.
//
//   node harness/summary.mjs
//
// For each (model, condition, task), the MOST RECENT run wins — so every
// correction (32k re-runs, reworded specs, fixed framing) supersedes older
// data. Refusals are excluded from denominators (including pre-refusal-
// schema records, detected via their report text).

import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { evalDir } from "./conditions.mjs"
import { PRICES } from "./costs.mjs"

const CONDITIONS = ["vint-guided", "vint-bare", "react", "solid", "vanjs"]
const MODELS = ["claude-opus-5", "claude-sonnet-5", "gpt-5.6-terra", "gpt-5.6-luna"]
const WAVE_SMALL = ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10"]

// latest record per (model, condition, task, sample)
const latest = new Map()
const files = readdirSync(join(evalDir, "results"))
  .filter((f) => f.endsWith(".json"))
  .sort() // timestamped names: ascending = chronological
for (const file of files) {
  const data = JSON.parse(readFileSync(join(evalDir, "results", file), "utf8"))
  for (const r of data.results ?? []) {
    if (r.skipped || r.harnessError) continue
    latest.set(`${data.model}|${r.condition}|${r.task}|${r.sample}`, { ...r, model: data.model })
  }
}

const records = [...latest.values()].map((r) => ({
  ...r,
  refused: r.refused || /stop_reason: refusal/.test(r.report1 ?? ""),
}))

function cellFor(model, condition, taskFilter) {
  const cells = records.filter(
    (r) => r.model === model && r.condition === condition && taskFilter(r.task.slice(0, 2)),
  )
  const scored = cells.filter((r) => !r.refused)
  if (!scored.length) return cells.length ? "all refused" : "—"
  const p1 = scored.filter((r) => r.pass1).length
  const p2 = scored.filter((r) => r.pass2).length
  const refusedNote = cells.length - scored.length ? ` (${cells.length - scored.length}R)` : ""
  return `${p1}/${scored.length} → ${p2}/${scored.length}${refusedNote}`
}

for (const [title, filter] of [
  ["Tasks 01–10 (small & trap tasks), pass@1 → pass@2", (t) => WAVE_SMALL.includes(t)],
  ["Task 20 (large app), pass@1 → pass@2", (t) => t === "20"],
]) {
  console.log(`\n### ${title}\n`)
  const rows = CONDITIONS.map((condition) => {
    const row = { condition }
    for (const model of MODELS) row[model] = cellFor(model, condition, filter)
    return row
  })
  console.table(rows)
}

// per-model spend across every scored record (framework conditions only)
console.log("\n### Spend (these conditions, latest records only)\n")
console.table(
  MODELS.map((model) => {
    const cells = records.filter((r) => r.model === model && CONDITIONS.includes(r.condition))
    const price = PRICES[model]
    const exact = cells.every((r) => r.tokensIn != null || !r.tokens)
    const cost = exact
      ? `$${(cells.reduce((a, r) => a + (r.tokensIn ?? 0) * price.in + (r.tokensOut ?? 0) * price.out, 0) / 1e6).toFixed(2)}`
      : `$${((cells.reduce((a, r) => a + (r.tokens ?? 0), 0) * price.in) / 1e6).toFixed(2)}–$${((cells.reduce((a, r) => a + (r.tokens ?? 0), 0) * price.out) / 1e6).toFixed(2)}`
    return { model, cells: cells.length, tokens: cells.reduce((a, r) => a + (r.tokens ?? 0), 0), cost }
  }),
)

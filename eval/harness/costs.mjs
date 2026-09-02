// Aggregate token spend across results/*.json and price it per model.
//
//   node harness/costs.mjs
//
// Older result files recorded only a combined `tokens` per cell; for those,
// cost is reported as a [floor, ceiling] range (all-input vs all-output).
// Newer files carry tokensIn/tokensOut and price exactly.

import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { evalDir } from "./conditions.mjs"

// $ per 1M tokens (standard tier, short context), verified 2026-09-02:
// Anthropic: platform pricing table. OpenAI: developers.openai.com/api/docs/pricing.
const PRICES = {
  "claude-opus-5": { in: 5.0, out: 25.0 },
  "claude-sonnet-5": { in: 2.0, out: 10.0 },
  "claude-haiku-4-5": { in: 1.0, out: 5.0 },
  "gpt-5.6-terra": { in: 2.0, out: 12.0 },
  "gpt-5.6-sol": { in: 4.0, out: 20.0 },
  "gpt-5.6-luna": { in: 0.2, out: 1.2 },
}

const byModel = new Map()
for (const file of readdirSync(join(evalDir, "results")).filter((f) => f.endsWith(".json"))) {
  const data = JSON.parse(readFileSync(join(evalDir, "results", file), "utf8"))
  const model = data.model ?? "unknown"
  const agg = byModel.get(model) ?? { cells: 0, tokens: 0, tokensIn: 0, tokensOut: 0, split: true }
  for (const r of data.results ?? []) {
    if (r.skipped || r.harnessError) continue
    agg.cells++
    agg.tokens += r.tokens ?? 0
    if (r.tokensIn != null) {
      agg.tokensIn += r.tokensIn
      agg.tokensOut += r.tokensOut ?? 0
    } else if (r.tokens) {
      agg.split = false
    }
  }
  byModel.set(model, agg)
}

const money = (n) => `$${n.toFixed(2)}`
const rows = []
for (const [model, agg] of byModel) {
  const price = PRICES[model]
  let cost
  if (!price) cost = "unknown model — add to PRICES"
  else if (agg.split && agg.tokens > 0) {
    cost = money((agg.tokensIn * price.in + agg.tokensOut * price.out) / 1e6)
  } else {
    // combined-only records: bound it
    const floor = (agg.tokens * price.in) / 1e6
    const ceil = (agg.tokens * price.out) / 1e6
    cost = `${money(floor)}–${money(ceil)}`
  }
  rows.push({ model, cells: agg.cells, tokens: agg.tokens, cost })
}
console.table(rows.sort((a, b) => b.tokens - a.tokens))

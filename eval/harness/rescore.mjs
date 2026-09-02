// Re-score existing solution bundles offline — no API calls. Use after
// fixing an acceptance test or helper: walks out/, re-runs acceptance on
// every saved try1/try2 bundle, prints the corrected table.
//
//   node harness/rescore.mjs [--root out]

import { execFile } from "node:child_process"
import { existsSync, readdirSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { promisify } from "node:util"

import { evalDir } from "./conditions.mjs"

const execFileAsync = promisify(execFile)
const here = dirname(fileURLToPath(import.meta.url))
const rootArg = process.argv.includes("--root")
  ? process.argv[process.argv.indexOf("--root") + 1]
  : "out"
const outRoot = join(evalDir, rootArg)

async function runAcceptance(bundlePath, taskNum) {
  try {
    await execFileAsync(process.execPath, [join(here, "accept.mjs"), bundlePath, taskNum], {
      timeout: 20_000,
      cwd: evalDir,
    })
    return true
  } catch {
    return false
  }
}

const records = []
for (const condition of readdirSync(outRoot)) {
  for (const task of readdirSync(join(outRoot, condition))) {
    const taskNum = task.slice(0, 2)
    for (const sample of readdirSync(join(outRoot, condition, task))) {
      const cellDir = join(outRoot, condition, task, sample)
      if (!readdirSync(cellDir).some((f) => f.startsWith("try1."))) continue // skipped cell (no reference solution)
      const b1 = join(cellDir, "try1.bundle.js")
      const b2 = join(cellDir, "try2.bundle.js")
      // no bundle = the build failed; that stays a failure
      const pass1 = existsSync(b1) ? await runAcceptance(b1, taskNum) : false
      const pass2 = pass1 || (existsSync(b2) ? await runAcceptance(b2, taskNum) : false)
      records.push({ condition, task, sample, pass1, pass2 })
      console.log(`  ${condition} / ${task} / ${sample}: ${pass1 ? "pass@1" : pass2 ? "pass@2" : "FAIL"}`)
    }
  }
}

const rows = []
for (const condition of [...new Set(records.map((r) => r.condition))]) {
  for (const task of [...new Set(records.filter((r) => r.condition === condition).map((r) => r.task))].sort()) {
    const cell = records.filter((r) => r.condition === condition && r.task === task)
    rows.push({
      condition,
      task,
      "pass@1": `${cell.filter((r) => r.pass1).length}/${cell.length}`,
      "pass@2": `${cell.filter((r) => r.pass2).length}/${cell.length}`,
    })
  }
  const all = records.filter((r) => r.condition === condition)
  rows.push({
    condition: `${condition} TOTAL`,
    task: "",
    "pass@1": `${all.filter((r) => r.pass1).length}/${all.length}`,
    "pass@2": `${all.filter((r) => r.pass2).length}/${all.length}`,
  })
}
console.log()
console.table(rows)

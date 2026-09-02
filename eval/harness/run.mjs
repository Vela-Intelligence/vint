// Pilot eval orchestrator.
//
//   node harness/run.mjs --conditions vint-guided,vint-bare,react \
//       --tasks all --samples 5 --model claude-opus-5 --concurrency 3
//
// Per (condition × task × sample): generate a solution (try 1) → build →
// run acceptance in a sandboxed child process. On failure, feed the full
// failure report back for ONE fix attempt (try 2) — that second number is
// the errors-are-prompts measurement. Reference conditions skip generation
// and try 2; they exist to prove the pipeline and acceptance tests correct.
//
// Results: results/run-<timestamp>.json + a summary table on stdout.

import { execFile } from "node:child_process"
import { mkdirSync, readdirSync, readFileSync, writeFileSync, copyFileSync, existsSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { promisify } from "node:util"

import { buildSolution } from "./build.mjs"
import { conditions, evalDir } from "./conditions.mjs"
import { generate, tokensOf } from "./generate.mjs"

const execFileAsync = promisify(execFile)
const here = dirname(fileURLToPath(import.meta.url))

// --- args -------------------------------------------------------------------

const args = Object.fromEntries(
  process.argv.slice(2).map((a, i, all) => (a.startsWith("--") ? [a.slice(2), all[i + 1]] : [])).filter((p) => p.length),
)
const model = args.model ?? "claude-opus-5"
const samples = Number(args.samples ?? 2)
const concurrency = Number(args.concurrency ?? 3)
const conditionNames = (args.conditions ?? "vint-guided,vint-bare,react").split(",")
const allTasks = readdirSync(join(evalDir, "tasks"))
  .filter((f) => f.endsWith(".md"))
  .sort()
const taskNames = !args.tasks || args.tasks === "all" ? allTasks : args.tasks.split(",").map((t) => (t.endsWith(".md") ? t : `${t}.md`))

for (const name of conditionNames) {
  if (!conditions[name]) {
    console.error(`unknown condition "${name}" — known: ${Object.keys(conditions).join(", ")}`)
    process.exit(1)
  }
}

// --- one cell ---------------------------------------------------------------

async function runAcceptance(bundlePath, taskNum) {
  try {
    const { stdout } = await execFileAsync(
      process.execPath,
      [join(here, "accept.mjs"), bundlePath, taskNum],
      { timeout: 20_000, cwd: evalDir },
    )
    return { pass: stdout.includes("ACCEPT_PASS"), report: null }
  } catch (err) {
    const out = String(err.stdout ?? "")
    const marker = out.indexOf("ACCEPT_FAIL")
    let report
    if (marker >= 0) {
      try {
        const parsed = JSON.parse(out.slice(marker + "ACCEPT_FAIL ".length))
        report = `${parsed.phase.toUpperCase()} FAILURE: ${parsed.error}${
          parsed.consoleOutput?.length ? `\n\nConsole output during the run:\n${parsed.consoleOutput.join("\n")}` : ""
        }`
      } catch {
        report = out.slice(marker, marker + 2000)
      }
    } else if (err.killed) {
      report = "TIMEOUT: the app did not settle within 20s (infinite loop or unresolved await?)"
    } else {
      report = `RUNNER ERROR: ${String(err.stderr ?? err.message).slice(0, 2000)}`
    }
    return { pass: false, report }
  }
}

async function attempt({ code, cellDir, tryNum, condition, taskNum }) {
  const srcPath = join(cellDir, `try${tryNum}.${condition.ext}`)
  const bundlePath = join(cellDir, `try${tryNum}.bundle.js`)
  writeFileSync(srcPath, code)
  const built = await buildSolution({ srcPath, outPath: bundlePath, esbuildOptions: condition.esbuild })
  if (!built.ok) return { pass: false, report: built.report }
  return runAcceptance(bundlePath, taskNum)
}

async function runCell({ conditionName, taskFile, sample }) {
  const condition = conditions[conditionName]
  const taskNum = taskFile.slice(0, 2)
  const spec = readFileSync(join(evalDir, "tasks", taskFile), "utf8")
  const cellDir = join(evalDir, "out", model, conditionName, taskFile.replace(".md", ""), `s${sample}`)
  mkdirSync(cellDir, { recursive: true })

  const record = { condition: conditionName, task: taskFile.replace(".md", ""), sample, tokens: 0 }

  if (condition.kind === "reference") {
    const ref = join(condition.referenceDir, `t${taskNum}.${condition.ext}`)
    if (!existsSync(ref)) return { ...record, skipped: true }
    copyFileSync(ref, join(cellDir, `try1.${condition.ext}`))
    const result = await attempt({ code: readFileSync(ref, "utf8"), cellDir, tryNum: 1, condition, taskNum })
    return { ...record, pass1: result.pass, pass2: result.pass, report1: result.report }
  }

  const system = condition.system()
  const messages = [{ role: "user", content: spec }]

  const gen1 = await generate({ model, system, messages })
  record.tokens += tokensOf(gen1.usage)
  if (gen1.stopReason === "refusal" || !gen1.code) {
    return { ...record, pass1: false, pass2: false, report1: `no code block in response (stop_reason: ${gen1.stopReason})` }
  }
  const try1 = await attempt({ code: gen1.code, cellDir, tryNum: 1, condition, taskNum })
  record.pass1 = try1.pass
  record.report1 = try1.report
  if (try1.pass) return { ...record, pass2: true }

  // try 2: the diagnosis measurement — full failure report, one fix attempt
  const feedback = `Your solution failed.\n\n${try1.report}\n\nFix the module. Output the complete corrected module as one fenced code block.`
  writeFileSync(join(cellDir, "feedback.txt"), feedback)
  const gen2 = await generate({
    model,
    system,
    messages: [...messages, { role: "assistant", content: gen1.text }, { role: "user", content: feedback }],
  })
  record.tokens += tokensOf(gen2.usage)
  if (gen2.stopReason === "refusal" || !gen2.code) {
    return { ...record, pass2: false, report2: `no code block in try-2 response (stop_reason: ${gen2.stopReason})` }
  }
  const try2 = await attempt({ code: gen2.code, cellDir, tryNum: 2, condition, taskNum })
  record.pass2 = try2.pass
  record.report2 = try2.report
  return record
}

// --- pool + summary ---------------------------------------------------------

const cells = []
for (const conditionName of conditionNames)
  for (const taskFile of taskNames)
    for (let sample = 1; sample <= (conditions[conditionName].kind === "reference" ? 1 : samples); sample++)
      cells.push({ conditionName, taskFile, sample })

console.log(`running ${cells.length} cells (model ${model}, ${concurrency} concurrent)\n`)

const results = []
let cursor = 0
async function worker() {
  while (cursor < cells.length) {
    const cell = cells[cursor++]
    try {
      const r = await runCell(cell)
      results.push(r)
      const status = r.skipped ? "skip" : r.pass1 ? "pass@1" : r.pass2 ? "pass@2" : "FAIL"
      console.log(`  ${r.condition} / ${r.task} / s${cell.sample}: ${status}`)
    } catch (err) {
      results.push({ condition: cell.conditionName, task: cell.taskFile, sample: cell.sample, harnessError: String(err.message ?? err) })
      console.log(`  ${cell.conditionName} / ${cell.taskFile} / s${cell.sample}: HARNESS ERROR — ${err.message}`)
    }
  }
}
await Promise.all(Array.from({ length: concurrency }, worker))

// summary
const rows = []
for (const conditionName of conditionNames) {
  for (const taskFile of taskNames) {
    const task = taskFile.replace(".md", "")
    const cellResults = results.filter((r) => r.condition === conditionName && r.task === task && !r.skipped && !r.harnessError)
    if (!cellResults.length) continue
    rows.push({
      condition: conditionName,
      task,
      "pass@1": `${cellResults.filter((r) => r.pass1).length}/${cellResults.length}`,
      "pass@2": `${cellResults.filter((r) => r.pass2).length}/${cellResults.length}`,
      tokens: cellResults.reduce((a, r) => a + (r.tokens ?? 0), 0),
    })
  }
  const conditionResults = results.filter((r) => r.condition === conditionName && !r.skipped && !r.harnessError)
  if (conditionResults.length)
    rows.push({
      condition: `${conditionName} TOTAL`,
      task: "",
      "pass@1": `${conditionResults.filter((r) => r.pass1).length}/${conditionResults.length}`,
      "pass@2": `${conditionResults.filter((r) => r.pass2).length}/${conditionResults.length}`,
      tokens: conditionResults.reduce((a, r) => a + (r.tokens ?? 0), 0),
    })
}
console.log()
console.table(rows)

mkdirSync(join(evalDir, "results"), { recursive: true })
const outPath = join(evalDir, "results", `run-${new Date().toISOString().replace(/[:.]/g, "-")}.json`)
writeFileSync(outPath, JSON.stringify({ model, samples, conditions: conditionNames, tasks: taskNames, results }, null, 2))
console.log(`\nresults written to ${outPath}`)

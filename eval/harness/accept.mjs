// Child-process acceptance runner: registers a happy-dom global environment,
// imports the built solution bundle, runs the task's acceptance function.
// Exit 0 = pass. Exit 1 = fail, with a JSON failure report on stdout
// (assertion/runtime error + everything the app wrote to console — vint's
// prescriptive warnings included, since try-2 diagnosis is what's measured).
//
// Usage: node accept.mjs <bundlePath> <taskNum>

import { dirname, join } from "node:path"
import { pathToFileURL, fileURLToPath } from "node:url"
import { GlobalRegistrator } from "@happy-dom/global-registrator"

const [bundlePath, taskNum] = process.argv.slice(2)
const here = dirname(fileURLToPath(import.meta.url))

GlobalRegistrator.register()

const consoleOutput = []
for (const level of ["warn", "error", "log"]) {
  const original = console[level].bind(console)
  console[level] = (...args) => {
    consoleOutput.push(`console.${level}: ${args.map(String).join(" ")}`)
    if (process.env.EVAL_VERBOSE) original(...args)
  }
}

const fail = (phase, err) => {
  const report = {
    phase,
    error: String(err?.stack ? `${err.message}` : (err ?? "unknown")),
    consoleOutput: consoleOutput.slice(0, 25),
  }
  process.stdout.write(`ACCEPT_FAIL ${JSON.stringify(report)}`)
  process.exit(1)
}

try {
  const helpers = await import(pathToFileURL(join(here, "dom-helpers.mjs")).href)
  const { accept } = await import(pathToFileURL(join(here, "acceptance", `t${taskNum}.mjs`)).href)

  let module
  try {
    module = await import(pathToFileURL(bundlePath).href)
  } catch (err) {
    fail("import", err)
  }
  if (typeof module.mountApp !== "function") {
    fail("contract", new Error("module does not export a mountApp function"))
  }

  const container = document.createElement("div")
  document.body.appendChild(container)
  try {
    await accept({ module, container, helpers })
  } catch (err) {
    fail("acceptance", err)
  }
  process.stdout.write("ACCEPT_PASS")
  process.exit(0)
} catch (err) {
  fail("harness", err)
}

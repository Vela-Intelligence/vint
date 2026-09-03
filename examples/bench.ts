// For-reconciliation benchmark. Runs in a real browser on purpose: happy-dom's
// nextSibling is a linear indexOf over the parent's child array, which makes
// any range-walking reconciler look quadratic there. Numbers taken under
// vitest measure happy-dom, not vint — see docs/review-2026-09.md (F3).
//
//   npm run bench   → http://localhost:8001/bench.html
//
// READ THE INSERT COUNTS, NOT THE MILLISECONDS. `inserts` is deterministic
// and reproducible. The timings still carry 30-40% run-to-run variance even
// as a median, and cases later in the run benefit from a warmed JIT, so a
// small ms difference between two rows here means nothing. Fixing that needs
// per-case isolation and warm-up, which this page does not do yet.
import { createSignal, For, mount, tags } from "../src/index"

const { div, ul, li, table, thead, tbody, tr, th, td, button, h1, p, code } = tags

type Row = { id: number; label: string }
const makeRows = (n: number, offset = 0): Row[] =>
  Array.from({ length: n }, (_, i) => ({ id: offset + i, label: `row ${offset + i}` }))

interface Case {
  name: string
  transform: (rows: Row[]) => Row[]
}

const CASES: Case[] = [
  { name: "append one", transform: (r) => [...r, { id: 1e6 + r.length, label: "new" }] },
  { name: "update one field", transform: (r) => r.map((x, i) => (i === 0 ? { ...x, label: "z" } : x)) },
  { name: "move first to last", transform: (r) => [...r.slice(1), r[0] as Row] },
  { name: "move last to first", transform: (r) => [r[r.length - 1] as Row, ...r.slice(0, -1)] },
  { name: "swap adjacent", transform: (r) => [r[1] as Row, r[0] as Row, ...r.slice(2)] },
  { name: "reverse", transform: (r) => [...r].reverse() },
]

const SIZES = [200, 1000, 3000]
const REPS = 20
const BATCHES = 5 // median of these; single batches are too noisy to read

interface Result {
  size: number
  name: string
  msPerOp: number
  inserts: number
}

/** One case at one size: mount a fresh list, then time REPS transforms.
 *  insertBefore is counted on the first transform only — it is a per-op
 *  count, not a total. */
function measure(size: number, c: Case): Result {
  const host = document.createElement("div")
  document.body.appendChild(host)
  const [items, setItems] = createSignal(makeRows(size))
  const dispose = mount(host, () =>
    ul(For({ each: items, key: (t) => t.id, children: (item) => li(() => item().label) })),
  )
  const parent = host.querySelector("ul") as HTMLUListElement

  // count the DOM moves of a single representative op
  const real = parent.insertBefore.bind(parent)
  let inserts = 0
  ;(parent as unknown as { insertBefore: unknown }).insertBefore = (a: Node, b: Node | null) => {
    inserts++
    return real(a, b)
  }
  setItems((prev) => c.transform([...prev]))
  ;(parent as unknown as { insertBefore: unknown }).insertBefore = real

  // then time the steady state. Wall clock on this workload varies 30-40%
  // run to run, so take a median of batches — a single batch is not a number
  // anyone should act on. The `inserts` count above is deterministic and is
  // the primary evidence.
  const batches: number[] = []
  for (let b = 0; b < BATCHES; b++) {
    const t0 = performance.now()
    for (let k = 0; k < REPS; k++) setItems((prev) => c.transform([...prev]))
    batches.push((performance.now() - t0) / REPS)
  }
  batches.sort((a, b) => a - b)

  dispose()
  host.remove()
  return { size, name: c.name, msPerOp: batches[BATCHES >> 1] as number, inserts }
}

function runAll(): Result[] {
  const out: Result[] = []
  for (const size of SIZES) for (const c of CASES) out.push(measure(size, c))
  return out
}

function App() {
  const [results, setResults] = createSignal<Result[]>([])
  const [running, setRunning] = createSignal(false)

  const start = () => {
    setRunning(true)
    // let the button repaint before the synchronous benchmark blocks the thread
    setTimeout(() => {
      const out = runAll()
      setResults(out)
      setRunning(false)
      // machine-readable, for reading back out of the console
      console.log(`BENCH_JSON ${JSON.stringify(out)}`)
    }, 0)
  }

  return div(
    { style: "font: 14px/1.5 ui-monospace, monospace; padding: 24px; max-width: 760px" },
    h1("vint For benchmark"),
    p(
      "Reconciler cost per operation, ",
      code(`median of ${BATCHES}\u00d7${REPS}`),
      ". ",
      code("inserts"),
      " is insertBefore calls for one operation.",
    ),
    button({ onclick: start, disabled: running, style: "padding: 8px 16px; font: inherit" }, () =>
      running() ? "running…" : "Run benchmark",
    ),
    table(
      { style: "border-collapse: collapse; margin-top: 20px; width: 100%" },
      thead(
        tr(
          ...["N", "operation", "ms/op", "inserts"].map((h) =>
            th({ style: "text-align: left; border-bottom: 1px solid #999; padding: 4px 10px" }, h),
          ),
        ),
      ),
      tbody(
        For({
          each: results,
          key: (r) => `${r.size}:${r.name}`,
          fallback: () =>
            tr(td({ colspan: "4", style: "padding: 10px; color: #777" }, "no results yet")),
          children: (r) =>
            tr(
              td({ style: "padding: 4px 10px" }, () => String(r().size)),
              td({ style: "padding: 4px 10px" }, () => r().name),
              td({ style: "padding: 4px 10px" }, () => r().msPerOp.toFixed(3)),
              td({ style: "padding: 4px 10px" }, () => String(r().inserts)),
            ),
        }),
      ),
    ),
  )
}

mount(document.body, App)

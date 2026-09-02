# vint pilot eval

Measures the project's stated metric directly: *the probability that a model
writes a correct app on the first try, and can diagnose a failure on the
second.*

## Design

- **Tasks** (`tasks/*.md`): five app specs of increasing difficulty, written
  framework-neutrally. Every solution must export
  `mountApp(container, deps?)`.
- **Conditions** (`harness/conditions.mjs`):
  - `vint-guided` — vint with `docs/llms.txt` in context (the product as
    intended)
  - `vint-bare` — vint with only `dist/vint.d.ts` (ablation: how much does
    the guide carry?)
  - `react` — React 18 (the prior baseline: the framework models know best)
  - `reference-vint` / `reference-react` — hand-written solutions run through
    the identical pipeline, no API calls; they prove the harness and
    acceptance tests are passable
- **Pipeline** per (condition × task × sample): generate → esbuild bundle →
  acceptance test in a sandboxed child process (happy-dom, 20 s timeout).
  On failure, the model gets ONE fix attempt with the full failure report —
  build errors, assertion message, and everything the app wrote to the
  console (vint's prescriptive warnings included). **pass@1** is first-try
  correctness; **pass@2** is second-try diagnosis, the errors-are-prompts
  measurement.
- Acceptance tests assert observable DOM behavior only (texts, values,
  element identity across reorders, race outcomes with controlled promises)
  and are deliberately fair to React: interactions use native value setters
  and bubbling events, and every step settles across two macrotasks.

## Running

```bash
cd eval
npm install
npm run build --prefix ..   # vint-bare needs dist/vint.d.ts

npm run calibrate           # no API calls; must be all pass@1
npm run pilot               # 5 tasks × 3 conditions × 5 samples
```

Generation needs Anthropic credentials: `ANTHROPIC_API_KEY`, or a profile
from `ant auth login`. Options:

```bash
node harness/run.mjs --conditions vint-guided,react --tasks 01-counter,04-fetch \
    --samples 3 --model claude-opus-5 --concurrency 3
```

The full pilot is 75 generation cells (plus one fix attempt per failure) —
budget roughly 1–3M tokens depending on failure rate. Model choice matters:
a frontier model may ceiling every condition; also run a mid-tier model
(e.g. `claude-haiku-4-5`) to see differentiation.

Results land in `results/run-<timestamp>.json` (per-cell records including
failure reports) with a summary table on stdout. Generated solutions and
failure feedback are kept under `out/<condition>/<task>/s<n>/` for reading
afterwards — the failure reports are often more informative than the pass
rates.

## Reading the numbers

- `vint-guided pass@1` vs `react pass@1` — the headline: does vint + guide
  beat the model's strongest prior?
- `vint-guided` vs `vint-bare` — the value of llms.txt itself.
- `pass@2 − pass@1` per condition — how well each framework's failures
  explain themselves. This is where errors-as-prompts should show up.
- Per-task splits: task 05 (keyed reorder, element identity) and task 04
  (race discard) are where framework guarantees differ most.

## Lessons from the pilot (2026-09-02)

- Ceilings: Opus 5, Sonnet 5, and gpt-5.6-luna all reach ~25/25 in every
  condition on these five tasks — vint is first-try learnable from its
  `.d.ts` alone at strong-model tiers, and llms.txt carries a non-Claude
  model to React-prior parity. Differentiation needs harder tasks.
- App-shaped guide snippets can shadow task requirements (models copied the
  canonical add-handler and skipped a spec line). Fixed in llms.txt with the
  "examples are semantics, the spec wins" preamble.
- Context framing matters as much as guide content: the guided condition
  originally said "Follow it exactly" about the guide, and instruction-literal
  models elevated the guide over the task spec (Opus: 3/5 on todos; 5/5 after
  the framing was neutralized). Never tell a model to follow a reference
  "exactly" when a task spec must take precedence.
- A `stop_reason: refusal` can appear on innocuous UI tasks; the harness
  records it as a failed cell — treat those as anomalies when reading tables.

## Extending

- Add a condition: one entry in `harness/conditions.mjs` (system prompt,
  file extension, esbuild options). Solid and VanJS are the natural next
  two; add their deps to `eval/package.json`.
- Add a task: a spec in `tasks/NN-name.md` + an acceptance module
  `harness/acceptance/tNN.mjs` + a vint reference solution
  `reference/vint/tNN.ts` (calibration must pass before trusting results).
- The design-debate variant: to test whether `For`'s item-accessor
  divergence costs first-try correctness, add a condition pointing at a
  branch where `For` passes plain values, and compare.

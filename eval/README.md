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
- A `stop_reason: refusal` can appear on innocuous UI tasks — and can be
  deterministic AND condition-biased. Diagnosed via `stop_details`: Opus 5
  refused react/07 5/5 with category "cyber", triggered by the word
  "monitor" in the spec ("live channel monitor" + subscriptions/callbacks
  reads as surveillance tooling). The long llms.txt context *shielded* the
  vint conditions from the same classifier — a validity hazard, since one
  condition eats refusals the others don't. Fixes: spec prose avoids
  security-adjacent vocabulary ("live-updates widget"), and the harness
  records refusals separately, excluded from pass rates. Lesson for task
  authors: probe refusals with a tiny max_tokens replay and read
  stop_details.category before blaming the model or the condition.
- Wave 2 (06–10: trap-code and lifecycle tasks) is ALSO ceilinged by Opus 5,
  Sonnet 5, and gpt-5.6-luna in every condition: exactly one genuine coding
  failure in 225 non-refused cells (luna stacking a second subscription on a
  channel switch in 07 — the intended O2 trap, fixed on try 2 from the
  report). The trap error codes never fired because strong models don't
  walk into the traps. Differentiating further needs weaker engines, much
  larger apps, or adversarial specs — not more tasks of this size.
- Acceptance tests must scope their DOM parsing to spec'd structure: guided
  models add unrequested polish (an empty-state li) that a naive parser
  counts as state. Assert only what the spec names; ignore extras.
- Cost: `node harness/costs.mjs` prices every run (newer results record the
  input/output split; older ones get a floor–ceiling range). The standout is
  gpt-5.6-luna — OpenAI's smallest current-gen model at $0.20/$1.20 per M
  tokens (vs sol $4/$20, terra $2/$12; developers.openai.com/api/docs/pricing,
  2026-09) — whose ENTIRE two-wave, three-condition eval (151 cells) cost
  $0.09–$0.53, roughly ~$0.20 realistically, while matching its own React
  prior on vint. React-parity on an unseen framework is purchasable for
  about a fifth of a cent per generated app.

## The large-app cell (20-tracker, 2026-09-02)

The context-pressure test finally differentiates. Truncation-corrected
(vint conditions on Anthropic models need `--max-tokens 32000`; at 16k you
measure output caps, not skill — the harness streams, so any size works):

| pass@1 → pass@2  | Opus 5 | Sonnet 5 | gpt-5.6-terra | gpt-5.6-luna |
|---|---|---|---|---|
| react            | 5/5    | 5/5      | 3/5 → 5/5     | 4/5 → 4/5    |
| vint-guided      | 5/5    | 5/5      | 3/5 → 5/5     | **5/5**      |
| vint-bare        | 5/5    | 3/5 → 5/5| 3/5 → 3/5     | 3/5 → 4/5    |

- **The guide's value scales with app size.** On every engine below Opus,
  guided ≥ react and guided > bare. Luna's vint-guided (5/5) beat its own
  React prior (4/5, one unrecovered crash) — a framework the model has
  never seen, outperforming the one it knows best, via 2k tokens of guide.
- **Bare failures at scale are rule-1 failures**: `h1` stuck on
  "undefined" from one-shot untracked reads of async state — exactly the
  footgun class llms.txt's first rule targets; with the guide in context
  the class vanished entirely.
- Opus 5 still ceilings everything given output budget. Terra sits
  mid-pack; its models self-repair well (three conditions → 5/5 at try 2).
- Ops lessons: raise max_tokens for large tasks or you measure truncation;
  don't run many concurrent 32k streams (they die with "terminated" —
  rerun at low concurrency).

## The For item-accessor A/B (2026-09-02)

Does vint's loudest Solid divergence — `children(item)` receiving an
ACCESSOR — cost first-try correctness? Two measurements say no:

- Mining every prior run: 0 of 79 failure reports contained
  E-FOR-ITEM-ACCESS, across ~172 try-1 solutions using `For`.
- Controlled A/B (`vint-bare` vs `vint-bare-valuefor`, a Solid-style
  value-passing variant with matching type declarations; tasks 02/05/10,
  10 samples, two engines): accessor 59/60 vs value 59/60 — dead even,
  and neither arm's single miss was accessor-related (one was a model
  reaching for a `ref` prop: vint's E-NO-REF fired and the model fixed it
  from the message — the first observed in-the-wild errors-as-prompts
  recovery via a real vint error code).

The divergence stands, with data: models read the signature from types or
guide and just use it. Total A/B cost: ~$0.56 across both engines.

## The five-framework table (2026-09-03)

`node harness/summary.mjs` regenerates this from all results (latest record
per engine/condition/task wins; refusals excluded). pass@1 → pass@2:

Tasks 01–10:

| condition | Opus 5 | Sonnet 5 | Terra | Luna |
|---|---|---|---|---|
| vint-guided | 49/50 → 50/50 | 48/50 → 50/50 | 48/50 → 50/50 | 49/50 → 50/50 |
| vint-bare | 50/50 → 50/50 | 50/50 → 50/50 | 64/65 → 65/65 | 64/65 → 65/65 |
| react | 49/49 → 49/49 (1R) | 50/50 → 50/50 | 50/50 → 50/50 | 50/50 → 50/50 |
| solid | 49/50 → 50/50 | 48/50 → 49/50 | 49/50 → 49/50 | 50/50 → 50/50 |
| vanjs | 38/50 → 50/50 | 35/50 → 43/50 | 28/50 → 45/50 | 22/50 → 36/50 |

Task 20 (large app):

| condition | Opus 5 | Sonnet 5 | Terra | Luna |
|---|---|---|---|---|
| vint-guided | 5/5 | 5/5 | 3/5 → 5/5 | 5/5 |
| vint-bare | 5/5 | 3/5 → 5/5 | 3/5 → 3/5 | 3/5 → 4/5 |
| react | 5/5 | 5/5 | 3/5 → 5/5 | 4/5 → 4/5 |
| solid | 5/5 | 5/5 | 4/5 → 4/5 | 4/5 → 5/5 |
| vanjs | 4/5 → 5/5 | 4/5 → 4/5 | 5/5 | 3/5 → 3/5 |

Readings:

- **vint scores at React/Solid level on every engine** — a framework with
  zero training presence matching the two deepest priors, via types alone
  on small tasks and via llms.txt at scale (on the large app, vint-guided
  is the only condition that reaches 5/5-or-recovers-to-5/5 on all four
  engines).
- **VanJS is the outlier, and in the direction vint's design predicted**:
  22–38/50 pass@1 depending on engine, with the weakest pass@2 recovery
  (silent staleness — the app renders subtly wrong and the failure report
  can't explain why). vint kept VanJS's authoring shape and discarded
  exactly the semantics that are failing here.
- Spend for the whole program: Opus ≈$6–29, Sonnet ≈$3–13, Terra $5.20,
  Luna ≈$0.20–1.

## Method notes (September 2026, after the rebuild)

- **The task list is fixed before results.** Tasks 01–10, 20 and 21 are the
  whole set; a task is added only with a reference solution and an
  acceptance test that calibrate green *before* any generation is scored
  against it, and none is removed after scoring. Task 21 (kanban) was
  written by a second author, not the framework's, and its spec had a
  defect calibration caught (identity across column moves) before any
  model saw it.
- **Baselines a buyer would weigh.** `preact-htm` (React's authoring model
  with no JSX and no build) and `vue` (Vue 3's runtime+compiler build, as
  a CDN script ships it) join `react`, `solid` (pinned to 1.9.15) and
  `vanjs`. Their calibration arms cover task 01.
- **Denominators are equal** (55 per condition per engine: eleven tasks,
  five samples; twelve with task 21) and `summary.mjs` prints Wilson 95%
  intervals for pass@1 next to the counts: a 3/5 cell is 19–88%.
- **Task 21 at n=20 on the cheapest engine.** Luna's kanban cells were
  re-run with twenty samples per condition (about $1 for all seven), which
  narrows the intervals from ±40 points to about ±17. The replication also
  found a defect in the acceptance test, not in any framework: it dispatched
  the Enter keystroke in the same tick as the edit input's value change, and
  every renderer that commits asynchronously (Preact, Vue) then read the
  stale draft from its last render. Preact scored 0/20 on the first try
  for that reason alone; with one `settle()` between the value change and
  the keystroke, the same bundles re-score 18/20, and the arm was re-run
  under the fixed test on every engine. Solid's and Vue's kanban failures
  are unchanged by the fix and are real framework seams: Solid apps call
  `.focus()` in a `ref` before the element is in the document; Vue apps
  read a template ref inside `v-for` as an element when it is an array.
- **Subscription sessions as a second method.** An interactive Claude Code
  session with only the shipped files (`dist/`, `bin/verify.mjs`,
  `docs/llms.txt`, the task spec) is closer to how vint is used than one
  API call with one fix attempt, and costs nothing on a subscription; the
  measures are verify runs, turns and output tokens from the session
  transcript. On Opus 5 both vint (8/8 in 4 verify runs, 42 turns, ~85k
  output tokens) and React 18 without JSX (8/8 in 3 runs, 29 turns, ~47k)
  finished green; on Sonnet 5, vint with the guide went green on the first
  verify run (9/9, 43 turns, ~80k output tokens, no warning, one gap
  logged: whether an omitted style key is cleared, now a guide sentence).
  React's implementer on Opus spent most of its effort on the test
  seam — a native value setter so `onChange` fires, capturing the badge
  timer, unmounting to stop a leaked timer firing outside `act` — which
  `vint/testing` ships, and its one framework warning pointed away from the
  cause. vint's run fired no warning; its extra tokens went mostly into the
  gap log the prompt demanded.

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

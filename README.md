# vint

**Vanilla In TypeScript** — a UI framework whose primary user is an AI.

Real DOM, no virtual DOM, no JSX, no build step. VanJS-shaped tag functions
over a Solid-faithful reactive core, shipped with a numbered behavioral
contract, an agent-sized guide, and error messages written as prompts. Zero
runtime dependencies, one ~46 kB ESM file (~12 kB gzipped) with every
assertion on, or ~19 kB (~7 kB gzipped) with them compiled out.

```ts
import { createSignal, createMemo, For, mount, tags } from "vint"

const { div, button, input, ul, li, span } = tags

function TodoApp() {
  const [todos, setTodos] = createSignal<{ id: number; title: string; done: boolean }[]>([])
  const [title, setTitle] = createSignal("")
  const left = createMemo(() => todos().filter((t) => !t.done).length)
  let nextId = 1

  return div(
    input({ value: title, oninput: (e: Event) => setTitle((e.target as HTMLInputElement).value) }),
    button(
      {
        onclick: () => {
          if (!title().trim()) return
          setTodos((prev) => [...prev, { id: nextId++, title: title(), done: false }])
          setTitle("")
        },
      },
      "Add",
    ),
    span(() => `${left()} left`),
    ul(
      For({
        each: todos,
        key: (t) => t.id,
        fallback: () => li("nothing yet"),
        children: (item) => li(() => item().title),
      }),
    ),
  )
}

mount(document.body, TodoApp)
```

A component runs **once**. Every function child or function prop is a live,
fine-grained binding. There is no re-render.

## Why this exists

Most application code is now written by models, but frameworks still optimize
for human learning curves. vint optimizes for one metric instead: *the
probability that a model writes a correct app on the first try, and can
diagnose a failure on the second.* Concretely:

- **Inherited semantics.** Where vint uses a Solid name, it implements
  Solid's behavior faithfully — a model's prior is already correct. The few
  deliberate divergences are listed at the top of
  [docs/llms.txt](docs/llms.txt), not left subtly different.
- **Errors are prompts.** Thirty-two prescriptive error codes catch the exact
  mistakes Solid- and VanJS-trained authors make, and each one states the
  fix: `E-FOR-ITEM-ACCESS: you read .title on the item accessor — call it
  first: item().title`.
- **A written contract.** Every behavioral promise is a numbered clause in
  [docs/contract.md](docs/contract.md); the test suite cites the clauses; if
  code and contract disagree, the code is the bug.
- **One way to do each thing.** No aliases, no proxy store, no second state
  primitive. Small surface, consistent generated code.

The full rationale: [docs/design.md](docs/design.md).

## Evaluation

The metric above is testable, so it is tested. The [eval harness](eval/README.md)
gives four models — Claude Opus 5, Claude Sonnet 5, and OpenAI's
gpt-5.6-terra and gpt-5.6-luna — the same app specs under five conditions:
vint with llms.txt in context, vint with only its type declarations, and
React, Solid, and VanJS as baselines. Solutions are graded by behavioral
acceptance tests (DOM identity across reorders, race outcomes, subscription
discipline, state surviving navigation), with one fix attempt per failure.
**pass@1** is first-try correctness; **pass@2** is second-try diagnosis.

Ten small-to-trap-sized tasks (pass@1 → pass@2), measured against the
rebuilt v0.8.0 runtime, now with the two no-build baselines a harness
author would actually weigh vint against — Preact with htm and Vue's
runtime+compiler build (the pre-rebuild round is in
[docs/assessment-2026-09.md](docs/assessment-2026-09.md)):

| condition | Opus 5 | Sonnet 5 | gpt-5.6-terra | gpt-5.6-luna |
|---|---|---|---|---|
| vint + llms.txt | 49/50 → 50/50 | 48/50 → 50/50 | 49/50 → 50/50 | 48/50 → 49/50 |
| vint, types only | 50/50 | 50/50 | 50/50 | 48/50 → 49/50 |
| react | 50/50 | 50/50 | 50/50 | 50/50 |
| solid | 50/50 | 50/50 | 48/50 → 49/50 | 49/50 → 50/50 |
| vanjs | 38/49 → 49/49¹ | 42/50 → 46/50 | 34/50 → 43/50 | 28/50 → 41/50 |
| preact + htm | 50/50 | 50/50 | 50/50 | 49/50 → 50/50 |
| vue (runtime build) | 45/45¹ | 50/50 | 49/50 → 50/50 | 48/50 → 50/50 |

And one large app — a three-view project tracker (~300 lines: async seed,
nested keyed lists, cross-view derived counts, state surviving navigation):

| condition | Opus 5 | Sonnet 5 | gpt-5.6-terra | gpt-5.6-luna |
|---|---|---|---|---|
| vint + llms.txt | 4/5 → 5/5 | 5/5 | 3/5 → 5/5 | 5/5 |
| vint, types only | 3/5 → 5/5 | 3/5 → 4/5 | 3/5 → 4/5 | 1/5 → 4/5 |
| react | 5/5 | 5/5 | 1/5 → 4/5 | 5/5 |
| solid | 5/5 | 5/5 | 3/5 → 4/5 | 2/5 → 4/5 |
| vanjs | 5/5 | 2/5 → 5/5 | 4/5 → 4/5 | 3/5 → 5/5 |
| preact + htm | 5/5 | 5/5 | 1/5 → 4/5 | 5/5 |
| vue (runtime build) | 5/5 | 5/5 | 5/5 | 5/5 |

And one task written and accepted by someone other than the framework's
author — a kanban board (async seed, moves with a timed badge, undo, a
filter that hides without removing, edit-in-place with focus retention, a
keyboard shortcut):

| condition | Opus 5 | Sonnet 5 | gpt-5.6-terra | gpt-5.6-luna (20 samples) |
|---|---|---|---|---|
| vint + llms.txt | 5/5 | 5/5 | 5/5 | 16/20 → 20/20 |
| vint, types only | 4/5 → 4/5 | 4/5 → 4/5 | 4/5 → 4/5 | 8/20 → 18/20 |
| react | 5/5 | 5/5 | 5/5 | 17/20 → 20/20 |
| solid | 5/5 | 1/5 → 5/5 | 1/5 → 4/5 | 5/20 → 17/20 |
| vanjs | 5/5 | 5/5 | 5/5 | 17/20 → 19/20 |
| preact + htm | 5/5 | 5/5 | 5/5 | 18/20 → 20/20 |
| vue (runtime build) | 5/5 | 2/5 → 4/5 | 2/5 → 4/5 | 4/20 → 18/20 |

Reading the tables:

- **Every condition except VanJS is at or near ceiling on the small tasks**
  — 48–50 out of 50 throughout, and the typed `vint.d.ts` shipped in
  v0.8.0 puts the types-only arm at 50/50 on three engines. That supports the claim that vint scores
  comparably to React and Solid here; it does not show vint is better, and
  at this ceiling the benchmark cannot separate the design choices it was
  built to test. Differentiation would need weaker engines or larger apps.
- **VanJS is the outlier**: 22–38/50 pass@1 with the weakest pass@2
  recovery. That is consistent with this project's stated diagnosis — silent
  staleness leaves a model nothing to diagnose from — though the eval was
  designed by the person who made that diagnosis, so it confirms the
  reasoning rather than independently testing it.
- **The large app is where the guide shows a difference**, and each cell is
  five samples reported without confidence intervals. Treat the 3/5 vs 5/5
  gaps as suggestive, not established. Without the guide, the recurring
  failure was the rule-1 bug — a one-shot untracked read of async state,
  rendering "undefined" forever; with it in context, that class did not
  appear.
- **The baselines swing more between rounds than vint does**: React on
  Terra and Solid on Luna each dropped by two or three samples on the
  large app with no change on their side — n=5 in action. `summary.mjs`
  now prints Wilson 95% intervals next to every cell; a 3/5 is 19–88%.
- **The two no-build baselines are at ceiling on the small tasks and at or
  above React on the large app** (Vue 5/5 on every engine). They are the
  comparison that answers a buyer's question, and vint is at parity with
  them too.
- **The externally authored task separates Solid and Vue from the rest,
  not vint from React.** vint with the guide, React, VanJS and Preact with
  htm are all 5/5 on three engines and 16–18/20 on the smallest; Solid
  (1/5, 1/5, 5/20) and Vue (2/5, 2/5, 4/20) miss on the first try for
  framework-specific reasons — Solid apps call `.focus()` in a `ref`
  before the element is in the document, Vue apps read a `v-for` template
  ref as an element when it is an array — and mostly recover on the
  second. An earlier version of this table had Preact at 0–2/5; that was a
  defect in the acceptance test (Enter dispatched in the same tick as the
  value change, which an asynchronous renderer cannot see), fixed and
  re-run — see the method notes in `eval/README.md`. The Luna column is
  twenty samples per cell (vint with the guide 58–92%, React 64–95%,
  Solid 11–47%); the others are five. Two of vint's first-try misses on
  Luna were syntax slips, one was `key: c => c().id` (now a guide
  sentence), and one in the five-sample round was the trap code
  E-FOR-ARRAY firing on a plain array passed to `For` — fixed from the
  message on the second try, the recovery the design is for.
- **The item-accessor divergence shows no measurable cost**: 59/60 vs 59/60
  in a controlled A/B against a value-passing variant, and zero
  `E-FOR-ITEM-ACCESS` occurrences across ~1,100 scored generations.

Known weaknesses in the method — unequal denominators in the `vint, types
only` row, calibration coverage that is thorough for vint and thin for the
baselines, and acceptance tests written by the framework's own author — are
set out in
[docs/review-2026-09.md](docs/review-2026-09.md#the-eval-as-evidence).

Reproduce it: `cd eval && npm install && npm run calibrate`, then
`npm run pilot` with API credentials. Method, per-run costs, and every
lesson the harness taught us: [eval/README.md](eval/README.md). The full
analysis — methodology, the incident log (including how our own harness
biases were caught and fixed), failure taxonomy, threats to validity, and a
step-by-step reproduction guide with archived raw data — is in the wiki:
[AI-Native Evaluation](https://github.com/Vela-Intelligence/vint/wiki/AI-Native-Evaluation).

¹ Cells excluded for deterministic safety-classifier refusals, not coding
failures: one VanJS cell in the first round, and all five samples of task
07 under Vue on Opus 5 in this one — the same classifier, now tripped by a
different condition's context. Recorded and excluded; see the eval lessons.

## Status and known limitations

v0.8.0 (unreleased), pre-1.0, one maintainer, not yet published to a package registry.
The API surface is stable in practice but not frozen.

The project is reviewed periodically and the findings are kept in the repo
rather than in an issue tracker, unedited after the fact.
[docs/assessment-2026-09.md](docs/assessment-2026-09.md) is the current
one: a second review at v0.7.1 covering objective, market fit, evidence,
and defects. It found four High, eight Medium and eighteen Low defects the
test suite of the time did not cover and proposed a test-first rebuild of
the runtime; v0.8.0 is that rebuild, executed in full (Phases 0–6), and the
assessment's preface records what it produced, what a second adversarial
pass found afterwards, and what the eval re-runs measured. Every finding is
closed with a regression test that started life failing, and the findings
stay in the document because the tests cite them by name. The earlier
[docs/review-2026-09.md](docs/review-2026-09.md) tracks the ten findings
before it, all resolved across v0.5.0–v0.7.1. One of them, F4, closed with
a case explicitly accepted as undetectable rather than fixed: a
zero-argument callback property that reads signals is shaped identically
to a correct reactive binding, so no warning can separate them — use
`prop:` for callbacks and the question never arises.

The largest known scaling limit is not a defect but a shape: `For` diffs
whatever `each()` returns, so a list of many thousands of rows should be
windowed rather than rendered whole (`examples/virtual.ts`).

That review also corrects two of its own earlier claims — performance
numbers first taken under happy-dom, whose `nextSibling` is O(n), and a
proposed fix that would have fired on correct code. Read it before trusting
any performance figure quoted about this project.

## Install

**Vendored, no build (the intended simple path):** download `vint.js` (and
`vint.d.ts` for editor types) from a
[release](https://github.com/Vela-Intelligence/vint/releases), drop them next
to your app, and:

```html
<script type="module">
  import { createSignal, mount, tags } from "./vint.js"
</script>
```

**As a git dependency** (any bundler): `npm install github:Vela-Intelligence/vint`
builds `dist/` on install; import from the package root. Bundlers pick
`dist/vint.js` (assertions on) under the `development` condition and
`dist/vint.prod.js` (assertions off, minified) under `production`. Types ship
in `dist/vint.d.ts`. Copying `src/` into a TypeScript project also works and
keeps assertions on.

## API

Everything, in one table — plus one other entry point, `vint/testing`,
the verification loop (§T of the contract):

| Area | Exports |
| --- | --- |
| State | `createSignal` `createMemo` `createEffect` `createRenderEffect` `batch` `untrack` `on` `createSelector` |
| Lifecycle | `createRoot` `onMount` `onCleanup` `getOwner` `runWithOwner` |
| DOM | `tags` `tagsNS` `mount` |
| Control flow | `Show` `Switch` `Match` `For` |
| Async | `createResource` |
| Testing (`vint/testing`) | `render` `settle` `click` `setValue` `type` `fire` `pressKey` `byText` `visibleText` `text` `waitFor` `captureWarnings` |

Custom elements are ordinary tags — `tags["my-button"]({ label: "Save" })` —
with property-first assignment, so Lit and friends just work.

## If you're pointing an AI at this

Give it [docs/llms.txt](docs/llms.txt). It's ~2k tokens: the six rules, the
Solid divergences, the untrusted-data rules, and every error code. That file
is a first-class deliverable of this project — if the guide and the library
ever disagree, file a bug.

The agent can close its own loop: `vint/testing` and `npx vint verify tests/`
(or the vendored `verify.mjs`) run its tests in Node with happy-dom and
print the app's own warnings as the diagnosis — see "Verifying your app"
in the guide.

For agent harnesses with skill support (Claude Code and compatible), vendor
[skills/vint/SKILL.md](skills/vint/SKILL.md) into your project's skills
directory alongside `vint.js` — it's the same guide, packaged to load
automatically whenever the agent works with vint code.

## Examples

`examples/` is a small gallery — counter, todos, stopwatch, fetch-then-render,
and a component-patterns page — built only on vint and plain elements:

```bash
npm install
npm run examples   # builds and serves examples/ with rebuild-on-change
```

## Development

```bash
npm test            # vitest + happy-dom; tests cite contract clauses
npm run test:browser # the same suite plus tests/browser in a real browser
                    # (--browser.name=chromium|firefox|webkit; CI runs all three)
npm run coverage    # v8 coverage with enforced thresholds
npm run mutate      # Stryker mutation testing on src/reactive.ts
npm run typecheck   # strict TS
npm run lint        # biome
npm run build       # dist/vint.js (DEV on), dist/vint.prod.js (DEV off), dist/vint.d.ts
npm run smoke       # imports every bundle in plain Node; proves the DEV matrix and
                    # that vint/testing shares the app's vint instance
npx vint verify tests/   # the consumer-facing runner (happy-dom), on *.test.mjs
```

Docs map: [design.md](docs/design.md) (why) ·
[contract.md](docs/contract.md) (exact behavior, the source of truth) ·
[llms.txt](docs/llms.txt) (the agent guide) ·
[assessment-2026-09.md](docs/assessment-2026-09.md) (second review, rewrite plan) ·
[review-2026-09.md](docs/review-2026-09.md) (first review, resolved findings) ·
[wiki](https://github.com/Vela-Intelligence/vint/wiki) (the evaluation:
methodology, results, defense).

Contributions welcome. The bar for any behavior change: update the contract
first, then the tests, then the code — in that order.

## License

[MIT](LICENSE)

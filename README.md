# vint

**Vanilla In TypeScript** — a UI framework whose primary user is an AI.

Real DOM, no virtual DOM, no JSX, no build step. VanJS-shaped tag functions
over a Solid-faithful reactive core, shipped as one ~47 kB ESM file (~12 kB
gzipped) with every assertion on, or ~19 kB (~7.5 kB gzipped) with them
compiled out, zero runtime dependencies. What ships with the runtime is
the point: an agent-sized guide, a numbered behavioral contract, error
messages written as prompts, a test harness the agent can run on its own
output, and an evaluation that measures whether any of it works.

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

## What it is

Five deliverables, each a first-class part of the product:

- **The runtime** (`dist/vint.js`): signals, memos, effects, ownership,
  keyed lists, conditional rendering, resources, and tag functions that
  return real DOM elements. Solid 1.x semantics wherever a Solid name is
  used, verified by running the same programs through Solid itself.
- **The guide** ([docs/llms.txt](docs/llms.txt), ~3,000 words): the six
  rules, the deliberate divergences from Solid, every error code, and how
  to verify an app. Mirrored as an agent skill in
  [skills/vint/SKILL.md](skills/vint/SKILL.md). Four implementer runs that
  saw only the shipped files turned every point where the guide fell short
  into a sentence in it.
- **The contract** ([docs/contract.md](docs/contract.md)): 38 numbered
  clauses covering reactivity, ownership, DOM, control flow, async, and
  testing. Tests cite clauses; source comments cite them at the line that
  makes them true; when code and contract disagree, the code is the bug.
- **The verification loop** (`vint/testing` and `vint verify`): twelve
  helpers a model already knows the names of, and a happy-dom runner that
  prints the app's own warnings as the diagnosis. An agent that writes an
  app with vint can test it in the same session with no configuration.
- **The evaluation** ([eval/](eval/README.md)): seven conditions, four
  engines, twelve tasks, behavioral acceptance tests, results committed to
  the repo. It exists to find out whether the design works, and it has
  found defects in its own harness as well as in the framework.

What it is not: server rendering or hydration, JSX, a component library
(custom elements are ordinary tags), or Solid without JSX. Solid APIs that
would only be there for completeness — context, error boundaries, `Index`,
`Portal`, resource `state`/`latest` — are deliberately absent, and the guide
says what to write instead.

## Why this exists

Most application code is now written by models, but frameworks still optimize
for human learning curves. vint optimizes for one metric instead: *the
probability that a model writes a correct app on the first try, and can
diagnose a failure on the second.* Concretely:

- **Inherited semantics.** Where vint uses a Solid name, it implements
  Solid's behavior faithfully — a model's prior is already correct. The few
  deliberate divergences are listed at the top of the guide, not left subtly
  different.
- **Errors are prompts.** Thirty-three prescriptive error codes catch the exact
  mistakes Solid- and VanJS-trained authors make, and each one states the
  fix: `E-FOR-ITEM-ACCESS: you read .title on the item accessor — call it
  first: item().title`.
- **A written contract.** Every behavioral promise is a numbered clause; the
  test suite cites the clauses; CI checks that the code, the guide, and the
  contract name the same codes, exports, and clauses.
- **One way to do each thing.** No aliases, no proxy store, no second state
  primitive. Small surface, consistent generated code.

The full rationale, including the five principles and the failure classes of
the LLM-written prototype that started the project:
[docs/design.md](docs/design.md).

## How it works

### Reactivity

`createSignal` returns a getter and a setter. `createMemo` derives a value;
`createEffect` runs a side effect; `createRenderEffect` is the same thing
scheduled before user effects, and it is what every DOM binding is. Reads
inside a computation register dependencies automatically; `untrack` opts
out, `batch` groups writes, `on` makes the dependency list explicit.

The scheduler is Solid 1.x's three-state design: every node is clean, or
possibly stale, or stale, and a write marks downstream nodes and then runs
one flush. Memos recompute at most once per flush and always before the
effects that read them (no glitches), a flush runs synchronously at the end
of the outermost write, and by the time a setter returns the DOM is final.
Failure is bounded: a memo that throws produces one error per flush and never
permanently detaches the effects behind it; an effect that writes what it
reads is stopped for that flush with `E-LOOP` and resumes on the next write;
disposal is total even when a cleanup throws.

Every computation has an owner. `createRoot` and `mount` create one,
`onCleanup` registers work against the current one, and disposing an owner
disposes everything created under it, last-in first-out. Reading a disposed
memo or creating an effect under a disposed owner is an error that names the
fix, not a silent no-op.

### The DOM layer

`tags.div(props, ...children)` builds a real element and returns it. A
static child is appended once. A function child becomes a binding: a render
effect that owns a comment-delimited range in the parent and replaces the
range's contents when its value changes. Ranges are read live from the DOM,
never from a snapshot, so a `For` nested inside a `Show` inside a function
child keeps working as each layer inserts and removes nodes on its own
schedule.

`For` is keyed. Each row is created once, owns its own scope, and receives
its item as an accessor that updates in place when the item changes; keys
must be unique. Reordering uses a longest-increasing-subsequence diff, so a
single move costs two DOM insertions whatever the list size. `Show`,
`Switch` and `Match` take an accessor and function children, and rebuild a
branch only when the branch changes, not when the value inside it does.

Props route by a table. Built-in tags are typed from `lib.dom`, so a
misspelt key or a wrong value type fails to compile. A key that is a DOM
property is assigned as a property; anything else is an attribute; `attr:`
and `prop:` force either. Event handlers are `onclick`, `oninput`, and so
on, by lowercase name; a string under an event key is skipped with
`E-EVENT-VALUE`, so an inline handler attribute can never be created.
`style` takes a string or a diffed object. `href`, `src`, `action` and
their kin never accept a `javascript:` or `vbscript:` URL — the value is
skipped in every bundle and dev warns `E-URL-SCHEME`; a `data:` URL outside
an image sink warns and is still set, so validate upstream. Custom
elements get property-first assignment, so Lit and friends work as
ordinary tags.

**Deploying the vendored file.** In a no-build deployment the page's
Content-Security-Policy is the primary control, and `script-src 'self'` is
enough for vint: it writes no inline handlers, uses no `eval`, and its
children path never parses HTML. `require-trusted-types-for 'script'` is
compatible too, except where an app assigns `innerHTML`, `outerHTML` or
`srcdoc` itself — the one place a policy needs a sink.

### Async

`createResource(source, fetcher)` returns an accessor with `loading` and
`error`, plus `refetch` and `mutate`. Its observable behavior matches Solid
1.x's in the differential suite — synchronous completion, `mutate` as a
setter, stale refetches resolving their own value, same-microtask fetches
deduplicated — with three stated divergences: `data()` never throws,
`refetch()` always returns a promise, and disposing the owner cancels the
fetch.

### Errors as prompts, and the two bundles

Every check names what happened and says what to write instead. `dist/vint.js`
carries all of them and is what an agent should build against.
`dist/vint.prod.js` is built with `__VINT_DEV__` false in two esbuild passes
so that every dev-only check *and its message text* is gone; a smoke test
imports both bundles and proves the matrix. Bundlers pick between them by the
`development` and `production` export conditions.

## Performance

The numbers that matter are deterministic. `For`'s reconciler is measured by
counting `insertBefore` calls for one operation; wall-clock is reported but
carries 30–40% run-to-run variance and should be read as a shape, not a
figure. Chromium, one laptop, median of 5 batches of 20 operations, from
`npm run bench`:

| rows | append one | update one field | move first → last | swap adjacent | reverse |
|---|---|---|---|---|---|
| 200 | 1 insert · 0.20 ms | 0 · 0.09 ms | 2 · 0.17 ms | 2 · 0.08 ms | 398 · 0.68 ms |
| 1,000 | 1 · 0.59 ms | 0 · 1.09 ms | 2 · 0.92 ms | 2 · 0.44 ms | 1,998 · 3.7 ms |
| 3,000 | 1 · 2.98 ms | 0 · 2.25 ms | 2 · 2.79 ms | 2 · 2.44 ms | 5,998 · 14.9 ms |

Three things to read off it:

- **DOM work is minimal and independent of list size.** A move is two
  insertions at 200 rows and at 3,000; an in-place field update is zero
  because the row's text binding updates itself. A reverse moves every node
  because every node has to move; the count is `2N − 2`, the floor.
- **The diff itself is linear in what `each()` returns.** Even a zero-insert
  operation costs about 0.1 ms at 200 rows and 2 ms at 3,000, because the
  reconciler walks the whole list each time. That is information-theoretic
  — without the array carrying deltas, any keyed reconciler pays it — and it
  is the one scaling limit worth designing around: a list of many thousands
  of rows should be **windowed**, not rendered whole.
  [examples/virtual.ts](examples/virtual.ts) renders 50,000 records through
  a ~23-row window at one insertion and one row build per scroll step.
- **Bindings are fine-grained.** A signal write reaches only the bindings
  that read it; there is no component re-render to diff, and no virtual DOM
  to allocate. Reading the same signal *n* times inside one computation
  registers *n* edges, exactly as Solid 1.x does — the trade-off is stated in
  [docs/design.md](docs/design.md) rather than "improved" away.

Two caveats the project learned the hard way. Never take performance numbers
from happy-dom: its `nextSibling` is a linear scan, which makes any
range-walking reconciler look quadratic. And the bench page has no per-case
isolation or warm-up, so a small millisecond difference between two rows
means nothing; the insert counts are the evidence.

## Verification

The runtime is held to more than examples:

- **Property-based scheduler tests** generate random reactive graphs and
  write sequences and compare every observable against a full-recompute
  oracle, including throw and cascade arms.
- **A differential suite** runs the same programs through Solid 1.9.15's
  browser build and vint and asserts identical traces — signals, memos,
  effects, ownership, `on`, and resources.
- **Fuzzing** of `For` and the binding tree checks DOM identity, ordering,
  anchor uniqueness, subscription counts, and move-minimality against an
  O(n²) reference.
- **Real browsers**: the suite runs in Chromium, Firefox and WebKit in CI, not
  only under happy-dom.
- **Coverage thresholds** (95 / 90 / 95 / 95, currently 97.8 / 94.3 / 97.9 /
  97.8) and **mutation testing** on the scheduler (Stryker, about 77%).
- **Alignment in CI**: error codes, exports, contract clauses, and the
  `vint/testing` surface must agree across the code and both copies of the
  guide.

270 tests in Node, 252 in each browser. Every defect found by the two
reviews below has a regression test that started life failing.

And the same loop is available to the code an agent writes:

```ts
import { render, type, pressKey, byText, captureWarnings } from "vint/testing"

test("adds a todo", () => {
  const { container } = render(TodoApp)
  const input = container.querySelector("input")!
  const warnings = captureWarnings(() => {
    type(input, "milk")
    pressKey(input, "Enter")
  })
  assert.ok(byText(container, "milk", "li"))
  assert.deepEqual(warnings, [])
})
```

`node verify.mjs tests/` (vendored) or `npm run verify` (git install, with
`"verify": "vint verify tests/"` in your package scripts — never `npx vint`,
see Install) runs `*.test.mjs` files under happy-dom with `test`, `it`,
`describe`, `test.skip`, `beforeEach` and `afterEach` globals, prints PASS,
FAIL or SKIP per test with the console lines the test produced, disposes
any root a test left mounted, and exits non-zero on any failure. The same
files run under vitest unchanged.

## Evaluation

The metric above is testable, so it is tested. The [eval harness](eval/README.md)
gives four models — Claude Opus 5, Claude Sonnet 5, and OpenAI's
gpt-5.6-terra and gpt-5.6-luna — the same app specs under seven conditions:
vint with the guide in context, vint with only its type declarations, and
React, Solid, VanJS, Preact with htm, and Vue's runtime+compiler build as
baselines. Solutions are graded by behavioral acceptance tests (DOM identity
across reorders, race outcomes, subscription discipline, state surviving
navigation), with one fix attempt per failure. **pass@1** is first-try
correctness; **pass@2** is second-try diagnosis. Wilson 95% intervals sit
next to every count in `eval/harness/summary.mjs`.

Ten small-to-trap-sized tasks (pass@1 → pass@2), measured against the
rebuilt v0.8.0 runtime (the pre-rebuild round is in
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
  — 48–50 out of 50 throughout, and the typed `vint.d.ts` shipped in v0.8.0
  puts the types-only arm at 50/50 on three engines. That supports the claim
  that vint scores comparably to React, Solid, Preact and Vue here; it does
  not show vint is better, and at this ceiling the benchmark cannot separate
  the design choices it was built to test.
- **VanJS is the outlier**: 22–38/50 pass@1 with the weakest pass@2
  recovery. That is consistent with this project's stated diagnosis — silent
  staleness leaves a model nothing to diagnose from — though the eval was
  designed by the person who made that diagnosis, so it confirms the
  reasoning rather than independently testing it.
- **The large app is where the guide shows a difference.** It is the only
  condition at 5/5 or recovering to 5/5 on every engine. Without the guide,
  the recurring failure was the rule-1 bug — a one-shot untracked read of
  async state, rendering "undefined" forever; with it in context, that class
  did not appear. Each cell is five samples: a 3/5 is 19–88%, so treat the
  gaps as suggestive, not established. The baselines swing more between
  rounds than vint does — React on Terra and Solid on Luna each dropped by
  two or three samples with no change on their side.
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
  `E-FOR-ITEM-ACCESS` occurrences across the 1,855 scored generations in
  the repository's result files.
- **A second, cheaper method agrees.** The kanban spec given to interactive
  Claude Code sessions with only the shipped files, on a subscription: vint
  with the guide and React 18 without JSX, on Opus and on Sonnet, all four
  green. React was cheaper on the engine that knows it best; both React
  implementers lost their longest stretch to the same silent test seam — a
  value set on an input never reaching `onChange` — that `vint/testing`
  ships the fix for, and neither vint run fired a warning.

What the method still does not give you: independence — the framework, the
guide, and eleven of the twelve tasks share one author, and calibration
reference solutions cover every task for vint but one or two per baseline;
tight intervals anywhere but the twenty-sample column; and superiority over
React or Solid, which is neither the claim nor the result. Weaknesses found
and fixed along the way (unequal denominators, a harness that could not see
the guide's own import specifier, the acceptance defect above) are recorded
in [eval/README.md](eval/README.md) and
[docs/review-2026-09.md](docs/review-2026-09.md#the-eval-as-evidence).

Reproduce it: `cd eval && npm install && npm run calibrate`, then
`node harness/run.mjs --conditions ... --tasks ... --model ...` with API
credentials; `node harness/summary.mjs` renders every table above from
`eval/results/`. The whole program to date cost about $74 in API spend. The
first round in full — methodology, incident log, failure taxonomy, threats to
validity — is in the wiki:
[AI-Native Evaluation](https://github.com/Vela-Intelligence/vint/wiki/AI-Native-Evaluation).

¹ Cells excluded for deterministic safety-classifier refusals, not coding
failures: one VanJS cell in the first round, and all five samples of task
07 under Vue on Opus 5 in this one — the same classifier, now tripped by a
different condition's context. Recorded and excluded; see the eval lessons.

## Status and known limitations

v0.8.1, pre-1.0, one maintainer, private, not on any package registry by
design (see Install). The API surface is stable in practice but not frozen.

The project is reviewed periodically and the findings are kept in the repo
rather than in an issue tracker, unedited after the fact.
[docs/assessment-2026-09-final.md](docs/assessment-2026-09-final.md) is the
current one: a final pass at the v0.8.0 tag over security, memory, and
behaviour against the guide. It found one High ordering defect in the
scheduler and, while repairing the property oracle that had missed it,
three more; v0.8.1 closes every finding but one (F1–F7, F9–F12), each with
a contract clause and a regression test that fails on v0.8.0. Open: F8 —
one source for the guide and the skill, decision pending. Before it,
[docs/assessment-2026-09.md](docs/assessment-2026-09.md) is
a second review at v0.7.1 covering objective, market fit, evidence,
and defects. It found four High, eight Medium and eighteen Low defects the
test suite of the time did not cover and proposed a test-first rebuild of
the runtime; v0.8.0 is that rebuild, executed in full, and the assessment's
preface records what it produced, what a second adversarial pass found
afterwards, and what the eval re-runs measured. Every finding is closed with
a regression test that started life failing, and the findings stay in the
document because the tests cite them by name. The earlier
[docs/review-2026-09.md](docs/review-2026-09.md) tracks the ten findings
before it, all resolved across v0.5.0–v0.7.1.

Limits that are accepted rather than fixed:

- A zero-argument callback property that reads signals is shaped identically
  to a correct reactive binding, so no warning can separate them — use
  `prop:` for callbacks and the question never arises.
- `For` diffs whatever `each()` returns; very long lists are windowed, not
  rendered whole (see Performance).
- A `Show` branch body is not a tracking scope: reads inside it that are not
  in a function position are one-shot, as the guide says in rule 1.
- Solid 2.0's async model is not tracked; vint follows Solid 1.x, the version
  models have the deepest prior for.

## Install

**Vendored, no build (the intended simple path):** copy `vint.js` and
`vint.d.ts` next to your app — from a
[release](https://github.com/Vela-Intelligence/vint/releases), or from
`dist/` after `npm install && npm run build` on a checkout — and:

```html
<script type="module">
  import { createSignal, mount, tags } from "./vint.js"
</script>
```

For the verification loop alongside, copy `vint-testing.js`,
`vint-testing.d.ts` and `bin/verify.mjs` too; `node verify.mjs tests/` runs
your tests with only `happy-dom` and `@happy-dom/global-registrator`
installed.

**As a git dependency** (any bundler): `npm install github:Vela-Intelligence/vint`
builds `dist/` on install; import from the package root and from
`vint/testing`. Bundlers pick `dist/vint.js` (assertions on) under the
`development` condition and `dist/vint.prod.js` (assertions off, minified)
under `production`. Types ship in `dist/vint.d.ts`. Copying `src/` into a
TypeScript project also works and keeps assertions on. For the runner, add
`"verify": "vint verify tests/"` to your package scripts and run
`npm run verify` — npm scripts resolve the local binary only.

**Not on npm, by design.** vint is not published to any package registry
and will not be: you get it from a release of this repository, or you
install the repository itself. The package named `vint` on npm is
unrelated to this project. Never run `npx vint` — it would fetch that
unrelated package and execute whatever it contains.

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

Give it [docs/llms.txt](docs/llms.txt): the six rules, the Solid
divergences, the untrusted-data rules, every error code, and how to verify.
That file is a first-class deliverable of this project — if the guide and
the library ever disagree, file a bug.

The agent can close its own loop: `vint/testing` and `node verify.mjs tests/`
(or `npm run verify` on a git install) run its tests in Node with happy-dom
and print the app's own warnings as the diagnosis — see "Verifying your app"
in the guide.

For agent harnesses with skill support (Claude Code and compatible), vendor
[skills/vint/SKILL.md](skills/vint/SKILL.md) into your project's skills
directory alongside `vint.js` — it's the same guide, packaged to load
automatically whenever the agent works with vint code.

## Examples

`examples/` is a small gallery — counter, todos, stopwatch, fetch-then-render,
a component-patterns page, a 50,000-row windowed list, and the benchmark —
built only on vint and plain elements:

```bash
npm install
npm run examples   # builds and serves examples/ with rebuild-on-change
npm run bench      # the For benchmark, in a real browser
```

## Development

```bash
npm test             # vitest + happy-dom; tests cite contract clauses
npm run test:browser # the same suite plus tests/browser in a real browser
                     # (--browser.name=chromium|firefox|webkit; CI runs all three)
npm run coverage     # v8 coverage with enforced thresholds
npm run mutate       # Stryker mutation testing on src/reactive.ts
npm run typecheck    # strict TS
npm run lint         # biome ci
npm run check:alignment  # codes, exports, clauses, testing surface: code ↔ guide ↔ contract
npm run check:props  # src/props.generated.ts matches lib.dom
npm run build        # dist/vint.js, dist/vint.prod.js, dist/vint-testing*.js, .d.ts files
npm run smoke        # imports every bundle in plain Node; proves the DEV matrix and
                     # that vint/testing shares the app's vint instance
```

Docs map: [design.md](docs/design.md) (why) ·
[contract.md](docs/contract.md) (exact behavior, the source of truth) ·
[llms.txt](docs/llms.txt) (the agent guide) ·
[assessment-2026-09-final.md](docs/assessment-2026-09-final.md) (final pass at v0.8.0: security, memory, the ordering defect and its patch) ·
[assessment-2026-09.md](docs/assessment-2026-09.md) (second review and the rebuild record) ·
[review-2026-09.md](docs/review-2026-09.md) (first review, resolved findings) ·
[eval/README.md](eval/README.md) (the evaluation's method notes) ·
[wiki](https://github.com/Vela-Intelligence/vint/wiki) (overview and the first round in full).

Contributions welcome. The bar for any behavior change: update the contract
first, then the tests, then the code — in that order.

## License

[MIT](LICENSE)

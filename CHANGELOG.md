# Changelog

## 0.8.0 — unreleased

Phases 0–3 of the rebuild proposed in
[docs/assessment-2026-09.md](docs/assessment-2026-09.md). Phase 0 is
distribution and the DEV constant; Phase 1 is the test harness the rebuilt
runtime is held to, landed *before* the runtime changes; Phase 2 is the
reactive core and Phase 3 the DOM and control-flow layers, rebuilt against
it. Every finding in the assessment's §6 with a code fix is closed; every
regression is a plain test.

### Phase 3 — DOM and control flow

Closes H3, H4, M1, M5, M8, L6, L7, L8, L11, L12, L18 (and documents L17).

- **One range abstraction** (`src/range.ts`). A binding, a `For` row, a
  `For` fallback and `mount` all delimit their DOM the same way — a start
  marker and an end marker or predicate, contents always read LIVE — and the
  ordering rule ("register the clearing cleanup before building children")
  is stated once, where the code is. That is the fix for H3: a `For`
  fallback that is a `Show`, a bare accessor or an array with a function is
  now removed entirely when rows appear and on dispose. The same rule fixed
  F1 in the September review, in one place; now there is one place.
- **`mount` disposes on a throw** (M1). A view that throws, or a binding
  whose first run throws in the flush after the body, leaves nothing
  subscribed and nothing appended; the error is rethrown (with the
  disposal's, if that threw too).
- **A fragment re-expands to its live contents** (L8). A `For` created
  outside a binding and returned from it again renders the rows it has now,
  instead of nothing.
- **Prop routing is a table** (`src/props.ts`), and the table is
  case-aware. `OnClick`, `ONCLICK` and every other spelling of an event key
  are listeners when the value is a function and skipped with E-EVENT-VALUE
  otherwise; `attr:onclick` is skipped with the new E-EVENT-ATTR — vint never
  writes an inline handler attribute (H4). `null`/`undefined` on the property
  path clear a string property to `""` and remove the attribute, so
  `title: () => user()?.name` never renders "undefined" (M5). An assignment
  equal to the current property value is skipped, which keeps the caret in
  an input whose binding re-ran (L18). The URL check stringifies first and
  covers `formaction`, `poster`, `data` and `xlink:href` (L11). A `prop:`
  write to a getter-only property warns E-READONLY-PROP instead of throwing
  a raw TypeError, and a tag name the platform rejects — or that plainly is
  data — throws E-TAG-NAME, in happy-dom as in browsers (L12). The first
  object-valued `style` run no longer wipes inline styles the component
  body set (L6). E-FOR-SAMEREF fires only when the same array instance comes
  back with different contents, not when an unrelated dependency re-ran
  `each` (L7).
- **Typed props** (`src/props.generated.ts`, D11, M8). `scripts/gen-props.mjs`
  reads lib.dom through the TypeScript checker and emits, per built-in tag,
  its writable non-function IDL properties as `Reactive<T>`
  (`T | null | undefined | (() => T | null | undefined)`), every `on<event>`
  handler typed from `HTMLElementEventMap`, `data-*`/`aria-*` keys, and the
  `on:`/`prop:`/`attr:` escape hatches; the same for SVG plus its
  presentation attributes. `tags.div({ clas: "x" })`, `input({ value: 42 })`,
  `button({ onclick: "alert(1)" })` and a handler with the wrong signature
  are now compile errors, and `tags.dvi` is one too; hyphenated
  custom-element tags accept any key. `tagsNS(SVG)` returns typed SVG tags.
  `tests/types/props.test-d.ts` pins all of it with `@ts-expect-error`;
  `npm run check:props` fails CI if the generated file drifts from lib.dom.
  The first thing the types caught was in this repo: `td({ colspan: "4" })`
  in the benchmark, which had always been setting an attribute by accident.
- **Guides.** Both agent guides now say that props are typed and how to
  read the error, that nothing renders inside a root body until it returns,
  that `createContext`, `createSelector`, `ErrorBoundary`, `Index` and
  `Portal` do not exist and what to write instead, and the new D6/D8
  rules above.
- Coverage thresholds ratcheted to 95 / 90 / 95 / 95 (measured 97.6 / 93.6 /
  96.7 / 97.6). Suite: 195 in Node, 187 in each of Chromium, Firefox and
  WebKit.

### Phase 2 — the reactive core

`src/reactive.ts` rebuilt in place, same exports, around two structural rules
stated at the top of the file. Closes H1, H2, M2, M3, M4, L1, L2, L3, L5 and
L14; every regression for them is promoted from `test.fails` to a plain test,
and the property, differential and fuzz arms that reproduced them run
unflagged (`VINT_FULL=0` restores the Phase 1 baseline).

- **One gate.** Every entry point that can create or trigger work — a signal
  write, `batch`, a root body, a memo's creation, a stale memo read at top
  level — goes through one `runUpdates()` that defers effects until the
  outermost entry returns. An effect created inside a memo body now runs
  after the memo has its value, as in Solid (R7, M3).
- **Invariant I3, held by construction.** A node already at its target
  state is assumed to have queued observers, which is what lets `mark()`
  stop walking. Every path that aborts a node's processing — a memo throw,
  an upstream throw unwinding through validation, an E-LOOP skip — now sets
  `aborted` on every node it cut short, and `mark()` re-walks an aborted
  node instead of stopping. That is the single fix for H1 (a loop through a
  memo wedged the effect forever) and H2 (a memo error behind another memo
  stranded effects forever); the previous `errored` flag was the same idea
  applied to one site.
- **Errors, once.** An effect that throws — in its body or while validating
  its memos — is skipped for the rest of that flush, so a later promotion in
  the same flush cannot process it and report the same error twice (L3). A
  memo that threw rethrows the same error to every further pull in that
  flush instead of recomputing, and the flush reports each error object
  once: one failure is one error, however many effects it stranded.
- **Total disposal.** A throwing `onCleanup` no longer aborts the scope
  reset: children and the remaining cleanups still run, the effect body
  still runs on a re-run, and the errors surface once afterwards (M2).
  Owner unlink is O(1) via an owner slot, so clearing a large `For` is
  linear (L5). Creating a computation or cleanup under a disposed owner is
  E-DISPOSED-OWNER in dev; in prod the node is born disposed and the cleanup
  runs at once (L2). The owner stays active while its cleanups run, so an
  `onCleanup` registered inside a cleanup is kept (L14).
- **Solid parity.** `on(…, { defer: true })` returns `prevValue` on the
  deferred run (M4); the first memo compute assigns unconditionally and
  `equals` gates re-computes only (L1).
- **R8 clarified.** The loop counter is per effect, so an effect that merely
  reads a signal the looping effect writes reports its own E-LOOP alongside
  the culprit's — the message set names both; fix the writer.
- Mutation score on `src/reactive.ts` with the same suite: 79.0% after
  Phase 1 → 75.8% after the rebuild (424 killed, 117 survived, 22 with no
  coverage, out of 553 mutants against 433 before). Above the break line,
  and lower for an honest reason: the rebuilt file has more defensive code,
  and its prod-only branches (`DEV === false`) are never executed by a suite
  that runs with DEV on — a DEV-off run of the suite is the follow-up.

### Phase 1 — the harness

- **The contract now describes the intended behaviour, not the current
  code.** Clauses R5, R7, R8, R10, R11, O2, O5, D1, D2, D6, D7, D8, D9, D10
  and C2 are amended for the assessment's findings, and a new D11 promises
  typed props. Until Phases 2 and 3 land, the code is the bug in those
  places — which is the repo's stated order.
- **Four codes defined ahead of their call sites** (31 in total):
  E-DISPOSED-OWNER, E-EVENT-ATTR, E-TAG-NAME *(always)*, E-READONLY-PROP.
  E-EVENT-VALUE no longer prescribes `attr:` — there is no way to set an
  inline handler attribute.
- **`tests/regressions.assessment.test.ts`**: one `test.fails` per finding
  (H1–H4, M1–M5, L1–L3, L6–L8, L11, L12). vitest passes them only while
  they throw, so a fix forces promotion to a plain test — the suite can
  never silently forget a finding. L4 needed no fix once R10 said what
  actually happens; it is a plain test.
- **Property-based scheduler tests** (`tests/reactive.property.test.ts`,
  fast-check): random graphs, random writes, throws and disposals, checked
  against a full-recompute oracle. **Differential tests against Solid 1.x**
  (`tests/reactive.solid-diff.test.ts`): identical scenarios through both
  engines, identical traces — principle 1 as a test. **Fuzzing** for `For`
  (`tests/control.for.fuzz.test.ts`: DOM order, anchor uniqueness,
  subscription counts, and move-minimality against an O(n²) LIS reference)
  and for nested binding trees (`tests/dom.range.fuzz.test.ts`). Arms that
  reproduce known defects sit behind `VINT_FULL=1` as `test.fails` until
  the fixes land.
- **Real browsers.** `npm run test:browser` runs the whole suite plus
  `tests/browser/` — focus and selection survival across `For` moves, the
  children path never executing script, SVG routing, the platform's own
  `createElement` validation, CSS transitions across style diffs — in
  Chromium, Firefox and WebKit (CI matrix). Every test passed in all three
  on the first run.
- **Coverage** (`npm run coverage`, v8) with thresholds enforced in CI,
  starting at 90/85/90/90 against a measured 97/93/91 baseline and to be
  ratcheted to 95 as the rebuild lands. **Mutation testing**
  (`npm run mutate`, Stryker on `src/reactive.ts`) runs in CI on any PR
  that touches the scheduler. Baseline with the old suite: 74.0% (101
  surviving mutants, below the 75 break line); with the property and fuzz
  suites: 79.0% (82 surviving). Phase 2 is measured against that.
- **One divergence the differential suite found that the assessment did
  not list:** after a top-level memo read, two sibling effects of one
  signal can run in the opposite order to Solid (lazy memos re-track at
  read time and the swap-remove edge trick reorders observers). Not a
  contract violation — R7 orders only render-before-user — but observable;
  recorded for Phase 2.
- CI installs with `--ignore-scripts` (the `prepare` build is for
  consumers); `npm test` no longer needs `dist/`.

### Phase 0 — distribution and the DEV constant

- **Two bundles (§E).** `dist/vint.js` is unchanged in spirit — assertions
  on, the vendored default. `dist/vint.prod.js` is new: built with
  `__VINT_DEV__` defined false, minified, with every dev-only check *and its
  message text* absent from the file. It takes two esbuild passes
  (`scripts/build-prod.mjs`): the first inlines the DEV constant as a
  literal at every site, the second eliminates the branches it guards — a
  single pass leaves `if (false) throw` in place because esbuild does not
  re-run dead-code elimination after cross-module inlining. The smoke test
  now imports both files, proves the dev file warns and the prod file is
  silent, and greps the prod source for dev-only codes. This replaces the `import.meta.env.DEV` IIFE,
  which the assessment showed a Vite production build could not fold (M6):
  DEV is now a plain build-time constant, and left undefined it is on.
- **Installable from git (M7).** `exports` points at `dist/` with `types`,
  `development` and `production` conditions; `files` lists what ships; a
  `prepare` script builds on install. Still `private: true` — publishing and
  the package scope are a separate decision.
- **`src/dev.ts` splits thrown `MESSAGES` from warned `WARNINGS`** so the
  warning texts tree-shake out of the prod build; `vintWarn` returns early
  when DEV is off.
- **Release workflow** now lints, typechecks and runs the alignment guard,
  refuses a tag that does not match `package.json`'s version, builds the
  `.d.ts` bundle with checking on (L16), and attaches both bundles.
- **"Solid-faithful" means Solid 1.x**, stated in design.md and both agent
  guides; the eval pins `solid-js` exactly. Solid 2.0 changes the async
  model and vint does not track it.

## 0.7.1 — 2026-09-04

F4 from [docs/review-2026-09.md](docs/review-2026-09.md), which closes the
last open finding from the September review.

- **New warning E-DEAD-BINDING (D7).** A reactive prop binding whose first
  run reads no signals can never run again — dependencies are collected per
  run (R3) — so it is provably dead. That is the general form of the mistake
  E-CALLBACK-PROP was added for: a Lit-style callback written without
  `prop:` gets invoked and its return assigned, destroying the callback.
  Crucially, this signal does *not* fire on `count: () => n()`, the
  idiomatic reactive binding on a custom-element property, which a naive
  "function on a custom element" check would have flagged. It also catches an
  unrelated mistake for free: `id: () => "static"`, a binding that can never
  update.
- **E-CALLBACK-PROP now also fires when a binding overwrites a property that
  already held a function** — the element shipped a default renderer and the
  binding destroyed it. This covers the zero-argument callback that *does*
  read signals, which the dead-binding check cannot see. Its message is
  generalised accordingly; the arity trigger is unchanged.
- **One case is accepted as undetectable, and documented as such.** A
  zero-argument callback that reads signals, on an element with no default,
  is shaped identically to a correct binding. Contract D7 states this and a
  test pins it, so a future "fix" cannot reintroduce a heuristic that fires
  on correct code.

Verified with zero false positives across the suite and every example in the
gallery. Tests 120 → 125. All ten review findings are now resolved.

## 0.7.0 — 2026-09-04

F3 from [docs/review-2026-09.md](docs/review-2026-09.md), addressed in the
only two ways it can be. No contract change, no new API.

- **The `For` reuse loop is roughly twice as fast.** A Chrome profile of the
  reconcile phases put ~75% of every reconcile in step 1 — in all of
  update-a-field, append and move-a-row — with the key pass at 12–21% and
  placement and the LIS as noise. So step 1 is what changed. Each `Row` now
  caches the value and index last pushed into its signals: immutable updates
  hand back the *same* object for untouched rows, so an unchanged row costs
  two reference comparisons instead of two setter calls and two closure
  allocations. Rows are also claimed by stamping an epoch on a single `Map`
  rather than being moved into a second one, removing a delete, an insert and
  a `Map` allocation per reconcile. Controlled A/B at 3,000 rows: update one
  field 2.355 → 1.140 ms, move first to last 3.195 → 1.860 ms, remove middle
  2.605 → 2.180 ms, append 3.250 → 2.965 ms.
- **Windowing is documented as the real answer for large lists.** The
  complexity class is unchanged and cannot be changed — diffing an opaque
  array of N items requires looking at N items. But `For`'s cost is
  proportional to what `each()` *returns*, so slicing to the visible range
  keeps the reconcile small however large the collection is. Verified: 50,000
  records, ~23-row window, one `insertBefore` and one `children()` run per
  scroll step with 22 of 23 nodes reused. This is also the shape pagination
  and lazy-loading want. New `examples/virtual.ts` (`npm run virtual`) is the
  worked pattern — spacer sizing, overscan, filtering — and both agent guides
  now teach it where `For` is introduced.
- Worth noting that 0.6.0's minimal-move placement is what made windowing
  viable: under the previous greedy placement, every scroll step relocated
  the entire window.

Open after this release: F4 (`E-CALLBACK-PROP` zero-arity), which needs a
heuristic that cannot fire on `count: () => n()`.

## 0.6.1 — 2026-09-03

The review sweep: the three low-severity findings from
[docs/review-2026-09.md](docs/review-2026-09.md) that were never behavioural
bugs. No runtime behaviour changes except F10.

- **R10 says where a memo's error actually surfaces (F7).** It claimed a
  throwing memo "propagates the error to its reader", which is true only of a
  direct top-level read. When the reader is a queued computation, the memo is
  recomputed while that computation's dependencies are validated — *before*
  its body runs — so the error surfaces from the flush and a `try`/`catch`
  written inside the effect never sees it. Behaviour is unchanged and was
  always correct; the clause was imprecise about the one thing someone would
  use it to decide (where to put the guard). A new test pins it, so the
  clause is checkable rather than merely reworded.
- **The `tags` proxy no longer answers non-element keys (F10).**
  `typeof tags.then === "function"` made `tags` a thenable — awaiting
  anything that resolved to it would call `tags.then` as a resolver — and
  `String(tags)` threw "Cannot convert object to primitive value". `then`,
  `toString`, `valueOf`, `constructor` and `$$typeof` now forward to the
  plain proxy target. None is a valid element name (HTML has no such tag; a
  custom element must contain a hyphen), so no real usage changes.
- **Duplicate observer edges closed as won't-fix (F8), documented in
  design.md.** Reading the same signal *n* times in one computation registers
  *n* edges, exactly as Solid 1.x does. Deduplicating costs either an O(n)
  scan per read or a per-run `Set` allocation, both worse in the common case —
  and principle 1 says the inherited prior wins: a model's expectation of
  Solid's edge behaviour is correct here, and quietly diverging to "improve"
  it is the failure mode this project exists to avoid. The cost is now stated
  rather than undocumented.
- `npm run lint` runs `biome ci .` — what CI runs. `biome check` does not
  fail on formatting differences, so lint could pass locally while CI
  rejected the same tree.

Open after this release: F3 (O(N)-per-update reconcile, re-characterized) and
F4 (`E-CALLBACK-PROP` zero-arity, needs a heuristic that cannot fire on
`count: () => n()`).

## 0.6.0 — 2026-09-03

Minimal-move list reconciliation (F2 from
[docs/review-2026-09.md](docs/review-2026-09.md)), plus a correction to that
review's F3 diagnosis. Contract first, then tests, then code.

- **`For` now moves as few rows as possible (C2).** The placement step walked
  target order with a forward cursor and relocated every row that was not
  already in place, so moving one row past many relocated all of them:
  198 `insertBefore` calls to move the first of 100 rows to the end, against
  a minimum of 2 (5,998 against 2 at 3,000 rows). It now computes a longest
  increasing subsequence of retained rows' previous positions and moves only
  the rows outside it, placing target order in reverse against a trailing
  reference. New rows insert their creation-time fragment in one call rather
  than being re-derived node by node, so an append is a single DOM operation.
  Append, adjacent swap and reverse were already optimal and stay so.
- **C2 strengthened.** Its promise that "focus in unmoved rows survives" was
  circular — a row counted as unmoved if the implementation happened not to
  move it — so the greedy algorithm satisfied it while destroying focus in 98
  of 100 rows. C2 now promises that a row whose position relative to the
  other retained rows is unchanged is never re-inserted. Eleven new tests
  (G51–G61) cover it, including move-count assertions; the suite previously
  had none, which is why this was invisible.
- **F3's diagnosis was wrong and is corrected in the review, not fixed here.**
  The original measurements were taken under happy-dom, whose `nextSibling`
  is a linear `indexOf`, making the old range walk look quadratic. In Chrome
  the walk was never the dominant cost, and removing it did not measurably
  speed up append or field-update. The reconcile is still O(N) per update
  from per-row bookkeeping. F3 stays open, re-characterized.
- **New: `npm run bench`** (`examples/bench.ts`) — a real-browser benchmark
  for the reconciler. Read its deterministic insert counts; its wall-clock
  figures carry 30–40% variance and an ordering bias.

## 0.5.0 — 2026-09-03

Assertion-coverage release, from the findings in
[docs/review-2026-09.md](docs/review-2026-09.md). Contract first, then tests,
then code.

- **`mount()`'s disposer now removes everything it rendered (D9).** It
  snapshotted its own `childNodes` *before* the deferred render effects ran,
  so the snapshot held only a top-level binding's comment markers; LIFO
  cleanup then detached those markers before the binding could clear its
  range, orphaning the content. Affected every view whose top-level child was
  a live binding — `mount(el, () => Show({...}))`, a component returning
  `() => ...`, a bare accessor, an array containing a function. `For` was
  unaffected (its rows are separately owned). The cleanup is now registered
  before the view builds, so LIFO runs it last. D9 states the guarantee
  explicitly, and the regression covers all four shapes.
- **Five new error codes**, closing the gaps where the most likely
  Solid-transfer mistakes produced a raw `TypeError` or nothing at all:
  - **E-SHOW-WHEN** / **E-MATCH-WHEN** *(always)* — `when` given a value
    instead of an accessor. Solid's JSX wraps the expression; vint does not,
    so a value freezes the branch forever. The messages name the divergence.
  - **E-CHILDREN-FN** *(always)* — an already-built element where a thunk
    belongs, in `Show`/`For`/`Match` children and `Show`/`For`/`Switch`
    fallbacks.
  - **E-MOUNT-CONTAINER** *(always)* — a container that is not an `Element`
    or `ShadowRoot`. `null`, `document`, and selector strings each produced a
    raw `TypeError` or silently half-worked; `ShadowRoot` is now explicitly
    supported and covered.
  - **E-URL-SCHEME** (warn) — a `javascript:`, `vbscript:`, or non-image
    `data:` value on `href`/`src`/`action`/`poster`/`formAction`. D10 already
    told readers to validate these; only `innerHTML` was enforced. Control
    characters are stripped before matching, as browsers do, so `java\tscript:`
    does not slip past. Warn-only, both routings (`prop:`/`attr:`) checked.
- **Alignment guard extended** to the spelled-out error-code counts in
  README.md and design.md. Check 1 only proved every code was *mentioned*;
  both files had drifted to "Nineteen" against 21 defined codes.
- Bundle: ~32 kB raw / ~9 kB gzipped (was ~28/~8). README claim updated.


## 0.4.1 — 2026-09-03

- New dev warning **E-CALLBACK-PROP** (D7): a function that declares
  parameters under a non-event prop key is almost certainly a callback
  VALUE (a Lit formatter, a renderer), not a reactive binding — bindings
  are called with no arguments. The warning prescribes `prop:<key>`. This
  guards the custom-element seam: `formatter: fn` silently becoming
  "call fn() and assign the return". Credit: flagged in review by the
  author of the original prototype.

## 0.4.0 — 2026-09-02

Correctness release: every finding from a two-agent adversarial review with
executed reproductions, fixed contract-first. Twelve new regression tests.

- **Scheduler wedges eliminated (R8, R10).** `mark()` now decouples queueing
  from the state transition, so an effect skipped by E-LOOP resumes on the
  next dependency write (E-LOOP is per-flush, never a permanent silent kill),
  and a memo that throws no longer permanently detaches its observer effects —
  dependency writes re-notify them (via a new `errored` flag), and a direct
  read that recovers the memo re-runs stranded effects too.
- **Live-range reconciliation (D3).** Bindings reconcile the live contents of
  their marker range instead of a per-run snapshot — nodes a nested `For`
  inserts into the range later are no longer orphaned on the next run. A
  binding whose markers leave the DOM warns E-BIND-DETACHED (new code).
- **`createResource` (A1, A2).** A source change made between creation and the
  resource effect's first run (same root body or batch) refetches instead of
  being swallowed; disposal resets `loading` and makes `refetch()` a no-op —
  the fetcher is never called after dispose.
- **`prop:` functions (D8).** A function under a `prop:` key is assigned
  as-is — previously it was invoked as a reactive binding, making the
  contract's own `prop:online` escape hatch impossible.
- **`Show` (C1).** The narrowed-value accessor is passed on every call, so
  callbacks with default or rest parameters (`Function.length` 0) receive it
  too — no arity sniffing.
- **Reactive style diffing (D7).** Object styles diff per run: stale keys are
  removed, styles set outside the binding survive, and transitions no longer
  restart on unrelated key changes.
- **Text-node ownership (D5).** Only the text node the binding itself created
  is mutated in place; a user-created `Text` node is replaced, never hijacked.
- A `batch`/`createRoot` body error and a flush error now surface together as
  an `AggregateError` instead of the body error being silently discarded
  (R10).
- Contract: R8/R10/D3/D5/D7/D8/C1/A2 tightened to state all of the above;
  llms.txt divergence list now names the E-FOR-DUPKEY duplicate-key throw
  (Solid tolerates duplicates). README bundle size corrected.
- New: `skills/vint/SKILL.md` — a vendorable agent skill built from llms.txt.

## 0.3.0 — 2026-09-02

Hardening release driven by a three-way adversarial review (prior-fidelity,
security, best practices).

- Throwing memos retry on the next read instead of going silently stale (R10).
- Synchronously-throwing resource fetchers land in `data.error`; a falsy
  source cancels in-flight interest; the first fetch starts synchronously and
  `refetch()` returns a promise (A1–A3).
- Duplicate `For` keys are detected before any row state is touched — the
  list recovers cleanly when the data is fixed (C2).
- User effects yield to pending render effects mid-flush, so later effects
  never observe stale DOM (R7).
- `Show` supports callback children (narrowed-value accessor); `For` gains
  `fallback`.
- Eleven new prescriptive error codes covering the Solid/VanJS prior traps
  and untrusted-data hazards; contract gains the D10 untrusted-data clause.
- `on()` array dependencies flow tuple types through.
- Realm-safe node-type checks (fragments returned from bindings were
  silently unexpanded under some DOM implementations).
- Packaging: versioned banner in `dist/vint.js`, rolled-up `dist/vint.d.ts`,
  release workflow on version tags, biome, CI hardening.

## 0.2.0 — 2026-09-02

Ground-up rewrite. Contract-first: `docs/contract.md` written before the
code, the test suite derived from it, and `docs/llms.txt` shipped as a
first-class artifact. Solid-faithful three-state scheduler, ownership tree
with per-run effect scope, keyed `For` that moves real nodes, marker-anchored
bindings (null-first renders recover), Lit-friendly property-first props,
`createResource`.

## 0.1.0

An unexecuted LLM-written prototype. Deleted; its failure classes live on as
regression tests (see `docs/design.md`).

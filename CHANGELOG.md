# Changelog

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

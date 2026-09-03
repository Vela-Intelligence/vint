# Changelog

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

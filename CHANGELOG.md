# Changelog

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

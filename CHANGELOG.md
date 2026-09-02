# Changelog

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

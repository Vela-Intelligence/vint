# vint — Understanding

This document is the source of truth for what vint is and why. It is written for
the agent (or person) who works on this repo next. Read it fully before writing
any code. It records decisions already made; do not re-litigate them without the
owner, but do flag contradictions you find.

Owner: Robert (robert@salesas.com). Written 2026-09-02, after the first
prototype was assessed and deleted.

## What vint is

An **AI-native vanilla TypeScript UI framework**: real DOM, no virtual DOM, no
build step required, fine-grained signal reactivity, tag-function authoring in
the style of VanJS. It is used to build apps with the Vela design system
(`vi-*` Lit web components, see `../Vela Intelligence/vela-design-system`) and
also in apps that have nothing to do with that design system.

## Why it exists

Robert's stack is vanilla JavaScript, HTMX, and VanJS. He does not use the big
frameworks (React, Vue, Svelte, Angular) and considers them pointless in the AI
era. VanJS is closest to right but has real problems:

- It is not component-friendly.
- Its 1 kB size budget forces bad defaults — e.g. VanX lists are keyed by index
  and leave holes on delete, which breaks the moment you sort or filter.
- The good parts are scattered across extensions (VanX, etc.) instead of being
  in the core.

vint is the extension set folded into a coherent core, with the size budget
deleted, because the size budget solved a problem (human download/read cost)
that no longer matters here.

## The core realization: the user is a model

**No human will ever learn this framework. Its only user is an AI model writing
application code with it.** Robert reads the docs and the app code; he does not
hand-write framework-level code and no community will adopt it.

This kills the classic framework virtues. Tiny bundles, API elegance, DX
ergonomics, marketing docs — all optimize for a reader who does not exist. The
single metric that matters is:

> The probability that a model writes a correct app with vint on the first
> try, and can diagnose a failure on the second.

Everything below follows from that metric.

## Design principles

1. **Don't invent semantics — inherit them.** A model arrives with priors from
   billions of lines of React, Solid, Lit, and vanilla DOM. The best API is one
   where those priors are already correct. Where vint borrows from Solid it
   must match Solid's names and behavior *exactly*; where it deviates it must
   look obviously alien, never subtly different. A blend of half-matching
   idioms (the first prototype's fatal flaw) makes the model's prior a bug
   generator. No aliases — one name per concept, so generated code is
   consistent across sessions.

2. **Fail loud, instantly, and descriptively.** The expensive failure mode for
   an agent is silent staleness: the app renders and is subtly wrong. Spend
   bytes freely on dev-mode assertions and prescriptive errors that say what to
   do ("you passed a plain array to For — wrap it in an accessor"), because
   error messages function as prompts. Never accept input and quietly not
   react to it.

3. **The context artifact is part of the framework.** The deliverable is the
   library *plus* a compact skill / llms.txt (a few thousand tokens) stating
   the semantic contract and the known footguns, *plus* a zero-build test
   harness (vitest + happy-dom) — because the agent's verification loop is the
   QA department. The design system already ships AI-facing YAML catalogs;
   vint follows the same pattern.

4. **Types are the linter for the model.** Strict TypeScript that makes wrong
   usage fail to compile catches generation slips before anything runs. It is
   worth contorting the API to make misuse a type error rather than a runtime
   surprise.

5. **One way to do each thing; no cleverness budget in either direction.**
   Small API surface — every additional entry point is a branch where
   generation can go wrong. But also no golf: verbosity costs nothing when the
   writer is a model.

## Status (2026-09-02, post-rewrite)

The rewrite is done and verified. Layout: `docs/contract.md` (the semantic
contract — the source of truth for behavior; tests cite its clause numbers),
`docs/llms.txt` (the agent guide), `src/` (reactive core, DOM, control flow,
resource), `tests/` (62 cases, all green, including regressions for every
prototype bug below), `examples/` (todo + fetch, browser-verified),
`dist/vint.js` (single-file ESM for vendored/no-build apps, via `npm run
build`). Decisions finalized with Robert: signal API is the Solid tuple
(`[get, set]` — no `.val`, no aliases), no proxy store of any kind,
`createResource` included in v1.

Deferred to later iterations: a DS-style installable skill + generation
pipeline (llms.txt is hand-written for now), an `ErrorBoundary`-style
mechanism, SSR (still a non-goal), replacing the vendored `vanjs.llm.txt` in
the design-system repo with a vint equivalent.

## Design direction (decided)

- **Authoring surface: VanJS-shaped tag functions.** `tags.div(...)`, real
  elements returned, custom elements (`vi-*`) as ordinary tags with the
  settable-property-wins rule and `prop:` / `attr:` escapes. Plain function
  calls are the one syntax a model cannot get wrong without a compiler, and
  they compose directly with Lit components.
- **Reactive core: Solid's contract, implemented faithfully.** `createSignal`,
  `createMemo`, `createEffect`, `createRoot`, `onCleanup`, `untrack`, `batch`,
  keyed `For`, `Show` — Solid's names, Solid's semantics (components run once;
  effects get per-run cleanup scope; `Show` keys on boolean, not value;
  cascaded effects during a flush run, they are not dropped). Test the
  contract, not the implementation.
- **No deep proxy store (leaning decision — the one open fork).** The VanX
  style reactive proxy is where the prototype's worst bug lived and where a
  model's guesses about what is tracked are most often wrong. Explicit
  signals + memos + keyed `For` over accessors cover the same ground with
  visible reactivity. Revisit only with the owner.
- **No JSX, no SSR, no router, no design system.** Mount in the browser. Lit
  handles components; vint handles state and composition.
- **Packaging:** consumed as TypeScript source inside Vite projects (like the
  DS toolchain). Publishing to npm is a non-goal.

## History: the deleted prototype

The first version was written by Grok (chat only, never executed) and lived in
this repo until 2026-09-02; the full source is in the session transcript from
that date. An assessment found the architecture sound (dynamic dependency
tracking, ownership tree, keyed For moving real nodes, Lit-friendly binding)
but the execution broken. Keep these as regression-test material:

- Effects marked dirty during a flush were never queued and became permanently
  wedged (a `dirty` early-exit skipped them forever).
- The store proxy created field signals under string keys on read but updated
  numeric keys on array mutation, so indexed reads went stale — deletes
  rendered deleted items.
- Effects had no per-run owner scope: `onCleanup` in a re-running effect was
  silently dropped; event listeners re-attached without removal; `onMount`
  lost its owner across the microtask.
- `Show` re-ran on every value change of `when`, rebuilding its subtree and
  defeating the keyed `For` inside it.
- Arrays returned from a reactive child were unwrapped once and went inert.
- Zero tests, which is why all of the above survived.

The lesson that matters more than any single bug: it *blended* VanJS, VanX,
and Solid semantics, so nothing behaved quite like the prior it invoked.

## Process realization (bigger than this repo)

Working on this produced a principle Robert wants carried forward: **stop
writing for humans.** Docs, APIs, error messages, catalogs — when the reader
is a model, write for the model. This document is the first artifact written
under that rule. Open question parked for another day: whether the design
system itself (and its shipped skill) is still too human-focused.

## Next steps

1. A plan session (Robert will initiate) to design the rewrite.
2. First artifact of that session: a one-page **semantic contract** — the
   precise behavioral promises of the reactive core and DOM layer. The skill
   file and the test suite both derive from it.
3. Tests before implementation; the prototype's bug list above becomes the
   first regression cases.

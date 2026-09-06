# Changelog

## 0.8.1 — 2026-09-05

The findings of the final pre-use pass,
[docs/assessment-2026-09-final.md](docs/assessment-2026-09-final.md), closed
in the order it recommended, plus the three scheduler defects the repaired
property oracle then found. Every code change has a contract clause and a
regression test that fails on v0.8.0. F8 is closed too (below).

- **F5 — fully qualified distribution.** vint is not on npm and never will
  be; the npm package named `vint` is unrelated. Every `npx vint verify`
  in the README, the guides and the runner's header is gone: the vendored
  command is `node verify.mjs tests/`, the git-install command is
  `npm run verify` through a `"verify": "vint verify tests/"` script, which
  resolves the local binary only. The README and both guides say so.
- **F8 — one guide.** `skills/vint/SKILL.md` is the single source. The two
  texts had drifted by 120 lines; their union is merged into the skill and
  `docs/llms.txt` is deleted. The eval's guided condition and the alignment
  guard read the skill; the release attaches it next to the bundles (no
  release had shipped a guide before); the guard reports the guide's size
  every run and fails past 44 kB, so the next doubling is noticed. Skills
  are what harnesses load, and the frontmatter is inert when the file is
  pasted into context instead. The README's result tables keep their
  historical row label "vint + llms.txt".
- **F6, guidance.** The README and both guides carry a Content-Security-
  Policy paragraph for the vendored deployment: `script-src 'self'`
  suffices; Trusted Types are compatible except for the raw-HTML props.
- **F9 — hygiene.** The 45 eval run files that were untracked are
  committed (the README's tables cite them); `.claude/` is ignored and
  excluded from Biome, so a stale worktree can no longer break
  `npm run lint`; the stale worktree itself is gone.

- **F1 — owners run first (invariant I4, R7).** The scheduler had no rule
  that an owner pending in a flush runs before the computations it owns;
  queue order is observer-slot order, which the O(1) detach permutes, so a
  `Show` or `Switch` branch binding could read its narrowed value after
  `when` turned falsy and before the branch was disposed — a `TypeError`
  from a setter in the guide's own rule-4 shape, in about half of random
  update sequences with two bindings in the branch. `runQueue` now validates
  the topmost pending ancestor first (Solid's `runTop`), and owner scopes
  carry a `guard`: `For` names its reconcile effect for every row and
  fallback scope, so a row's bindings wait for the reconcile that may remove
  the row. Bindings that were about to be disposed no longer run at all.
- **F2 — `createSelector` outside a tracking scope (C4).** A read in an event
  handler, `untrack` or `onMount` registered a reader nothing would ever
  release (one entry per key, forever) and warned E-NO-OWNER about an
  `onCleanup` the author never wrote. It now compares directly and holds no
  state, as Solid does.
- **F3 — `E-CHILD-TYPE` (33rd code, always on).** A props object after a
  child, or a `Promise`, `Date`, `Map`, `Symbol` or class instance in a child
  position, was a raw `TypeError` from the DOM; a `Promise`, `Date` or `Map`
  as the first argument was silently read as an empty props bag. A props
  object is now a PLAIN object (D1), and anything else that is not a child
  names what it got and where props go.
- **F6 — `javascript:`/`vbscript:` URLs are never assigned (D10).** On every
  URL sink, in both bundles: the attribute is removed and dev warns
  E-URL-SCHEME. A non-image `data:` URL still warns and assigns.
- **F10 — an effect whose run threw re-runs on its next notification (R10).**
  Found by the repaired property oracle (below): an effect that read a
  signal and then threw on a memo read was later re-notified through that
  memo, which recomputed to a value equal to its last committed one; the
  equality gate (R5) skipped the effect, and its last completed run — with
  the old signal value — stood forever, with no error pending. Solid has the
  same hole. A run that threw now leaves the computation DIRTY and aborted,
  memo or effect, so the next notification re-runs it whatever the memo
  resolved to. Divergence from Solid, stated in R10 and the guides.
- **F11 — a memo rethrowing its cached error stays aborted (I3).** The CHECK
  mark that preceded a reader's re-pull had cleared `aborted`, and the
  cached-error rethrow never set it again, so a DIRTY mark later in the same
  flush found the memo "at state, not aborted" and never re-walked to the
  reader it had just failed — a stranded effect, caught by the repaired
  oracle and by a new at-rest invariant (a marked effect at rest is one
  whose run threw or was skipped by E-LOOP; anything else is stranded).
- **F12 — a cached memo error clears on a real dependency change at any
  depth (R10).** Only a direct write cleared it; an upstream memo changed by
  a same-flush cascade left the errored memo rethrowing a stale error until
  some later unrelated write. A CHECK mark on an errored memo now asks the
  next pull to validate upstream first: a source that propagated marks it
  DIRTY and it recomputes; otherwise the cached error is rethrown exactly as
  before (one failure, one error).
- **F4 — the property suite passes at any seed.** Reachability now comes
  from the edges the scheduler actually holds (`__nodes`, white-box), and
  P4 proves those equal the reads each body recorded — recorded before the
  read, since a throwing read keeps its edge. The oracle models value
  propagation with committed memo values (a memo propagates only when it
  recomputes to an unequal value; an `equals: false` memo only when it
  actually recomputes; a memo left thrown recomputes whenever it is pulled),
  computes cascade fixed points in vint's phase-and-creation order, never
  generates an effect that both throws and cascades, and exempts effects
  downstream of a cascade target — or starved by an E-LOOP skip — from the
  "never runs when unreached" clause, which R7 and R8 make legitimate. Seeds
  and length are knobs (`VINT_SEED`, `VINT_RUNS`); CI runs three seeds on
  the property and fuzz suites, and a 2,500-iteration round whenever the
  scheduler or its oracle changes.
- **F7 — the runner grows up.** `vint verify` provides `it`, `test.skip`,
  `beforeEach` and `afterEach` (scoped to their `describe`) alongside `test`
  and `describe`, reports skipped tests, and disposes every root a test
  left mounted. `vint/testing` gains `disposeAll()` (T1); `dispose` is
  idempotent.

## 0.8.0 — 2026-09-05

The rebuild proposed in
[docs/assessment-2026-09.md](docs/assessment-2026-09.md), executed in
full. Phase 0 is distribution and the DEV constant; Phase 1 is the test
harness the rebuilt runtime is held to, landed *before* the runtime
changes; Phase 2 is the reactive core and Phase 3 the DOM and control-flow
layers, rebuilt against it; Phase 3.1 is a second adversarial pass over
the result; Phase 4 is resource parity and the Solid APIs deliberately not
added; Phase 5 is the verification loop (`vint/testing`, `vint verify`);
Phase 6 is the eval's missing arms. Every finding in the assessment's §6
with a code fix is closed; every regression is a plain test.

### Phase 6 — the eval's missing arms

- **Preact with htm and Vue's runtime+compiler build** join the eval as
  conditions, with calibration arms and reference solutions: the two
  no-build baselines a harness author would actually weigh vint against.
  Both are at ceiling on the small tasks; Vue is 5/5 on the large app on
  every engine.
- **A task by another author.** The kanban board from the Phase 5
  experiment joins as task 21 with its acceptance test. vint with the
  guide, React, VanJS and Preact with htm are 5/5 on three engines and
  16–18/20 at twenty samples on the smallest; Solid and Vue miss on the
  first try for framework-specific seams (a `ref` focusing before
  insertion; a `v-for` ref that is an array) and recover on the second.
  The acceptance test had a defect the twenty-sample replication exposed —
  Enter dispatched in the same tick as the value change, invisible to
  asynchronous renderers — which had shown Preact at 0–2/5; fixed, the
  Preact arm re-run on every engine, the correction kept in the
  assessment. One guide sentence from vint's Luna misses: `key` receives
  the plain item, only `children` gets an accessor.
- **Wilson 95% intervals** next to every cell in `summary.mjs`; equal
  denominators throughout; the task list fixed and stated before results;
  `solid-js` pinned. Five Vue cells on Opus were refused on task 07 — the
  classifier hazard from the first round, recorded and excluded.
- Spend for the round: about $29 across four engines including the
  replication and re-run; the whole program to date $74.

### Phase 5 — the verification loop

Design principle 3 promised "a zero-config test harness, because an agent's
verification loop is its QA department"; the eval had one and users did
not. It ships now, as contract §T.

- **`vint/testing`** — a second entry point (vendored: `vint-testing.js`
  next to `vint.js`; package: `import … from "vint/testing"`) with twelve
  helpers a model would guess the names of: `render`, `settle`, `click`,
  `setValue`, `type`, `fire`, `pressKey`, `byText`, `visibleText`, `text`,
  `waitFor`, `captureWarnings`. `render` takes the component function and
  rejects a built element with a prescriptive error; `click` is
  synchronous — when it returns the DOM is final; `settle` is one
  macrotask, for resources; `byText` throws with a page snapshot rather
  than returning `undefined`; `captureWarnings` returns the E-codes vint
  warned, so a test can assert none fired. No `test`/`assert` exports: the
  runner provides those.
- **One runtime instance, guaranteed by the build.** A second copy of the
  scheduler would subscribe nothing and render once, silently. So
  `scripts/build-testing.mjs` builds the helpers twice with vint
  *external*, and the import specifier matches how the consumer imports
  it — `./vint.js` in the vendored file, `vint` in the package file, which
  resolves through the same exports map and conditions the app used. The
  smoke test proves it: a signal from `vint` drives a view rendered through
  `vint/testing`. Run tests in development mode (the default).
- **`vint verify`** (`bin/verify.mjs`, also copyable next to the vendored
  files): registers happy-dom, provides `test`/`describe` in vitest's
  `globals` shape so the same files run under vitest unchanged, runs every
  `*.test.mjs`, and prints PASS/FAIL per test with the app's console output
  — a failing test's report carries vint's E-* warnings, and a passing test
  that provoked one shows it as a note. Exits 1 on failure, 2 without
  happy-dom, with the install command.
- **Guides** gain "Verifying your app"; the alignment guard gains a check
  that the guides' `vint/testing exports:` line matches `src/testing.ts`
  exactly; contract clauses T1–T3.
- **The second-implementer experiment.** The guide had only ever been
  tested against models whose priors it was tuned on, with acceptance tests
  its author wrote. Two fresh implementers (Claude Sonnet 5, then Claude
  Opus 5) were each given a sandbox holding nothing but the shipped files
  — `vint.js`, `vint.d.ts`, `vint-testing.js`, `vint-testing.d.ts`,
  `verify.mjs`, `llms.txt` — and a new spec (a kanban board: async seed,
  moves with a timed badge, undo, a filter that hides without removing,
  edit-in-place with focus retention, a keyboard shortcut), with orders to
  log every moment the guide fell short rather than read the source.
  Run 1 built the board and got its seven tests green from the guide alone
  with zero vint warnings fired, and logged nine gaps — none a framework
  defect, all at the seam between vint's API and DOM the app manages
  itself: `For` identity is per array, not across groups; branches must
  build fresh DOM; `data-*` keys; `onMount` inside a branch; control-flow
  results as siblings; E-DEAD-BINDING's scope; re-inserting a node blurs
  its focused descendant; testing a bootstrap export; real timers cost
  real time. Two were about the loop itself: comparing DOM nodes with
  `node:assert` hangs on mismatch in the diff formatter, and the runner's
  buffered console hid debugging output. Every one became a sentence in
  the guide, and the runner gained `VINT_VERBOSE=1`. The spec itself had
  a defect the reference solution caught during calibration — "identity
  across column moves" is impossible for a keyed list in any framework —
  and was relaxed to identity across filtering and edits. The task joins
  the eval as `21-kanban` with its acceptance test and reference solution.
  Run 2, on Opus with the amended guide, built the board and eight tests
  green from the guide alone, again with zero warnings; none of run 1's
  nine gaps recurred, and it logged eleven new ones — the guide's own
  `docs/` and `examples/` cross-references are dead for a vendored
  reader; how to inject `deps` through `mount`; where load-then-edit
  state lives; that a string `style` replaces and `""` clears; `data-*`
  value coercion; that a `Show` body is not a tracking scope (a bare read
  is frozen and nothing warns — the one silent-staleness gap of the
  exercise); that `For` never detaches a surviving row; `waitFor`'s
  defaults; that `captureWarnings` returns codes and the messages are in
  the verbose output; nested `For` accessors — each now a sentence in the
  guide. It also asked for helpers the surface deliberately does not have
  (a double-click, focus/blur, a fake clock, `within`): the guide now says
  which existing call does each. A third run, Opus in a Claude Code
  session on a subscription rather than the API, built the board and
  eight tests green in eight minutes, 42 turns and 85k output tokens, with
  one failed suite run (its own assertion), zero framework warnings, and a
  deliberate probe of nine error codes that found every message named
  the fix on its own; its nine gaps were again new (style-object clearing,
  `item()` liveness at a stable key, batching a ready flag with copied
  data, boolean props reading back as booleans, arrays from branch thunks,
  primitives inside rows, `captureWarnings` intercepting, disposing a
  bootstrap between tests, what binding markers are) and are now in the
  guide. The method holds: three implementers, three near-disjoint gap
  lists, some thirty guide sentences, no framework defect.

### Phase 4 — surface completions, without becoming Solid-minus-JSX

The rule for this phase: where vint already uses Solid's name, behave like
Solid (principle 1); do not add Solid's API for its own sake. So
`createResource` gains Solid's behaviour and one option, `createSelector`
is added because it changes a complexity class, and `createContext`, an
error boundary, `Index` and `Portal` stay denied in the guides with their
vint idioms. The deferred items from the second review are folded in.

- **`createResource` parity (A1–A4).** Verified scenario by scenario
  against Solid 1.9.15 in the differential suite. `mutate` is the value
  setter (updater form, returns the value). A fetcher returning a plain
  value completes synchronously. `error` is written only when a load
  completes, so it stays visible while a retry is in flight. A superseded
  `refetch()` promise still resolves to its own fetch's value. Two
  `refetch()` calls in the same microtask share one fetch (the in-flight
  promise is returned — Solid returns `undefined`; `refetch(false)`
  bypasses). `refetch(info)` passes `info` through as given; only an
  omitted argument becomes `true`. Failures are normalised to an `Error`
  with `cause`. A refetch while the source is falsy cancels. Source-change
  fetches run in the render phase, before user effects, as Solid's do.
  New `options: { initialValue, name }`; with `initialValue`, `data()` is
  typed `T`. Kept as documented divergences: `data()` never throws (A3),
  `refetch()` always returns a promise, and disposal cancels — Solid leaves
  `loading` stuck and still calls the fetcher. Deliberately not added:
  `state` and `latest` (second ways of saying `loading` and `data()`),
  `storage` and the SSR options. One item struck from the assessment's
  L10: an `equals: false` source re-set to the same reference does not
  refetch in Solid either — parity, not divergence.
- **`createSelector(source, fn?)` (new C4).** Reading `isSelected(key)` in
  a computation subscribes it to that key alone; a selection change re-runs
  two rows, not N. Per-key state is created on first read and dropped with
  its last reader. `examples/virtual.ts` uses it; rule 3 of the guide
  teaches it.
- **The second review's deferred items.** A hoisted fragment (a `For`
  built outside a binding) survives a run that drops it: the nodes a
  binding stops rendering go back into the fragment they came from, so the
  `For` keeps reconciling there and is whole when it returns (D2, back to
  its original wording). `mount`'s disposer removes the live run between
  the first and last node it appended, so a region another root inserted
  between them goes too (D9). A static `value`/`selectedIndex` on a
  `select` is applied after its options exist (D6). `data:image/…` is
  exempt from E-URL-SCHEME only on an image sink — `img`/`picture`/
  `source`/`video`/`audio`/`track` `src`/`srcset`/`poster`; an SVG data
  URL on `a[href]`, `iframe[src]` or `object[data]` is a document and warns
  (D10). New **E-ATTR-NAME** (32 codes): an attribute name the platform
  would reject is skipped with a prescriptive warning instead of a raw
  DOMException — happy-dom accepts such names, browsers do not, so the
  check makes both behave the same. E-DISPOSED-OWNER's prescription now
  covers the synchronous case (an owner that disposed itself earlier in
  the same body).

### Phase 3.1 — the re-assessment's findings

A second adversarial pass over the REBUILT code (three reviewers, every
finding reproduced by execution) found what the Phase 1 harness still
missed, and this closes the ones with a code fix. The re-assessment itself
is in [docs/assessment-2026-09.md](docs/assessment-2026-09.md).

- **The scheduler stranded an effect when a memo threw and a cascade write
  in the same flush re-marked it** (three High findings, one family).
  `mark()` cleared `aborted` on the walk and then, because the effect had
  thrown this flush, declined to queue it — leaving a memo "at-state, not
  aborted" with an un-notified observer. The per-flush skip is gone: a new
  mark is a new run (R10 reworded). The duplicate report it was guarding
  against is handled where it belongs — a memo that threw rethrows its
  cached error to every further read in the flush, and the flush reports
  each error object once. A throwing read inside a recomputing memo or
  effect body now keeps its edge to the memo that threw, so the next write
  there still reaches it; a validation throw strands the effect's other
  pending memos too; a memo's cached error is cleared when its dependency
  changes in the same flush; a memo whose cleanup throws and whose value
  changes no longer leaves its observer `queued` outside the queue; a
  cleanup that disposes its own node stops the body from running; disposal
  is gated like every other entry point; the user-queue yield is a cursor,
  not a splice (O(n) instead of O(n²)); `E-WRITE-IN-MEMO` can no longer be
  bypassed with `untrack()`. The property suite gained the arm that would
  have caught all of this — throws *with* cascades — and the white-box I3
  check exempts aborted memos, whose observers may legitimately be clean.
- **DOM.** A row or fallback builder that throws no longer leaks its
  half-built scope (`createScope` disposes on throw). `null`/`undefined`
  on a number-typed property removes the attribute instead of coercing to
  `0` (`maxLength: null` no longer means "no characters"), a boolean
  property clears to `false`, and `false` on a string property clears
  rather than writing `"false"`. `attr:onclick` with a function is skipped
  without ever calling it. A re-expanded fragment must reach its recorded
  last node or expands to nothing. `onclick: null` is an ordinary "no
  handler", and the generated types allow it. E-READONLY-PROP is reported
  only for a TypeError; anything else rethrows. A data object carrying a
  numeric `nodeType` is props, not a node. Reflected-attribute aliases
  (`className` → `class`, `htmlFor` → `for`) are removed by their real
  names. D2 now says a fragment left out of a run is gone.
- **Packaging.** `files` lists the three dist artifacts, not tsc's
  per-module by-products; `release.yml` runs `check:props`; a memo born
  under a disposed owner (prod) still computes its value once.
- Suite 195 → 211 in Node, 187 → 203 per browser. Mutation score on
  `src/reactive.ts`: 76.8% (594 mutants; 75.8% on 553 after Phase 2).

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

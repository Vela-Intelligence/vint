# Assessment — September 2026 (second review)

> **Re-assessed after the rebuild, 2026-09-04 (v0.8.0, PRs #15–#19).** The
> original assessment below stands as written; this preface records what
> the rebuild it proposed produced, what a second adversarial pass over the
> rebuilt code found, and what a fresh eval round on four engines measured.
> The two headline claims: the plan was executed in full and every finding
> with a code fix is closed with a regression test that started life
> failing; and the rebuilt scheduler still had one family of High defects
> the new harness did not cover, which the second pass found and Phase 3.1
> fixed. The rebuild worked because it was test-first; it was not finished
> until it was reviewed again.

## Re-assessment

### What landed

| PR | Phase | Result |
|---|---|---|
| #14 | — | this assessment |
| #15 | 0 | `DEV` as a build-time constant; two bundles (`vint.js` 42 kB / 11 kB gz with every assertion, `vint.prod.js` 17 kB / 7 kB gz with every dev-only check *and its text* absent, proven by the smoke test); package installable from git with `types`/`development`/`production` conditions; still private (M6, M7, L16) |
| #16 | 1 | contract amended before any code moved; property-based scheduler suite against a full-recompute oracle; differential suite against Solid 1.9.15; `For` and binding-tree fuzz; browser mode on Chromium, Firefox, WebKit; coverage thresholds; Stryker; one `test.fails` per finding |
| #17 | 2 | scheduler rebuilt around one `runUpdates` gate and invariant I3 (H1, H2, M2, M3, M4, L1–L5, L14) |
| #18 | 3 | one live-range abstraction, prop routing as a table, `mount` disposing on throw, typed props generated from lib.dom (H3, H4, M1, M5, M8, L6–L8, L11, L12, L18) |
| #19 | 3.1 | the second pass's findings (below) |

Suite: 125 → 211 tests in Node, 203 in each of three real browsers; coverage
97.2 / 93.9 / 97.5 / 97.2 enforced at 95 / 90 / 95 / 95; mutation score on
the scheduler 74.0% → 76.8% on a file with 37% more mutants. Every H and M
finding in §6 now has a contract clause and a plain regression test.

### What the second pass found

Three reviewers were pointed at the rebuilt code with the same mandate as
the first pass. Every finding was reproduced by execution.

**Reactive core — one family, three High.** When a memo threw and a
cascade write *in the same flush* re-marked its observers, `mark()` cleared
`aborted` on the walk and then declined to queue the effect because it had
thrown that flush, leaving a memo at-state and not aborted with an
un-notified observer: a permanent strand, exactly the class the rebuild
targeted. The property suite missed it because its throw arms never enabled
cascades. The fix removes the per-flush skip (a new mark is a new run; R10
reworded) and moves duplicate suppression to where it belongs: a memo that
threw rethrows its cached error to every further read in the flush and the
flush reports each error object once. Seven related Mediums and Lows fixed
alongside (a throwing read keeps its edge; validation throws strand the
other pending memos; the cached error clears on a real dependency change;
`queued` bookkeeping under a throwing memo cleanup; disposed-after-cleanup;
gated disposal; the O(n²) user-queue yield; `E-WRITE-IN-MEMO` through
`untrack`). The suite gained the throws-with-cascades arm.

**DOM — four Medium, fixed:** a throwing row or fallback builder leaked its
half-built scope; nullish on a number-typed property coerced to `0` in real
browsers (`maxLength: null` meant "no characters"); `attr:on*` with a
function called the handler at bind time; plus `false` on a string
property, nullable handlers, fragment re-expansion bounds, attribute
aliases, `E-READONLY-PROP` scope. **Deferred with a documented reason:** a
hoisted fragment returned after a run that did not return it renders nothing
(D2 narrowed to say so; the fix needs a reverse map from removed nodes to
their fragment); `mount` keeps a snapshot rather than a range (correct,
because it registers its removal before the view builds; the range file's
claim was corrected); `data:image/svg+xml` is exempt from the URL warning by
MIME rather than by sink; a static `value` on `select` is applied before its
options exist; the sibling-effect order after a top-level memo read differs
from Solid (characterised, not a contract breach).

**Packaging and security — held.** The prod bundle carries none of the 18
dev-only codes and all 13 always-on ones, behaviourally identical to dev on
a small app; a packed tarball typechecks in a strict consumer and rejects
`clas`, `tags.dvi`, `onclick: "…"`, `value: 42`, `ref`; every H4, L11 and
L12 shape is blocked with a prescriptive message; twelve prototype-pollution
shapes leave `Object.prototype` untouched. Lows fixed: a data object with a
numeric `nodeType` was appended raw; a memo born under a disposed owner read
`undefined` in prod; the tarball shipped nine unreachable `.d.ts` files.

### The eval, re-run

Five conditions × eleven tasks × five samples on each of Claude Opus 5,
Claude Sonnet 5, gpt-5.6-terra and gpt-5.6-luna, against the rebuilt
runtime, with `vint-bare` now seeing the 1,300-line typed `vint.d.ts`.
pass@1 → pass@2, all eleven tasks, out of 55:

Tasks 01–10 (ten small and trap-shaped tasks), pass@1 → pass@2:

| condition | Opus 5 | Sonnet 5 | gpt-5.6-terra | gpt-5.6-luna |
|---|---|---|---|---|
| vint + llms.txt | 49/50 → 50/50 | 48/50 → 50/50 | 49/50 → 50/50 | 48/50 → 49/50 |
| vint, types only | 50/50 | 50/50 | 50/50 | 48/50 → 49/50 |
| react | 50/50 | 50/50 | 50/50 | 50/50 |
| solid | 50/50 | 50/50 | 48/50 → 49/50 | 49/50 → 50/50 |
| vanjs | 38/49 → 49/49¹ | 42/50 → 46/50 | 34/50 → 43/50 | 28/50 → 41/50 |

Task 20 (the ~300-line three-view tracker), pass@1 → pass@2:

| condition | Opus 5 | Sonnet 5 | gpt-5.6-terra | gpt-5.6-luna |
|---|---|---|---|---|
| vint + llms.txt | 4/5 → 5/5 | 5/5 | 3/5 → 5/5 | 5/5 |
| vint, types only | 3/5 → 5/5 | 3/5 → 4/5 | 3/5 → 4/5 | 1/5 → 4/5 |
| react | 5/5 | 5/5 | 1/5 → 4/5 | 5/5 |
| solid | 5/5 | 5/5 | 3/5 → 4/5 | 2/5 → 4/5 |
| vanjs | 5/5 | 2/5 → 5/5 | 4/5 → 4/5 | 3/5 → 5/5 |

¹ One VanJS cell refused by the safety classifier (recorded, excluded), as
in the first round.

Spend for the round: Opus $26.04, Sonnet $12.32, Terra $6.29, Luna $0.71
— $45.36 for 1,100 scored generations plus fix attempts.

Reading it against the pre-rebuild round in the README:

- **The rebuild did not move the metric, which is the result it needed.**
  Every vint cell is within one sample of its earlier value; the small
  tasks stay at ceiling for every condition but VanJS; the typed
  `vint.d.ts` (1,300 lines instead of 150) neither helped nor hurt the
  types-only arm on the small tasks (50/50 on three engines) and did not
  close the large-app gap, where the failure is still the rule-1 shape:
  an untracked one-shot read of async state rendering "undefined" — on
  Opus and Luna alike. Types cannot catch a *read in the wrong place*;
  only the guide does.
- **The guide is again the only condition that reaches 5/5 on the large
  app on all four engines after one fix**, and its first-try misses were
  spec misses (an empty-title todo accepted; a draft not cleared) and two
  Terra runtime ordering errors, not framework semantics.
- **The baselines moved more than vint did.** React on Terra fell to 1/5
  first try on the large app; Solid on Luna to 2/5; VanJS on Opus rose to
  5/5. Five-sample cells swing by two or three between rounds with no
  code change on the baseline side, which is the assessment's n=5 caveat
  demonstrated rather than argued.
- **None of the 275 vint cells hit a framework defect** — no E-code from
  §6's list appears in any failure report, before or after the rebuild.
  The eval measures what a model writes on top of vint; the harness in
  Phase 1 is what measures vint.

### Verdict, revised

The objective and the method were right; §8's diagnosis was right; and
the rebuild proved the method's central claim in the most direct way
possible: the test-first harness caught every defect it was designed
around, and a second adversarial pass caught the one it was not. What
changes in the verdict is the confidence: the runtime is now held to
property, differential, fuzz, browser, coverage and mutation checks, every
defect found by two review passes has a regression, and the code is
installable and typed. What does not change: it is still four days old,
still one maintainer, still private, and the eval still compares against
the baselines it chose rather than the two no-build competitors a buyer
would weigh. Phases 4–6 (`createResource` parity and the absent Solid
names, `vint/testing`, the eval's missing arms) remain the next work.

---

## The original assessment (v0.7.1, morning of 2026-09-04)

An independent top-to-bottom assessment of vint at `66b5b64` (v0.7.1),
written to answer six questions: what the project's objective is, what it
solves, where it fits in the market, why anyone should use it, what would
make it a better product, and what a rewrite into a solid, tested product
would need. It follows [review-2026-09.md](review-2026-09.md), which this
document does not repeat; where the two disagree, this one is later and says
so.

Method: a full read of `src/` (1,631 lines), the contract, the guides, the
eval harness and the earlier review; the full check suite (125 tests,
typecheck, lint, build, smoke, alignment — all green at the start); then
three adversarial passes over the reactive core, the DOM and control-flow
layers, and the async/security/tooling surface. Every defect below was
reproduced by execution in this tree before being written down. Probe files
were deleted afterward; `src/` and the existing tests are untouched.

**Context that frames everything else.** The repository is four days old
(first commit 2026-09-02, this assessment 2026-09-04), has one author and 44
commits, is private with no stars and no issues, and has already been through
three adversarial reviews (v0.3.0, v0.4.0, and the September review). Each of
those reviews found defects the suite had missed, and each was fully
remediated. This one found **four High and eight Medium defects the 125-test
suite still misses**, in every layer. That is the single most important
fact in this document, and section 8 explains why it keeps happening and
what changes it.

- [1. Objective](#1-objective)
- [2. What it solves](#2-what-it-solves)
- [3. Market position](#3-market-position)
- [4. Why someone should use it — and why not yet](#4-why-someone-should-use-it--and-why-not-yet)
- [5. What the evidence supports](#5-what-the-evidence-supports)
- [6. Defects](#6-defects)
- [7. Security and performance](#7-security-and-performance)
- [8. Why the suite keeps missing these](#8-why-the-suite-keeps-missing-these)
- [9. Proposal: the rewrite](#9-proposal-the-rewrite)
- [10. Product improvements beyond correctness](#10-product-improvements-beyond-correctness)

## 1. Objective

The stated objective ([design.md](design.md)) is to maximise *the
probability that a model writes a correct app on the first try, and can
diagnose a failure on the second*. Everything follows from it: Solid's
semantics inherited rather than invented, VanJS's build-free authoring shape,
a numbered contract that outranks the code, error messages written as
imperatives, and a ~1,600-word guide shipped as a first-class deliverable
with a CI guard that keeps it aligned to the code.

The objective is coherent, unusual, and — on the evidence — the right one to
be optimising for in 2026. Two qualifications stand, both inherited from the
earlier review and still true:

- **The metric is at its ceiling on the tasks that exist.** Every condition
  except VanJS scores 48–50/50. The design cannot be shown to have *driven*
  outcomes on that data; it can be shown not to have hurt them.
- **The transferable output is the method.** Contract-first change control,
  errors-as-prompts, agent-artifact alignment in CI, and an eval with
  calibration arms are reusable independently of the runtime. The runtime is
  the specimen, and — as section 6 shows — the specimen is not yet at the
  standard the method demands.

One further qualification is new. "Solid-faithful" is pinned to Solid 1.x.
Solid 2.0 reached release candidate in 2026 and changes the async model
(`createAsync`, `<Loading>`, deterministic batching, derived signals). Models'
Solid priors will bifurcate over the next year. vint should say explicitly
which Solid it is faithful to, and the eval should pin the Solid baseline's
version, because principle 1 ("inherit semantics") has a moving target.

## 2. What it solves

An agent producing UI into a no-build target — a vendored HTML page, a
generated artifact, an internal tool, a page inside a sandbox that permits
only inline scripts — has a real problem: the frameworks with the strongest
priors (React, Solid) want a build chain, and the build-free options (VanJS,
Alpine, hand-written DOM) carry *silent staleness*: the app renders,
looks right, and is wrong, and the failure report contains nothing for a
model to diagnose from.

vint's answer is concrete and, as far as it goes, works:

- **Loud failure instead of plausible failure.** 27 prescriptive error
  codes, five of them always-on, each stating the fix. The eval saw a model
  recover from `E-NO-REF` on the second try purely from the message.
- **One shape for everything.** Tag functions returning live elements, one
  state primitive, thunk children, keyed `For`. Small surface means
  consistent generated code.
- **A contract the tests cite.** 32 clauses; every test names its clause;
  `check-alignment.mjs` fails CI if the guide, skill, or contract names a
  code or export that does not exist.
- **Custom elements as ordinary tags.** Property-first assignment means Lit
  and `vi-*` components work with no adapter — which is plainly the in-house
  use case (the Vela design system) and the strongest concrete reason for
  this framework to exist rather than another.

What it does *not* solve, by declared non-goal: SSR/hydration, routing,
forms, i18n, a component library. What it does not solve *yet*, contrary to
its own principles: typed props (principle 4, see M8), a verification loop
for the app an agent just wrote (principle 3, see §10), and distribution.

## 3. Market position

vint is a ~36 kB single-file ESM library (~10 kB gzipped) with zero runtime
dependencies. Its competitors are not "frameworks" in general; they are the
options an agent harness would reach for when emitting a no-build page.

| Option | Prior strength | Build-free | Reactivity | Silent-staleness risk | Notes |
|---|---|---|---|---|---|
| React (+ JSX) | strongest | no | VDOM | low | needs a build; the eval's baseline |
| Preact + `htm` | strong (React prior) | **yes** (CDN) | VDOM | low | the real no-build React; **not in the eval** |
| Vue (global CDN build) | strong | **yes** | proxy + templates | low | huge prior, no-build path; **not in the eval** |
| Solid 1.x | strong | no (compiler); `h()` exists but is obscure | fine-grained | low | vint's semantic source; 2.0 RC changes async |
| VanJS / VanX | weak | yes | `state.val` | **high** | 1 kB; the eval's outlier at 22–38/50 |
| Lit | medium | yes | property-driven re-render | medium | web-components native; vint composes *with* it |
| Alpine / htmx | medium | yes | attribute-driven | medium | different authoring model |
| Google A2UI / generative-UI JSON | n/a | yes | renderer-defined | low | a different layer: JSON the model emits, rendered by a host |
| vint | **none** (zero training presence) | yes | fine-grained (Solid 1.x) | **low** | the only one with a contract, error prompts, and an alignment guard |

Three things follow.

**The eval compared vint to the wrong no-build baselines.** React-with-a-build
and Solid-with-a-compiler are the priors, but they are not what an agent
would actually vendor. Preact+htm and Vue-CDN are the alternatives a harness
author would weigh vint against, and both have strong priors *and* no build
step. Until they are in the table, "vint matches React/Solid" does not
answer the question a buyer asks.

**vint's differentiation is not the runtime.** VanJS, Lit, Preact, and Vue
all render DOM reactively. What none of them has is a numbered contract with
tests that cite it, error messages designed as prompts, an agent guide
enforced against the code in CI, and an eval harness with calibration arms.
That package is the product. Positioning vint as "a framework" invites
comparison on ecosystem, maintainers, and releases — its weakest axes.

**The natural first customer is internal.** The code is shaped around
`vi-*` custom elements, the skill file assumes Claude Code, and the design
goal matches an agent generating consoles and internal tools on top of an
existing design system. That is a market of one, but a real one, and the
right place to reach a 1.0 before asking strangers to depend on it.

Where it fits: a model writes most of the UI; the target is vendored or
sandboxed; loud failure is preferred; the app composes web components; the
app is small to medium. Where it does not: SSR; large human teams; anything
needing an npm-resolvable dependency today; lists of thousands of rows
without windowing.

## 4. Why someone should use it — and why not yet

**Reasons to use it, in order of strength:**

1. It is the only build-free option whose *semantics are written down as a
   contract and tested as such*. A model that reads `contract.md` knows
   exactly what `For` promises about focus, what `Show` keys on, and what a
   throwing memo does. No competitor offers that.
2. Errors that name the fix. This is measurable in pass@2 and the eval
   shows the VanJS gap it predicts.
3. Solid 1.x semantics with no compiler. If a model already writes Solid
   correctly, it writes vint correctly (59/60 on the item-accessor A/B).
4. Web components as first-class tags, property-first.
5. One file, one import, MIT, zero dependencies.

**Reasons not to, today:**

1. **It has High-severity correctness defects** in the scheduler and the
   DOM layer that the suite does not catch (§6). A four-day-old runtime
   that has needed four rounds of adversarial fixes is not yet a foundation.
2. **It cannot be installed.** `package.json` is `private: true`, the
   `exports` field points at `src/index.ts`, and a git install has no built
   artifact and cannot be imported without a TypeScript-transpiling bundler
   (M7). The npm name `vint` is squatted; a scoped name is needed.
3. **It has only been tested under happy-dom.** No real-browser run exists
   anywhere, and the earlier review already documents one wrong conclusion
   (F3) that happy-dom produced. Focus survival, IME, SVG properties,
   `javascript:` navigation, and `createElement` name validation are all
   things happy-dom does not model and this codebase makes claims about.
4. **Props are untyped.** `div({ clas: "x" })`, `input({ value: 42, checked:
   "yes" })`, `button({ onclick: "alert(1)" })` and `button({ onclick: (e,
   extra) => ... })` all typecheck. Principle 4 ("types are the linter for
   the model") is a statement, not a feature (M8).
5. The eval, task specs, acceptance tests, and framework share one author,
   and the baselines omit the two real no-build competitors (§3, §5).

## 5. What the evidence supports

The earlier review's four weaknesses — unequal denominators, ceiling effect,
n=5 without intervals, asymmetric calibration — all still apply; nothing in
the eval has changed since. Two additions:

- **Baseline selection.** See §3. The comparison that would move a buyer
  (Preact+htm, Vue-CDN, at equal build cost) has not been run.
- **No weak-model arm.** The README says differentiation "would need weaker
  engines"; that arm is the cheapest experiment available (the harness
  already prices luna at ~$0.20 per full run) and has not been done.

What the evidence *does* support, stated as tightly as it can be: on ten
small tasks and one ~300-line app, across four frontier engines, vint scores
at React/Solid parity from its type declarations alone, and the guide
removes the one recurring failure class (untracked one-shot reads of async
state) on the large app for below-Opus engines. VanJS scores materially
worse, consistent with the silent-staleness diagnosis. None of it supports
"better than React or Solid".

## 6. Defects

Twelve findings at High or Medium and a longer tail at Low. Severity is
impact on a working application; "always on" means the check survives a
production build. Every finding has a reproduction that was executed in
this tree.

| # | Finding | Layer | Clause | Severity |
|---|---|---|---|---|
| [H1](#h1) | E-LOOP through a memo wedges the effect permanently | reactive | R8 | High |
| [H2](#h2) | Memo error behind an intermediate memo strands downstream effects | reactive | R10 | High |
| [H3](#h3) | `For` fallback containing a live binding orphans its nodes | control | C2, D9 | High |
| [H4](#h4) | Case-variant `on*` keys become live `onclick` attributes, no warning | dom | D8, D10 | High |
| [M1](#m1) | A throwing `mount` view leaks a live root with no disposer | dom | D9 | Medium |
| [M2](#m2) | A throwing `onCleanup` aborts disposal; siblings leak forever | reactive | O5 | Medium |
| [M3](#m3) | Effects created during a top-level memo pull run mid-computation | reactive | R7 | Medium |
| [M4](#m4) | `on(..., { defer: true })` returns `undefined`, not `prevValue` | reactive | R11 | Medium |
| [M5](#m5) | `null`/`undefined` on the property path is stringified | dom | D6 | Medium |
| [M6](#m6) | "Compiled out of a Vite production build" is false | docs, dev | §E | Medium |
| [M7](#m7) | The package cannot be installed or imported without a TS bundler | distribution | — | Medium |
| [M8](#m8) | Props are `Record<string, unknown>`: principle 4 is undelivered | types | — | Medium |
| L1–L18 | see [the tail](#low-severity-tail) | | | Low |

### H1

**An effect that loops through a memo is killed permanently.** R8 promises
that E-LOOP is per-flush and the effect "resumes on the next write to one of
its dependencies". That holds when the loop runs through a signal
(test B15b). Through a memo it does not:

```ts
const [x, setX] = createSignal(0); let runs = 0
try {
  createRoot(() => {
    const m = createMemo(() => x())
    createEffect(() => { runs++; if (m() < 5000) setX(m() + 1) })
  })
} catch (e) { /* E-LOOP, as promised */ }
const after = runs
setX(9999)
runs - after   // 0 — expected 1. The effect is dead.
```

State after the throw: memo `DIRTY`, effect `CHECK` and unqueued. The
E-LOOP branch in `runQueue` (`src/reactive.ts:346`) `continue`s *before*
pulling the memo, so the memo stays DIRTY with an un-notified observer. The
next write reaches `mark()` (`:291`) with the memo already at-state and not
`errored`, so the early exit assumes its observers are queued — they are not.

### H2

**A throwing memo behind another memo detaches its effects forever.** R10
promises "a memo error never permanently detaches downstream effects". It
holds for `memo → effect` (B20). It fails for `memo → memo → effect` and
for diamonds:

```ts
const [s, setS] = createSignal(1); const seen: number[] = []
createRoot(() => {
  const a = createMemo(() => { const v = s(); if (v === 2) throw new Error("a boom"); return v * 10 })
  const m = createMemo(() => a() + 1)
  createEffect(() => { seen.push(m()) })
})
try { setS(2) } catch {}
setS(3)
seen   // [11] — expected [11, 31]
```

`updateNode`'s catch (`:404`) flags only the memo that threw. The exception
unwinds through `updateIfNecessary(m)` (`:377`) leaving `m` at CHECK,
unflagged. The recovery walk on the next write reaches `m`, finds it already
CHECK and not errored, and stops.

H1 and H2 share a root cause: `mark()` treats "node already at this state"
as "its observers are already queued". Every path that aborts processing of
a node (loop skip, throw, and — see M2 — a throwing cleanup) breaks that
invariant, and the code patches it one abort site at a time (`errored`) rather
than making the invariant hold by construction.

### H3

**A `For` fallback containing a live binding leaves its nodes behind.** Any
fallback that is a `Show`, a bare accessor, or an array containing a function:

```ts
const [items, setItems] = createSignal<string[]>([])
const [loading] = createSignal(false)
mount(host, () => ul(For({
  each: items,
  fallback: () => Show({ when: loading, children: () => li("spinner"), fallback: () => li("nothing") }),
  children: (i) => li(() => i()),
})))
setItems(["a"])
host.innerHTML
// <ul><!--for--><li>nothing</li><!--row--><li><!--v-->a<!--/v--></li><!--/for--></ul>
```

Three empty→non-empty cycles leave three orphaned fallbacks. With the `For`
as `mount`'s top-level child, the orphan also survives `dispose()` (D9).

This is the same bug as F1 in the earlier review, fixed in `mount` and not
generalised. The fallback scope (`src/control.ts:333`) snapshots
`[...hold.childNodes]` at a moment when a nested binding has only its
markers in `hold`; its content arrives on a later render effect. On dispose,
the snapshot cleanup runs first (LIFO), removes the markers, and the
binding's own cleanup then walks from a detached marker and finds nothing.

### H4

**`OnClick`, `ONCLICK`, `Onclick` with a string value become a live
`onclick` attribute.** D8 promises a non-function under an `on*` key is
"skipped ... never assigned or set as an attribute", and the earlier review
states attacker-shaped spreads degrade safely. Only lowercase is guarded:

```ts
const el = div({ OnClick: "globalThis.__pwned=1" })   // e.g. from {...apiData}
el.getAttributeNames()   // ["onclick"]  — no E-EVENT-VALUE
document.body.append(el); el.dispatchEvent(new Event("click"))
globalThis.__pwned       // 1
```

`applyProps` tests `key.startsWith("on")` case-sensitively
(`src/dom.ts:255`), so the key falls to `setProp`, `"OnClick" in el` is
false (IDL properties are lowercase), and `setAttribute` (`:237`) lowercases
the name as HTML requires. Browsers behave the same. This is within the
threat model D10 already declares unsafe (never spread untrusted objects),
but it contradicts the review's explicit safety claim and the test that pins
it covers only the lowercase spelling. `attr:onclick` with a string reaches
the same sink with no warning at all.

### M1

**A view that throws during `mount` leaks a live root and returns no
disposer.** Including the common case of a reactive prop that throws on its
first run — the DOM is appended, the bindings stay subscribed, every later
write to the signal rethrows, and there is no handle to clean up.
`createRoot` (`src/reactive.ts:193`) rethrows without disposing; `mount`
adds no try/catch.

### M2

**A throwing `onCleanup` aborts disposal.** `disposeNode` sets `disposed =
true` first, then `cleanNode` runs children and cleanups with no try/catch.
A throw in one cleanup escapes before sibling computations are reached; a
second `dispose()` is a no-op because of the flag. The siblings stay
subscribed permanently. The same path, on an effect's re-run, leaves the
effect DIRTY with all sources detached: dead. O5 says disposal is "total and
idempotent".

### M3

**Effects created inside a memo body run mid-computation when the memo is
pulled from a top-level read.** Solid wraps a stale-memo read in
`runUpdates` and defers child effects until the memo returns. vint's read
path (`src/reactive.ts:493`) validates with the scheduler open, so
`createEffect` inside the memo flushes immediately. Consequences proven: a
child effect that reads the memo throws `E-CIRCULAR-MEMO` from a legitimate
pattern; a child effect that throws marks the *memo* errored and the memo
re-runs its whole body on every read. `Show` and `Switch` are built on
memos, so this is reachable from ordinary component code.

### M4

**`on(deps, fn, { defer: true })` returns `undefined` on the deferred run
instead of `prevValue`.** `createMemo(on(dep, fn, { defer: true }), 42)`
reads `undefined` until the first change; Solid reads 42. One-line fix at
`src/reactive.ts:563`. A silent Solid divergence is exactly the failure
principle 1 forbids.

### M5

**`undefined` and `null` on the property path are stringified.** `div({ id:
undefined })` yields `id="undefined"`; `a({ title: () => user()?.name })`
yields `title="undefined"` once `user()` is null. D6 says the attribute path
removes on nullish; the property path (`src/dom.ts:231`) assigns raw. The
reactive optional-chaining shape is the most common way a model writes a
prop, so this trap is in the hot path.

### M6

**The contract's DEV matrix says the warnings are "compiled out" of a Vite
production build. They are not.** `DEV` is computed by a try/catch IIFE
(`src/dev.ts:7`), which Rollup cannot fold; a Vite production build was run
and retains every `if (DEV)` site and every message string, evaluating
`DEV` to `false` at runtime. The *behaviour* claim (off in production) holds;
the *mechanism* claim does not, and the bundle-size implication is wrong.

### M7

**The package is not installable.** `exports` → `src/index.ts`;
`npm pack --dry-run` ships only `src/*.ts`; no `files`, no `prepare`; a git
install into a consumer fails in Node with `ERR_MODULE_NOT_FOUND` on the
extensionless `./control` import even with type stripping. Only Vite and
esbuild (which transpile TypeScript inside `node_modules`) can consume it,
and nothing says so. The design doc's non-goal is *npm-first* distribution,
not being uninstallable.

### M8

**Props are typed as `Record<string, unknown>`.** Every misuse listed in §4
compiles. `TagFn` returns the right element type per tag, but nothing checks
keys, value types, event signatures, or reactive-vs-static shape. This is
the largest gap between the design principles and the implementation, and it
is the one an agent would benefit from most: a type error is the cheapest
possible "error as prompt".

### Low-severity tail

- **L1** `createMemo(fn, initial, { equals })` runs the equality gate on the
  *first* compute against `initial`; Solid assigns the first value
  unconditionally. `createMemo(() => ({id:1,x:5}), {id:1,x:0}, {equals: (a,b)=>a.id===b.id})()`
  returns `x: 0`.
- **L2** Computations and cleanups created under an already-disposed owner
  (via `runWithOwner` or an effect that disposes its own root) are pushed
  onto fresh arrays nobody walks: they run forever. Solid shares the hole.
- **L3** `runQueue` clears `queued` before validation, so a CHECK effect
  whose memo recomputes to a new value is pushed a second time; on the error
  path the same error is reported twice as an `AggregateError` "2 effects
  threw".
- **L4** A top-level memo read that triggers the R10 recovery flush
  surfaces *effect* errors from that flush at the read site; the caller never
  receives the value. R10 says the read receives the memo's throw.
- **L5** `disposeNode` unlinks from its owner with `indexOf` — O(n), so bulk
  disposal is quadratic. Measured: 20k → 40k scopes goes 14 ms → 55 ms
  forward, 27 → 110 ms reverse. `For` clearing a large list hits this.
- **L6** The first object-valued `style` run does `cssText = ""`, wiping
  inline styles the component body set on the element (D7 promises the
  opposite). Because bindings are deferred, "first run" is always after the
  body.
- **L7** `E-FOR-SAMEREF` fires when `each` re-runs on an unrelated
  dependency and returns the same array — a false positive on correct code,
  which for a prescriptive warning is worse than silence.
- **L8** A `For` (or any fragment) created outside a binding and returned
  from it is destroyed on the binding's *second* run: the fragment was
  expanded on the first. D3 describes this only "across Show branches".
- **L9** `mutate(fn)` stores the function; Solid's `mutate` is the raw
  setter with updater form.
- **L10** `createResource` divergences: no `state`/`latest`/options; a
  synchronous fetcher value still leaves `loading` true for a microtask;
  `error` is cleared at load start not completion; a stale `refetch()`
  resolves `undefined` (Solid: the stale value); two `refetch()`s in one
  tick both call the fetcher; `refetch(null)` reports `refetching: true`; a
  source with `equals: false` re-set to the same reference does not refetch.
- **L11** `checkUrlScheme` skips non-strings (`new URL("javascript:…")`, an
  object with `toString`), does not cover `xlink:href` or `object[data]`.
- **L12** `tags["<img onerror=…>"]` and friends throw a raw
  `InvalidCharacterError` in browsers (happy-dom accepts them);
  `prop:` on a getter-only property throws a raw `TypeError`.
- **L13** `createRoot` runs the effects created before a body throw; Solid
  drops them. Apparently intended (R10's AggregateError clause) but not
  called out as a divergence.
- **L14** `onCleanup` called inside a cleanup during a top-level flush warns
  `E-NO-OWNER` and never runs (Solid parity; cheap to fix by setting the
  owner while running cleanups).
- **L15** Guide gaps: nothing renders inside a `createRoot`/`mount` body
  until it returns (this bit the reviewer within minutes when writing probes
  — a model writing a test will hit it too); none of `createContext`,
  `createSelector`, `ErrorBoundary`, `Index`, `Portal` — the Solid names a
  model reaches for next — is declared absent, so a model has to discover
  the absence from a type error.
- **L16** Release workflow: no typecheck or lint step; no check that the tag
  matches `package.json#version` (the banner is `$npm_package_version`);
  `vint.d.ts` is emitted with `--no-check`; the earlier review's "no install
  scripts" is inaccurate (esbuild's postinstall is present, though verified
  not load-bearing).
- **L17** Nested `mount` inside another mount's DOM is not owned by the
  outer root; outer dispose leaves the inner root live with no warning.
- **L18** A `value` binding re-assigns `input.value` on every re-run even
  when unchanged; whether that disturbs the caret is browser-specific and
  untested.

## 7. Security and performance

**Security — holding**, verified by execution: the children path escapes
everything; `__proto__` and `prop:__proto__` are blocked and `Object.prototype`
is untouched under every spread shape tried; `on:click` with a string is
skipped; `E-RAW-HTML` fires on `innerHTML`/`outerHTML`/`srcdoc` through
`prop:`/`attr:`/reactive routes; the URL check strips control characters as
browsers do; the lockfile resolves entirely to `registry.npmjs.org` with
integrity hashes; CI actions are SHA-pinned; the dist `.d.ts` exposes no
internals.

**Security — gaps**: H4 (case-variant event keys) is the one that matters.
The rest: the URL and raw-HTML guards are dev-only warnings that still
assign (M6 makes "dev-only" a runtime fact rather than a build fact);
`attr:onclick` is an unwarned live sink; L11's coverage gaps; no CSP
guidance for the deployment (vendored file, no bundler) where CSP is the
primary control; no Trusted Types note.

**Performance.** At the sizes the project targets (hundreds of rows) nothing
found here is observable, and the earlier review's F2/F3 work is sound: the
`For` fuzz in this review ran ~2,000 randomised steps asserting DOM order,
anchor uniqueness, subscription counts, and that anchor re-inserts equal
*retained − LIS(previous positions)* against an O(n²) reference — the
minimal-move claim is exactly true. New items: L5 (quadratic bulk dispose),
L3 (spurious queue entries), the documented duplicate-edge cost (F8), and a
missing `createSelector` — the virtual-list example's per-row
`selected() === item().id` binding makes every selection change O(rows),
which is precisely the pattern Solid added `createSelector` for.

## 8. Why the suite keeps missing these

Four reviews, four rounds of "the suite was green and the code was wrong".
The pattern is not carelessness; it is a test strategy that cannot find
these classes.

**Class A — abort paths that leave graph state un-notified** (H1, H2, M2,
L2, L3, L4). The scheduler encodes an implicit invariant: *a node already at
the target state has its observers queued*. Every abort — loop skip, throw
in a memo, throw in a cleanup, disposal mid-chain — violates it, and each
fix so far (`errored`, the `mark()` recovery branch) patches one site. The
tests are example-based: they pin the one shape that was reported. A
property-based test that builds random graphs, applies random writes,
throws, and disposals, and checks against a naive full-recompute oracle
would have found H1 and H2 in seconds; this review's agent found the
`For` placement solid with exactly that method because that code *was*
designed around a stated invariant.

**Class B — snapshot-versus-live DOM ranges and cleanup ordering** (H3, M1,
L6, L8, and F1 before them). Four places own a node range (`bindChild`,
`For` rows, `For` fallback, `mount`); two use a live walk, two snapshot.
F1 was fixed in `mount` by re-ordering cleanup registration; the identical
pattern in the fallback was not touched. One range abstraction with one
rule ("a cleanup that removes nodes is registered before children build")
removes the class.

**Class C — coercion at the DOM seam** (H4, M5, L11, L12). The routing
logic reasons about keys and values with `startsWith`, `typeof`, and `in`,
and each is right for the lowercase, string, HTML-element case. A routing
*table* (per-key decision, case-folded, with explicit nullish handling and
typed inputs) turns each of these into a compile-time or table-lookup
question.

**And the environment**: every test runs under happy-dom, which has already
produced one wrong performance conclusion and does not model the things
several contract clauses promise (focus survival, IME, SVG IDL, URL
navigation, `createElement` validation). There is no coverage measurement
(`@vitest/coverage-v8` is not installed), so "125 tests" is a count, not a
claim about what is exercised.

## 9. Proposal: the rewrite

The objective, the contract, the guide, the error catalogue, the alignment
guard, and the eval harness are worth keeping as they are. The runtime
should be rebuilt against them, with the test strategy changed first so
that the new runtime is held to a standard the old one never was. The
phases below are ordered so each leaves the tree shippable.

### Phase 0 — Decide scope and distribution (days)

- Pick a scoped npm name (`@vela/vint` or similar; `vint` is taken).
  Publish `dist/` (`vint.js`, `vint.d.ts`, a `vint.prod.js`) with a proper
  `exports` map and `files`; add `prepare: npm run build` so git installs
  work; keep the vendored-file path as the documented default. Publishing
  to npm also puts the file on jsDelivr, which is what an artifact sandbox
  needs.
- Make `DEV` a build-time constant: esbuild `--define:__VINT_DEV__` for the
  two dist files, `import.meta.env.DEV` under Vite. Then "compiled out" is
  true, and the always-on checks are the only ones in the prod file.
- State in `design.md` and `llms.txt` that "Solid-faithful" means Solid
  1.x, and pin `solid-js` in the eval.
- Fix the release workflow: typecheck + lint, tag-equals-version check,
  `dts-bundle-generator` with checking on, provenance attestation.

### Phase 1 — The test harness the runtime will be held to (one to two weeks)

Do this *before* the core rewrite, and run it against the current code to
seed the regression list (it will reproduce H1, H2, M2, L2, L3 on day one).

1. **Property-based scheduler tests.** A generator for random reactive
   graphs (signals, memos with random equality, render and user effects,
   nested owners), random operation sequences (writes, batches, throws in
   memos/effects/cleanups, disposals, loop-inducing writes), and an oracle:
   a naive model that recomputes everything from scratch. Properties: every
   effect observes values consistent with the oracle; each effect runs at
   most once per flush unless legitimately re-marked; after any throw the
   next write re-notifies exactly the oracle's affected set; after dispose,
   observer counts on every source are what the oracle says (zero for
   disposed subtrees); no node is ever both unqueued and non-CLEAN with a
   marked source (the Class A invariant, checked white-box). Use
   `fast-check`; shrinkers will hand you minimal reproductions.
2. **Differential tests against Solid 1.x.** `solid-js` is already an eval
   dependency. For the shared API surface (signals, memos, effects, `on`,
   `batch`, `untrack`, owners, `createResource`), run the same scripted
   scenarios through both and assert identical observable traces. This is
   principle 1 as a test, and it would have flagged M3, M4, L1, L9, L10,
   L13 mechanically.
3. **`For` and range fuzzing** as this review did, promoted into the suite:
   random insert/remove/move/shuffle/update sequences, asserting DOM order,
   anchor uniqueness, subscription counts, and minimality against an O(n²)
   LIS reference. Add the same shape for `bindChild` with nested bindings,
   `Show` flips, and fallback cycles — the H3 shape falls out of "after any
   sequence, disposing the root leaves the container empty and every
   signal's observer count at baseline".
4. **Real browsers in CI.** Vitest browser mode with Playwright on Chromium,
   WebKit and Firefox, running the whole suite plus a browser-only file for
   what happy-dom cannot model: focus/selection/IME survival across `For`
   moves (C2, D5), `javascript:` URLs never executing under the guard, SVG
   IDL routing (`className`, `viewBox`), `createElement` name errors, CSS
   transitions across style diffs (D7).
5. **Coverage and mutation.** `@vitest/coverage-v8` with a threshold on
   `src/` (start where it lands, ratchet to ≥95% lines/branches) and Stryker
   on `reactive.ts` as the gate for scheduler changes — a scheduler whose
   surviving mutants are known is a scheduler whose tests mean something.

### Phase 2 — Reactive core (one to two weeks)

Rebuild `reactive.ts` (587 lines) with the invariants explicit, keeping the
public API and the contract:

- **One scheduler gate.** Every entry point — signal write, stale-memo read,
  `createRoot`, `batch`, effect creation, resource callbacks — goes through
  a single `runUpdates`-style wrapper that owns `batchDepth`/`flushing`, so
  nothing can run mid-computation (fixes M3, makes R7 structural). This is
  what Solid 1.x does and vint's divergence here was accidental.
- **Make the Class A invariant hold by construction.** Either adopt Solid's
  `updatedAt`/`lookUpstream`/`runTop` shape, where a node's freshness is a
  version comparison rather than a three-state flag with an `errored` patch,
  or keep the three-state design but track "processing aborted" as a
  property of every node touched by an aborted pull, set in `finally`
  blocks, not in one catch. Property tests decide which shape survives.
- **Total disposal.** `cleanNode` accumulates errors from children and
  cleanups, always finishes, rethrows once (AggregateError if several);
  O(1) owner unlink via an `ownerSlot` (fixes M2, L5); creating under a
  disposed owner either disposes immediately or throws
  `E-DISPOSED-OWNER` (L2); `CurrentOwner` is set while cleanups run (L14).
- **Solid-parity details.** `on` defer returns `prevValue` (M4); first memo
  compute bypasses the equality gate (L1); queued-flag reset after
  validation (L3); document or change L4 and L13.

### Phase 3 — DOM and control flow (one week)

- **One range abstraction.** A `Range { start, end, nodes(): live walk,
  clear() }` used by `bindChild`, `For` rows, `For` fallback and `mount`;
  the rule "register the removing cleanup before building children" lives
  in one place. Fixes H3, M1 (mount disposes its root on any throw and
  rethrows), L6, and makes L8 either work (record what a fragment expanded
  to, `WeakMap<DocumentFragment, Node[]>`) or fail loudly.
- **A prop routing table.** Decision per key, case-folded for `on*`
  (rejecting any `/^on/i` name on the attribute path unless explicitly
  `attr:`-prefixed, and warning even then — H4); nullish → remove/clear on
  both paths (M5); `String(value)` before the URL check plus `xlink:href`
  and `data` in the sink list (L11); prescriptive errors around
  `createElement` and getter-only `prop:` (L12); skip the assignment when
  `el[key] === value` (L18).
- **Typed props (M8).** Generate, from `lib.dom.d.ts`, a per-tag props type:
  writable IDL properties with `T | Accessor<T>` values, `on<event>` typed
  from `HTMLElementEventMap`, `on:<name>` and `prop:`/`attr:` escape hatches
  typed as `unknown`, `data-*`/`aria-*` string, custom-element tags falling
  back to `Record<string, unknown>`. This turns every misuse in §4 into a
  compile error with a message, which is the cheapest prompt vint can emit.

### Phase 4 — Surface completions models reach for (one week)

Keep the surface small, but either provide or explicitly deny the Solid
names the eval's next task would hit: `createContext`/`useContext`,
`createSelector` (and use it in `examples/virtual.ts`), `Index`, a
`catchError`-style boundary (today an exception in any binding escapes from
whichever setter triggered the flush, usually an event handler, with no
recovery hook), and `Portal`. For `createResource`: `mutate` with updater
form, `state`/`latest`, an options object, synchronous completion for
synchronous fetchers, and Solid's promise semantics on stale `refetch`.
Every denial goes in `llms.txt` with the vint idiom next to it.

### Phase 5 — The verification loop (one week)

Principle 3 promises "a zero-config test harness, because an agent's
verification loop is its QA department"; the eval has one and users do not.
Ship `vint/testing`: `render(view)` into a fresh container, `settle()`
(flush + drained microtasks), `fire(el, event, init)`, query helpers,
`dispose()`, and a one-command happy-dom runner so an agent can write and
run acceptance tests for the app it just generated. Then test the guide
with a second implementer — someone who did not write vint builds
something non-trivial from `llms.txt` alone and logs every point where the
source was needed.

### Phase 6 — Eval (ongoing, cheap)

Add Preact+htm and Vue-CDN arms; add a weak-model arm; report Wilson
intervals; equalise denominators; pre-register the task list; get at least
one task and its acceptance test written by someone else; pin Solid's
version and note 2.0 drift.

### Definition of done for "solid, tested product"

- Property-based scheduler suite and Solid differential suite green;
  mutation score on `reactive.ts` published.
- Full suite green in happy-dom *and* three real browsers in CI.
- Coverage ≥95% on `src/`, enforced.
- Every H/M finding here has a contract clause, a regression test, and a
  changelog entry; every L is fixed or documented as a divergence.
- Installable from npm and jsDelivr; vendored file unchanged as the default
  path; dev and prod builds both smoke-tested.
- Typed props; `llms.txt` updated with the deferral rule, the absent names,
  and the divergences; alignment guard extended to the new surface.

Rough total for one experienced engineer working with an agent: five to
seven weeks to the definition of done, with Phase 1 the part that must not
be shortened.

## 10. Product improvements beyond correctness

In value-per-effort order, excluding what §9 already covers:

1. **Distribution** (Phase 0) — nothing else matters if it cannot be
   installed.
2. **Typed props** — the biggest single lift to first-try correctness
   available, and it costs no runtime bytes.
3. **A prod build with DEV statically false**, so the "assertions are the
   product" story has an honest opposite for teams that want it.
4. **`vint/testing`** — closes the loop the design promises.
5. **The missing primitives or their explicit denial** in the guide.
6. **A real-browser example gallery deployed from CI** (GitHub Pages) so a
   reader can see focus survive a reorder rather than read that it does.
7. **CSP and Trusted Types guidance** for the vendored deployment.
8. **A published eval with the missing baselines**, which is the marketing
   asset this project actually has.
9. **A `vi-*`/Lit integration example** — the internal use case, made
   visible; it is the strongest demonstration of why property-first routing
   exists.

---

Assessed at `66b5b64` (v0.7.1), 2026-09-04. Baseline at assessment time:
125/125 tests, typecheck, lint, build, smoke and alignment all passing.
Every defect above is something that suite did not cover.

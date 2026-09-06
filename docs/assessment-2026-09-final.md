# Assessment — September 2026, final pass

A last independent pass over vint at `adfd031` — the v0.8.0 tag, after PRs
#14–#30 — made before the framework goes into use. It is not a roadmap. It answers
four questions a team about to depend on this code should ask — is it
secure, does it leak, does it behave the way the guide says, and is it fit
for the purpose it claims — and it names the defects that must be fixed
first, with each fix already prototyped and measured so nothing here is a
guess about effort.

Method: a full read of `src/` (3,764 lines including the generated props),
the contract, both guides, the runner, the build and CI; the whole check
suite (270 tests in Node, 252 in Chromium, coverage 97.8 / 94.3 / 97.9 /
97.8 against 95 / 90 / 95 / 95, typecheck, build, smoke, alignment,
generated props — all green at the start); then adversarial probes, every
one executed against the built bundles: a security sink matrix on the dev
and prod files, heap measurements under `--expose-gc` with `WeakRef`
collection checks, randomised ordering stress, the property suite re-run
with a fresh seed at twelve times its iteration count, and an argument-shape
sweep. The fixes for the three code defects were then built in a detached
worktree and re-tested (suite, Chromium, and every probe) before being
written up. Probe files and the worktree were deleted afterward; `src/` and
`tests/` on `main` are untouched. The validated patch is described in §6.
(The probes ran at `d3c0d89`; `main` moved to the tag during the pass, but
the seventeen commits between them touch only README, CHANGELOG, the guides
and the eval notes — `src/`, `tests/`, `bin/` and `scripts/` are identical,
and the patch was rebuilt and re-verified at the tag.)

- [1. Verdict](#1-verdict)
- [2. What held](#2-what-held)
- [3. Findings](#3-findings)
- [4. Memory management](#4-memory-management)
- [5. Security](#5-security)
- [6. The patch](#6-the-patch)
- [7. Fit for purpose, and how to use it for a while](#7-fit-for-purpose-and-how-to-use-it-for-a-while)

## 1. Verdict

The rebuild did what the second assessment asked of it. Disposal is total
in practice as well as in the contract: under sustained churn of every
construct — keyed lists, branch flips, selectors, resources, style diffs,
whole mount/dispose cycles — the heap is flat to within noise and every
retired element is collectable. The security posture is what the contract
says it is: no hostile prop key reaches a live handler or the prototype
chain in either bundle, and the children path never parses HTML. The
package builds, smokes, types and installs as documented.

One High defect remains, and it is in the guide's own recommended code. The
scheduler has no rule that an owner pending in a flush runs before the
computations it owns. Queue order is observer-slot order, and the O(1)
detach in `detachSources` swaps slots on every re-run, so after a few
updates a binding inside a `Show` branch sits ahead of the `Show` that will
dispose it. The branch then reads the narrowed value after `when` has turned
falsy and before the branch is torn down — a `TypeError` from a setter, in
code written exactly as rule 4 of the guide prescribes. With two bindings in
the branch it happens in about half of random update sequences. Solid does
not have this failure because it runs the topmost stale ancestor first
(`runTop`) and reconciles `For` in the memo phase; vint inherited the API
and not the ordering rule. The fix is 45 lines in the scheduler and 8 in
`For`, validated below, and it also removes the wasted runs of bindings
that were about to be disposed.

Two Mediums sit beside it: `createSelector` leaks one entry per key and
warns the wrong thing whenever it is read outside a tracking scope (a
click handler asking "is this selected?" is the common case), and a props
object placed after a child — or a `Promise`, `Date` or `Map` where a
child belongs — yields a raw `TypeError` or renders nothing, against
principle 2. Both are fixed in the same patch.

The evidence has one soft spot the previous assessments did not see: the
property suite, which is the load-bearing proof for the scheduler, passes
at its pinned seed and fails three of its properties at another. Every
failure traced to the oracle, not the scheduler, but a suite that only
passes at one seed proves less than its size suggests, and the first
maintainer to touch `SEED` or `RUNS` will be told the scheduler is broken
when it is not.

Nothing else found rises above Low. Land the patch in §6 with its contract
clauses and regression tests, fix the harness, and the framework is fit for
the use the design describes: an agent writing small-to-medium no-build UI
over web components, with the guide in context and the verify loop closing
each change.

## 2. What held

Everything below was verified by execution in this pass, not inferred from
the earlier documents.

**Checks.** 270/270 tests in Node; 252/252 in Chromium through Playwright
(the browser-only files included); coverage 97.78 / 94.25 / 97.94 / 97.78
with the thresholds enforced; `tsc --noEmit`; `check:props` (the generated
types match TypeScript 5.9.3's `lib.dom`); build of all four bundles; both
smoke tests, including the DEV matrix and the single-instance guarantee for
`vint/testing`; alignment of 32 codes, 21 exports, 38 clauses and the 12
testing exports across code, guide and skill.

**Bundles.** `vint.js` 47,037 B / 12,715 B gzipped; `vint.prod.js` 19,095 /
7,574; `vint-testing.js` 4,860 / 1,912; `vint.d.ts` 52,374. README's size
claim is within the alignment guard's 20%. The `.d.ts` exposes none of the
white-box helpers.

**Security.** The full matrix is in §5. Summary: a hostile JSON object
spread into props — `__proto__`, `constructor`, `OnClick`, `ONMOUSEOVER`,
`attr:onclick`, `on:click` with a string, `attr:ONLOAD`, an invalid
attribute name, a tag-shaped key — produced zero live handler attributes,
zero executions, and an untouched `Object.prototype`, in the dev bundle
*and* the prod bundle (the skips are not DEV-gated; only the warnings are).
`javascript:` and control-character-obfuscated schemes, `URL` objects and
`toString` objects on every URL sink warn in dev; `data:image/…` is exempt
only on image sinks; SVG data URLs on `a[href]` warn. Children never parse
HTML. `tags` is not a thenable and stringifies. A data-derived tag name is
`E-TAG-NAME`.

**Memory.** Flat under churn; details in §4.

**Scheduler robustness beyond the suite.** A 10,000-deep memo chain
overflows the stack on write (5,000 does not) — recursive marking, as in
Solid; noted, not a finding. Nested `For`s whose rows are themselves `For`
fragments (anchors at sibling level) reorder correctly under shuffles and
insertions. Disposal mid-flight cancels resources; 20,000 superseded
fetches release their memory once resolved.

**Guide accuracy.** Every rule in `llms.txt` that was probed behaves as
stated, with one exception — the rule 4 example — which is finding F1.

## 3. Findings

| # | Finding | Layer | Clause | Severity |
|---|---|---|---|---|
| [F1](#f1) | A branch's bindings can run before the `Show`/`Switch`/`For` that is about to dispose them | reactive | R7, O1, C1–C3 | **High** |
| [F2](#f2) | `createSelector` read outside a tracking scope leaks an entry per key and warns E-NO-OWNER about a cleanup | reactive | C4 | Medium |
| [F3](#f3) | A props object after a child, or a Promise/Date/Map in any position, is a raw `TypeError` or a silent no-render | dom | D1, D2, §E | Medium |
| [F4](#f4) | The property suite passes at its pinned seed and fails three properties at another, on oracle limitations | tests | — | Medium |
| [F5](#f5) | `npx vint verify` resolves to whatever the squatted npm `vint` becomes for a vendored user | distribution | — | Medium |
| [F6](#f6) | `javascript:` URL sinks warn-and-assign; no CSP guidance | security | D10 | Low |
| [F7](#f7) | `vint verify` provides `test`/`describe` only; roots from an undisposed `render` survive across tests | testing | §T | Low |
| [F8](#f8) | The guide is ~5.2k tokens and growing; the skill is a hand-maintained copy | docs | — | Low |
| [F9](#f9) | 45 untracked eval result files; a stale worktree breaks `npm run lint` locally | hygiene | — | Low |
| [F10](#f10-f12-found-by-the-repaired-oracle) | An effect whose run threw is gated by an equal memo recompute and stays silently stale | reactive | R10, R5 | **High** |
| [F11](#f10-f12-found-by-the-repaired-oracle) | A memo rethrowing its cached error loses `aborted`; a later mark strands its reader | reactive | R10, I3 | Medium |
| [F12](#f10-f12-found-by-the-repaired-oracle) | A cached memo error survives an upstream memo's same-flush change | reactive | R10 | Low |

### F1

**A computation owned by a pending computation can run first, and observe a
state its owner is about to retire.** The guide's rule 4 example:

```ts
const [user, setUser] = createSignal<{ name: string; age: number } | null>({ name: "a", age: 1 })
mount(host, () => Show({ when: user, children: (u) => div(span(() => u().name), span(() => u().age)) }))
setUser({ name: "b", age: 2 })   // truthy → truthy: the branch stays, both bindings re-run
setUser(null)                    // TypeError: Cannot read properties of null (reading 'name')
```

The same for a `Switch`/`Match` branch reading narrowed data, for a thunk
branch reading `user()!` directly, for a `Show` inside a `For` row, and for
a `For` row whose bindings derive from the list signal
(`todos().find(t => t.id === item().id).title`) when that row is removed.
Measured over 200 random sequences of zero to three truthy→truthy updates
followed by the falsy write:

| shape | sequences that throw |
|---|---|
| `Show`, 1 binding in the branch | 0 / 200 |
| `Show`, 2 bindings | 105 / 200 |
| `Show`, 3 bindings | 98 / 200 |
| `Show`, 5 bindings | 147 / 200 |
| `For` row deriving from the list signal, then removed | 42 / 200 |
| user effects (`createEffect`) in a `Show` branch | 0 / 200 |

Root cause. A signal write marks its observers in observer-slot order, and
that is the queue order (`mark`, `src/reactive.ts:386–412`). Slot order is
not creation order: `detachSources` (`:120–136`) unlinks a computation by
moving the *last* observer into its slot, so every re-run of the `Show`'s
memo or of a branch binding permutes the list. After one truthy→truthy
update with two branch bindings, the order `[memo, a, b]` becomes
`[a, memo, b]`; on the falsy write `a` is queued first, runs, and calls
`u()` — which is `props.when()` — on `null`. `Show` runs second and
disposes `a`, too late. Solid's `runTop` prevents exactly this: before
running a computation it walks the owner chain and runs the topmost stale
ancestor first, which disposes the child; `For` is exempt from the problem
in Solid because `mapArray` runs inside a memo, before any render effect.
vint has neither rule; R7 says only that render effects precede user
effects and that memos settle before their readers.

Why the suites missed it: the property oracle tracks values and errors, not
*which* of two pending computations ran first when both are legitimately
reached, and its effects never read a narrowed value that an owner would
have made invalid; the `For` and range fuzzers assert DOM shape after each
step, which is correct in every one of these sequences — the throw is in
user code inside the binding, not in vint's reconciliation. The eval's 1,100
vint cells did not hit it either: the failure needs a truthy→truthy update
before a falsy one on a multi-binding branch, and the tasks' acceptance
scripts do not drive that sequence.

Fix, validated (§6): an ancestor-first step in `runQueue` — walk
`node.owner` upward, collect the topmost owner that is pending in this flush
(a queued effect or a non-CLEAN memo), validate it first, then run `node`
only if it survived — plus a `guard` pointer on owner scopes, set by `For`
to its reconcile effect for every row and fallback scope, and consulted by
the same walk. With both, every shape above is 0/200 and the count of
bindings that ran only to be disposed drops from up to twenty per flip to
zero. Contract: add to R7 (or as a new invariant I4 next to I3) — *a
computation never runs in a flush in which an owner, or the reconcile
that manages its scope, is also pending; that owner runs first, and if it
re-runs, the computation is disposed and skipped.* Tests: the property
suite needs an arm where branch-like effects read a narrowing value under
an owner effect that flips it; plus the six plain regressions above.

### F2

**`isSelected(key)` outside a tracking scope registers a reader nobody will
release, and warns about the wrong thing.** `createSelector` (`src/selector.ts:47–52`)
increments `readers`, registers `onCleanup`, and only the reading
computation's next run or disposal decrements it. In an event handler,
`onMount`, `untrack`, or plain component code there is no such computation:
the entry is never dropped, and `onCleanup` with no owner prints
`E-NO-OWNER: an onCleanup callback was created outside any root` — a message
about a call the author never made. Measured: 200,000 untracked reads grew
the heap by 157 MB and emitted 200,005 warnings. Solid guards this with
`if (Listener)`; vint's C4 promises "keys with no live reader hold no
state". The existing test at `tests/control.selector.test.ts:172` pins the
current behaviour (it asserts the E-NO-OWNER warning fires) and must change
with the fix. Fix, validated: when no computation is tracking, return
`compare(key, source())` and touch nothing — 0 warnings, no growth.

### F3

**Argument shapes a model will produce reach a raw `TypeError` or render
nothing.** `div("text", { class: "x" })`, `div(span(), { class: "x" })`,
`div("a", somePromise)`, `div(() => ({ nope: 1 }))`, `div(Symbol())`:
`Cannot read properties of undefined (reading 'length')` from inside
happy-dom (`parameter 1 is not of type 'Node'` in a browser). `div(promise)`,
`div(new Date())`, `div(new Map())`: rendered as an empty element, because
`isPropsObject` (`src/props.ts:276–281`) accepts any non-array,
non-node object as props and `Object.entries` of a `Promise` is empty. An
async component — `mount(el, async () => div(...))` — is the realistic
case of the first, and "props after children" is a shape every tag-function
library sees. Principle 2 says nothing accepts input and quietly ignores it.
Fix, validated: a props object must be a *plain* object (prototype
`Object.prototype` or `null`); anything else in a child position is
`E-CHILD-TYPE`, always on, naming what it got (`a Promise`, `a Date`,
`a plain object`) and the three fixes (props go first; a Promise wants
`createResource`; other objects want a string). Thirty-third code;
contract §E, both guides and the two spelled-out counts updated in the
patch.

### F4

**The property suite is seed-fragile.** `tests/reactive.property.test.ts`
pins `SEED = 20260904, RUNS = 200`. Re-run on unmodified `main` with
`SEED = 777, RUNS = 2500`, three properties fail — P2 ("never runs when
nothing upstream changed"), P3c ("after a memo throw with cascades, the next
write brings every reached effect current") and P6 ("errors are exactly one
per throwing reached effect"). Each shrunk counterexample was traced by
hand against the contract, and none is a scheduler defect:

- **P6**: the harness records a dependency only *after* the read returns
  (`readRef` pushes post-read), so an effect whose first read threw has
  `deps = []` in the oracle. vint has kept the edge on a throwing read
  since Phase 3.1 (R10). On a later write the memo's value changes from 6
  to 18, the effect correctly runs and correctly throws its own `e0`; the
  oracle, believing the effect unreachable, reports "unexpected error e0".
- **P3c**: with effects that both throw and cascade-write, the oracle's
  fixed point is order-dependent — its iteration visited `e1` before
  `e0`'s cascade changed `e1`'s input, wrote `s1 = 15`, and then `e1` threw
  on the next pass and never revised it. vint ran them in creation order
  (R7): `e1` saw the cascaded value first, threw, and never wrote `s1`.
  Both are consistent executions of a program whose settled state is not
  unique; only vint's is contract-ordered.
- **P2**: a render effect ran before the user effect whose cascade it
  depends on (R7 requires exactly that), wrote a transient value, and a
  downstream effect ran once on the transient. The oracle models a single
  fixed point with no phases, so it calls that run "unreached".

Recording the dependency *before* the read repairs P6 and breaks P3 in the
same round, which is the point: the oracle's model of dependencies, phases
and throwing cascades needs deliberate rework, not a one-line patch. Until
then, the pinned seed is passing a suite that would not pass elsewhere, and
the mutation score and coverage figures lean on it. Recommendation: fix the
harness bookkeeping (a read's edge exists whether or not it threw), restrict
P2's "never when unreached" clause to graphs without effect cascades and
add a phase-aware variant for the rest, make the cascade fixed point follow
creation order or exclude throwing cascade effects from currency, then run
a small seed matrix in CI and a long round nightly.

*Postscript, written while closing this finding.* The rework was done: the
oracle now takes reachability from the edges the scheduler holds (a
white-box helper, with P4 proving those equal the reads each body recorded,
recorded before the read), models value propagation with committed memo
values synced from vint's held values, treats a memo left DIRTY as
recomputing whenever it is pulled, iterates pull and propagation to a fixed
point, computes cascades in vint's phase-and-creation order, never generates
an effect that both throws and cascades, and exempts effects downstream of
a cascade target — or starved by an E-LOOP skip — from the "never runs when
unreached" clause. Six seeds at 2,500 iterations pass. The sharper oracle
then found three scheduler defects the assessment's own round had not,
which reverses the sentence this section first ended on: the finding was
about the evidence *and* the code. They are F10–F12 below.

### F5

**The documented command runs whatever `vint` on npm becomes.** The guide
and README say `npx vint verify tests/` (with `node verify.mjs` as the
vendored alternative). The npm name `vint` is taken — a placeholder
published in 2022, version 0.0.1, no `bin` — so today `npx vint` in a
project that vendored the files rather than installing the git package
fails with "could not determine executable to run". The registry owner can
publish a version with a `bin` at any time, and every vendored user who
followed the guide would execute it; agents commonly pass `--yes`. The
second assessment's Phase 0 asked for a scoped name; it was not done ("still
private"). Fix: make the vendored path's command the only one the vendored
guide shows (`node verify.mjs`), and either publish under a scoped name or
say plainly that `npx vint` is valid only after `npm install
github:Vela-Intelligence/vint`. The `bin` name can stay `vint`; it resolves
locally once installed.

### F6

**URL sinks are warn-and-assign, silent in prod; no CSP guidance.** Both
were open in the first review and remain so. `href: "javascript:…"` (and
`vbscript:`) is set in both bundles; the guard exists only as `E-URL-SCHEME`
in dev. There is no legitimate `javascript:` URL in a vint application —
event props exist — so skipping the assignment always-on (keeping the dev
warning) costs nothing but `href="javascript:void(0)"` habits, which the
message can redirect. `data:` must stay a warning (image sinks are
legitimate) and `innerHTML` must stay assignable (trusted markup is a
real use). The guide should carry one paragraph on Content-Security-Policy
for the vendored deployment, where a page with no bundler has CSP as its
primary control, and note that vint's children path is Trusted-Types-clean
while `innerHTML`/`srcdoc` props are not.

### F7

**The runner's surface is smaller than "the same files run under vitest
unchanged" implies.** `bin/verify.mjs` defines `test` and `describe`
(`:33–38`); `it`, `beforeEach`, `afterEach`, `test.skip`, `test.only` and
`expect` are absent, so a vitest file using any of them fails under
`vint verify` while the reverse direction holds. The runner empties
`document.body` before each test but cannot dispose roots a test left
mounted, so their subscriptions live on and can warn `E-BIND-DETACHED`
from a later test. Cheap fixes: alias `it`, provide the two hooks and
`test.skip`, and either track `render()` results for auto-dispose or state
the rule in the guide.

### F8

**The guide has more than doubled, and it is maintained twice.**
`docs/llms.txt` is 20,809 bytes (≈5.2k tokens — the README's earlier "~2k
tokens" is gone in the rewrite, but `docs/review-2026-09.md` still says
"~2k-token"); `skills/vint/SKILL.md` is 22,151 bytes and is the same text
with a different header, maintained by hand. The alignment guard checks
codes, exports and clause ids, not prose, so the two can drift in every
sentence that is not one of those — and each implementer run adds
sentences to both. Either generate the skill from the guide, or add a check
that the shared body is identical; and let the guard report the guide's
size so the next doubling is noticed.

*Closed in 0.8.1:* the skill is the single source — the union of the two
texts merged into `skills/vint/SKILL.md`, `docs/llms.txt` deleted, the eval
and the alignment guard reading the skill, the release attaching it, and the
guard reporting the guide's size with a ceiling.

### F9

**Hygiene.** `eval/results/` holds 45 untracked run files alongside 17
tracked ones; commit the ones the README's tables cite and ignore the rest
by pattern. The stale worktree under `.claude/worktrees/` carries a second
`biome.json`, and Biome refuses nested root configurations, so `npm run
lint` fails locally until it is removed or `!.claude` joins
`files.includes`.

### F10–F12, found by the repaired oracle

Each was reproduced outside the harness with a direct script before being
written up, fixed with a contract sentence and a plain regression test that
fails on the previous scheduler, and re-verified at six seeds.

**F10 (High) — an effect whose run threw is gated by an equal memo recompute
and stays silently stale.** An effect read a signal and then threw on a memo
read; a later write re-notified it *through that memo*, which recomputed to
a value equal to the one it still held; R5's equality gate skipped the
effect; its last completed run — with the old signal value — stood forever,
with no error pending. Solid has the same hole. A run that threw never
completed, so the scheduler now leaves the computation DIRTY and aborted,
memo or effect, and the next notification re-runs it whatever the memo
resolved to. This is a stated divergence from Solid (R10, both guides).

**F11 (Medium) — a memo rethrowing its cached error lost `aborted`.** The
CHECK mark that preceded a reader's re-pull cleared the flag, and the
cached-error rethrow never set it again, so a DIRTY mark later in the same
flush found the memo "at state, not aborted" and never re-walked to the
reader it had just failed — a stranded effect, the exact class Phase 3.1
targeted, surviving on the rethrow path. Fixed by setting `aborted` on the
rethrow; a new at-rest invariant in P5 (a marked effect at rest is one whose
run threw or was skipped by E-LOOP, anything else is stranded) would have
caught it.

**F12 (Low) — a cached memo error survived an upstream memo's same-flush
change.** Only a direct write cleared the cache; an upstream memo changed by
a cascade left the errored memo rethrowing a stale error until some later,
unrelated write — loud, but a false error state. A CHECK mark on an errored
memo now asks the next pull to validate upstream first: a source that
propagated marks it DIRTY and it recomputes; otherwise the cached error is
rethrown exactly as before, one failure one error.

## 4. Memory management

Measured in Node 22 with `--expose-gc`, happy-dom, the built dev bundle
plus the white-box `__observerCount`. Each row: 50 warm-up cycles, then 600
cycles with a macrotask boundary every five and a double GC at each quarter;
"Δ" is heap growth per 150 cycles.

| construct churned | Δ MB per 150 cycles | notes |
|---|---|---|
| `For`: 100 rows replaced, updated in place, rotated, emptied | 0.01 / 0.02 / 0.03 / 0.03 | 620/620 removed `<li>` collected |
| `Show` flip with two bindings | 0.12 / 0.03 / 0.00 / 0.02 | 500/501 branch elements collected across a macrotask |
| `Show` wrapping a `For` | 0.04 / 0.00 / 0.04 / 0.02 | |
| `createSelector` across 50 rows, selection moved and list replaced | −2.74 / 0.02 / 0.04 / 0.00 | tracked reads only — see F2 for untracked |
| `createResource`, three source changes per cycle, resolved | 0.02 / 0.02 / 0.00 / 0.00 | 20k superseded pending fetches: +18 MB, −14 MB after resolution |
| reactive `style` object with a changing key set | 0.06 / 0.05 / 0.00 / 0.05 | |
| `mount` + writes + `dispose` of a whole app per cycle | 0.02 / 0.00 / 0.01 / 0.01 | |

Observer counts on every app-level signal return to zero on `dispose`;
the host is empty afterward. Two measurement traps worth recording so the
next person does not report a leak that is not there: a synchronous loop of
resource fetches holds every pending promise chain until the loop yields
(a first run "found" 4.3 MB per 300 cycles this way), and `WeakRef.deref()`
keeps its target alive until the end of the current job, so collection must
be checked after a macrotask boundary (a first run "found" 0 of 2,001
branch elements collected).

The one leak found is F2, and it is by API misuse the guide does not warn
against; the fix removes it structurally.

## 5. Security

Executed against `dist/vint.js` (dev) and `dist/vint.prod.js`; "attrs" is
the element's attribute list after the call; the JSON object was parsed, not
literal, so `__proto__` is an own key.

| probe | result (dev) | result (prod) |
|---|---|---|
| spread of `{__proto__, constructor, OnClick:"…", ONMOUSEOVER:"…", "attr:onclick":"…", "on:click":"…", "attr:ONLOAD", onfocus:42, "<img…>":…, "data-x y":…, "prop:__proto__"}` | attrs `on="x" o="y"` only; 10 warnings; `__pwned` 0; `Object.prototype` clean | same attrs, no warnings, clean |
| `href`/`src`/`action`/`formaction`/`data`/`attr:href`/`prop:href`/reactive `href` = `javascript:` | assigned + E-URL-SCHEME | assigned, silent |
| `href` = `java\tscript:`, `new URL("javascript:…")`, `{toString}` | assigned + E-URL-SCHEME | assigned, silent |
| `a[href]` = `data:text/html`, `data:image/svg+xml` | assigned + E-URL-SCHEME | assigned, silent |
| `img[src]` = `data:image/png` | assigned, no warning (image sink) | same |
| `innerHTML`, `prop:innerHTML`, `srcdoc`, `attr:srcdoc` | assigned + E-RAW-HTML | assigned, silent |
| `style` string with `url(javascript:)`; `style` object with `__proto__` | assigned; prototype clean | same |
| `tags["<img src=x onerror=…>"]` | E-TAG-NAME | E-TAG-NAME |
| child `"<img src=x onerror=…>"` and binding returning `"<b>x</b>"` | text, never parsed | same |
| `tags.then`, `String(tags)` | `undefined`, `"[object Object]"` | same |

Held: no execution path from a hostile key; no prototype pollution; children
safe by construction; prod skips everything dev skips. Open: F5 and F6.
Supply chain unchanged since the second assessment — zero runtime
dependencies, lockfile resolving to `registry.npmjs.org` with integrity,
SHA-pinned actions, `npm ci --ignore-scripts` in CI, release gated on the
full check suite and a tag-equals-version check.

## 6. The patch

Built and tested in a detached worktree, first at `d3c0d89` and again at
the `adfd031` tag, then removed; the diff is 94 insertions and 13 deletions
across 11 files, 76 of them in `src/`:

| file | change |
|---|---|
| `src/reactive.ts` | `runAncestorsFirst(node)` called from `runQueue` before `updateIfNecessary`; a `guard: ComputationNode \| null` field on nodes; `createScope(fn, guard?)`; `__isTracking()` for internal use |
| `src/control.ts` | `For` captures `getOwner()` inside its reconcile effect and passes it as the guard of every row and fallback scope |
| `src/selector.ts` | `if (!__isTracking()) return compare(key, source())` before any entry is created |
| `src/dom.ts` | `E-CHILD-TYPE` on the non-node fall-through in `normalize` and `insertChild`; `describeChild` |
| `src/props.ts` | `isPropsObject` requires a plain object |
| `src/dev.ts` | the `E-CHILD-TYPE` message (always on) |
| `docs/contract.md`, `docs/llms.txt`, `skills/vint/SKILL.md`, `README.md`, `docs/design.md` | the code listed; "thirty-three" |

Results with the patch: Node 269/270 and Chromium 251/252 — the single
failure is `tests/control.selector.test.ts:172`, which asserts the
misleading E-NO-OWNER warning and must be inverted with the fix (F2);
typecheck and Biome clean; alignment green at 33 codes. Every probe in this document
re-run against the patched bundle: all F1 shapes 0/200 (including the `For`
row case, which needs the guard), doomed-binding runs 0, F2 0 warnings and
no growth, every F3 shape a prescriptive `E-CHILD-TYPE`, security matrix
unchanged.

Not in the patch, and needed before it lands: the contract sentence for I4
(F1) and one for C4's untracked read (F2); the D1 wording "a props object is
a plain object"; regression tests — the six F1 shapes as plain tests, a
property arm for I4, the F2 leak as an observer-count test, the F3 table as
a parameterised test; the flipped selector test; a changelog entry. Order of
landing: F1+F2+F3 with their clauses and tests in one PR (contract first,
as the rules say); F4's harness repair in a second PR, with the seed matrix;
F5–F9 as a docs-and-hygiene PR.

## 7. Fit for purpose, and how to use it for a while

For the use the design describes — a model writing small-to-medium
no-build UI over web components, with `llms.txt` in context and
`vint/testing` closing the loop — the framework is fit once §6 lands, with
these operating rules:

- **Pin the version you vendor** and record its commit; the API is stable
  in practice, not frozen, and the contract is the changelog that matters.
- **Run the verify loop on every generated change**, in development mode,
  and treat any `E-*` in a passing test's notes as a defect to fix before
  merging — the warnings are the cheapest review the project offers.
- **Treat E-URL-SCHEME as a hard rule, not a warning**, until F6 makes it
  one: no URL sink is ever built from data without a scheme allow-list.
- **Keep `Show` branches thin.** Even after F1, a branch that reads a
  narrowed value should read it through the callback accessor, not by
  closure over the signal, so the narrowing stays visible in the code.
- **Read `isSelected` only inside bindings or effects** until F2 lands.
- **Expect the guide to cost ~5k tokens**; the alignment guard reports its
  size on every run and fails past 44 kB.
- **Do not bump the property suite's seed casually**; run the multi-seed
  matrix from F4 first and expect the oracle, not the scheduler, to be the
  thing that needs work.

What it is not for has not changed since the second assessment: SSR, large
human teams, lists of thousands of rows without windowing, or anything that
needs an npm-resolvable dependency today.

---

Assessed at `adfd031` (the v0.8.0 tag; probes at `d3c0d89`, identical in
every code path), 2026-09-05. Baseline at assessment time:
270/270 tests, Chromium 252/252, coverage above thresholds, typecheck,
lint (on a clean checkout), build, smoke, props and alignment all passing.
Every finding above was reproduced by execution; every code fix was
prototyped, measured and re-tested before being described.

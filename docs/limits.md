# Limits and evidence

*vint* claims that a framework designed for a model to write can reach the
correctness of the frameworks models already know, and that a behavioral
contract, prescriptive errors, and an eval get you there. That claim rests
entirely on the apparatus behind it, so this document covers the apparatus:
what it demonstrates, where it fails, and what it missed.

Read it if you are looking for the hole. It flags weak evidence where the
evidence is weak, and it keeps the corrections where this document's own
earlier conclusions turned out wrong.

- [What the evidence supports](#what-the-evidence-supports)
- [Where vint breaks](#where-vint-breaks)
- [What our verification missed](#what-our-verification-missed)
- [Security](#security)
- [Open decisions](#open-decisions)

[CHANGELOG.md](../CHANGELOG.md) lists the individual defects and their fixes.

## What the evidence supports

The [eval harness](../eval/README.md) runs five frameworks across four
engines against eleven task specs, grading each solution with behavioral
acceptance tests and allowing one fix attempt per failure. It supports two
claims and refuses four.

**Supported — parity.** *vint* scores comparably to React and Solid on all
four engines: from type declarations alone on the small tasks, and from the
~2k-token guide on the large one. A framework with zero training presence
matches the two deepest priors.

**Supported — the discarded semantics deserved discarding.** VanJS, whose
authoring shape *vint* kept and whose `.val` proxy semantics *vint*
replaced, scores 22–38/50 first-try with the weakest second-try recovery in
the set. That gap is the widest margin in the data, and the only one that
clears the sample noise.

**Refused — superiority.** Parity is the claim and the result.

**Refused — that the metric discriminates.** Outside VanJS, nearly every
cell lands at 48–50 out of 50. A benchmark sitting at its ceiling cannot
separate the design choices it gets credit for driving. The metric justified
the design in argument; it has yet to test it.

**Refused — tight error bars.** Cells hold 5 samples, 10 in the A/B, and the
tables report no confidence intervals. The large-app differences rest on
twenty binomial trials.

**Refused — independence.** One author wrote the framework, the guide, the
task specs and the acceptance tests. Calibration runs asymmetric: reference
solutions cover 11 *vint* tasks against 1 React, 2 Solid and 2 VanJS, so 7
of 11 tasks calibrate against *vint* alone. The `vint-bare` row also carries
an uneven denominator, because `summary.mjs` folds the A/B run's 10-sample
cells on tasks 02/05/10 into it.

An eval arm whose tasks and acceptance tests come from someone outside the
project would strengthen everything above. Every claim here rests on
criteria written by the same person who wrote the thing being measured, and
candour does not retire that.

## Where vint breaks

These hold in the current release.

**Window large lists.** `For` diffs whatever `each()` returns, and diffing
an opaque array of N items requires looking at N items — an
information-theoretic bound. At 3,000 rows a reconcile costs low single-digit
milliseconds however little changed; below ~500 rows you will not see it.
Slice to the visible range and the cost stays flat however large the
collection grows. `examples/virtual.ts` runs 50,000 records through a
~23-row window and builds one row per scroll step. Escaping the O(N)
altogether would require `each` to carry deltas, which means a second state
primitive and a proxy store — both explicit non-goals.

**Props carry no XSS guarantee, and their guards run in dev only.** Children
stay safe because every child becomes a text node. Props do not:
`innerHTML`, `outerHTML` and `srcdoc` parse HTML, and `href`, `src` and
`action` accept `javascript:` URLs. Both paths warn — `E-RAW-HTML`,
`E-URL-SCHEME` — and a Vite production build compiles both warnings out.
They shorten a debugging loop. Treat contract D10 as the control. Spreading
an untrusted object into props hands an attacker the keys.

**One custom-element seam stays invisible.** A function under a non-event
prop key becomes a reactive binding: *vint* calls it and assigns the return,
destroying a Lit-style callback. *vint* catches three of the four shapes — a
function taking arguments, one that reads no signals, one overwriting a
function-valued property. The fourth, a zero-argument callback that reads
signals, looks identical to a correct binding, and no inspection separates
them. D7 documents it and a test pins it, so a later attempt cannot close it
with a heuristic that fires on correct code. Use `prop:` for callbacks and
the question never arises.

**Reorders cost one move per row that actually moves.** Placement stays
minimal: a row holding its position relative to the other retained rows
never gets re-inserted. A genuine reversal still moves n−1 rows, which is
the floor for that operation.

***vint* ships no SSR, hydration, router, forms or i18n**, all deliberate,
and **no package on any registry**. Someone has held the unscoped npm name
since 2015, so this remains an open decision. Today you vendor one file from
a release.

## What our verification missed

Read this section closely, because *vint*'s distinguishing asset is the
apparatus: a numbered contract the tests cite, prescriptive errors, CI that
blocks drift between the code and the agent-facing artifacts, and an eval. A
September audit found one blind spot running through all of it, eight times
over.

**Each check confirmed its own existence. None of them could fail.**

| Artifact | What it verified | What it missed |
|---|---|---|
| The `mount` disposal test | the disposer removes the DOM | it wrapped the binding in `p()`, so the snapshot held a real element. The promise broke for a top-level binding, the shape that mattered |
| The alignment CI guard | every error code appears in every agent artifact | README and design.md both said "Nineteen" while `src/dev.ts` defined 21 |
| That guard's size check | the README claim sits within 20% of the bundle | ~34 kB claimed against 35.6 kB actual, green twice |
| Contract clause C2 | "focus in unmoved rows survives" | *unmoved* meant whatever the implementation happened to leave alone. The clause could not fail, and a greedy algorithm that destroyed focus on 98 of 100 rows satisfied it |
| `npm run lint` | lint and formatting pass locally | it ran `biome check` while CI ran `biome ci`, and only `ci` fails on formatting. A branch passed every local check and CI rejected it |
| The eval harness | generated code compiles and behaves | it aliases `vint` through esbuild, so it cannot see that the import `llms.txt` teaches resolves nowhere for a real user |
| The eval's fairness claim | acceptance tests pass reference solutions "in multiple frameworks" | this holds for 4 of 11 tasks; 7 calibrate against *vint* alone |
| The performance figures | reconcile cost under vitest | happy-dom implements `nextSibling` as a linear `indexOf`, so the numbers described the test environment. The first diagnosis blamed the wrong code, and removing that code changed nothing |

The pattern carries more weight than any single row, because it undercuts
the project's central claim. A framework arguing that the contract and the
errors constitute the product cannot afford a contract clause that no
behaviour can violate, or a guard reporting green over something wrong.

Each one now fails when it should, and each failure was demonstrated before
the fix landed. The count guard asserts the number, and reintroducing the
drift makes it fail. C2 promises move-minimality, a test pins it at an exact
move count, and that test failed against the old algorithm first. `npm run
lint` runs what CI runs. Performance claims come from Chrome through `npm
run bench` and rest on deterministic operation counts, because that page's
own timings carry 30–40% variance and an ordering bias.

This audit reached two conclusions and then withdrew them. The discipline
above caught both:

- **We misdiagnosed the reconcile's cost.** The first analysis blamed a DOM
  range walk, working from numbers taken under happy-dom. Profiling in
  Chrome put ~75% of the work elsewhere, and removing the walk changed
  nothing measurable.
- **A proposed warning would have fired on correct code.** The first fix for
  the callback seam would have flagged `count: () => n()`, the idiomatic
  reactive binding on a custom-element property, teaching authors to write
  `prop:` where it breaks things. Prototyping against the examples gallery
  caught it.

## Security

Running the code confirms the following in the current release.

Children stay XSS-safe by construction: `<img onerror=…>` renders as text. A
`JSON.parse`-derived `__proto__` key hits `E-PROTO-KEY` and leaves
`Object.prototype` untouched. A spread of `{"onclick": "alert(1)"}` hits
`E-EVENT-VALUE` and never becomes a live handler, which is the failure mode
most tag-function libraries carry. The supply chain stays small and pinned:
zero runtime dependencies, six dev dependencies, no install scripts, CI
actions pinned to full commit SHAs under `contents: read`, and a gitignored
`dist/` built at tag time from a byte-reproducible build.

Everything under "props carry no XSS guarantee" above still applies.
Computed tag names can also construct `script` elements, including under
`tagsNS`; the proxy cannot tell a literal key from a data-derived one, so
documentation carries that weight and D10 reads as normative. *vint* ships
no CSP guidance, a real gap given that the documented path puts a vendored
file in a page with no bundler.

## Open decisions

Choices with real trade-offs that remain open.

1. **Distribution.** `package.json` sets `private: true` with
   `main: src/index.ts`; the README says "add the repo as a dependency";
   SKILL.md says "there is no npm package". Three artifacts give three
   answers. Someone has held the unscoped npm name since 2015, so publishing
   needs a scope or a rename. Until that resolves, `llms.txt` teaches an
   import specifier that resolves only inside the eval harness — a live
   inconsistency.
2. **An independent eval arm.** Tasks and acceptance tests written by
   someone outside the project. Everything in the evidence section depends
   on it, and nothing else substitutes.
3. **The verification loop design.md promises.** Principle 3 names "a
   zero-config test harness, because an agent's verification loop is its QA
   department." One exists for the eval; users get none. A small
   `vint/testing` surface — mount, settle, assert, dispose — would let an
   agent close the loop on the app it just wrote. The principle stands
   undelivered.
4. **Eval presentation.** Equal denominators, confidence intervals, a task
   list fixed before anyone sees results, and reference solutions for the
   baselines.

---

Audited at `6d00aa5`, September 2026, against a fully green suite: that
suite covered none of the items above. Performance figures come from Chrome,
because the vitest environment cannot measure them honestly, for the reason
given above.

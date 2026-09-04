# Why vint exists

**vint** — *Vanilla In TypeScript* — is a UI framework built on one premise:

> Most application code is now written by AI models. Frameworks still optimize
> for human learning curves, human typing budgets, and human communities. What
> would a framework look like if its primary user were a model?

The metric that drives every design decision here:

> The probability that a model writes a correct app on the first try, and can
> diagnose a failure on the second.

That single metric kills most classic framework virtues. Tiny bundle golf, API
elegance, DX ergonomics, marketing docs — all of it optimizes for a reader who
isn't the one writing the code anymore. What replaces those virtues:

## The five principles

**1. Don't invent semantics — inherit them.**
A model arrives with priors from billions of lines of Solid, React, and
vanilla DOM. The best API is one where those priors are already correct.
Wherever vint borrows a name from Solid, it implements Solid's behavior
faithfully — Solid **1.x**, the version models have the deepest prior for;
Solid 2.0 changes the async model and vint deliberately does not track it.
Wherever vint deliberately deviates, the deviation is stated loudly (in
[llms.txt](llms.txt), in the [contract](contract.md), and in dev-mode
errors) — never left subtly different. There are no aliases: one name per
concept, so generated code is consistent across sessions.

**2. Fail loud, instantly, and descriptively.**
The expensive failure mode for an agent is silent staleness: the app renders
and is subtly wrong, and a debugging loop burns on it. So vint spends bytes
freely on assertions. Every error and warning names what happened and states
the fix imperatively — error messages are prompts. Nothing accepts input and
quietly ignores it.

**3. The context artifact is part of the framework.**
The deliverable isn't just the library. It's the library plus
[llms.txt](llms.txt) — a compact statement of the semantic contract and the
known footguns, sized to sit in a model's context — plus a zero-config test
harness, because an agent's verification loop is its QA department.

**4. Types are the linter for the model.**
Strict TypeScript that makes wrong usage fail to compile catches generation
slips before anything runs. Where an API can be shaped so that misuse is a
type error instead of a runtime surprise, it is.

**5. One way to do each thing, no cleverness budget in either direction.**
Every additional API entry point is a branch where generation can go wrong —
so the surface is small. But there's also no size golf: verbosity costs
nothing when the writer is a model, and the size constraints that force bad
defaults (index-keyed lists, hole-punching reconcilers) are exactly the
constraints worth deleting.

## What that produced

- **VanJS-shaped authoring.** Tag functions returning real DOM elements —
  `div({ class: "x" }, child)` — because plain function calls are the one
  syntax a model cannot get wrong without a compiler, and they compose
  directly with any web component. No JSX, no VDOM, no build step.
- **Solid's reactive contract, implemented faithfully.** `createSignal`,
  `createMemo`, `createEffect`, ownership and cleanups, glitch-free memos,
  keyed `For`, boolean-keyed `Show`, `createResource` — Solid's names,
  Solid's semantics. The deliberate divergences (an item *accessor* in `For`,
  resource errors that never throw, thunk children) are enumerated at the top
  of [llms.txt](llms.txt). Inheriting faithfully means inheriting the
  trade-offs too, and one is worth naming: reading the same signal *n* times
  inside one computation registers *n* dependency edges, exactly as Solid 1.x
  does, so a memo that reads a signal inside a `reduce` over a large list
  allocates proportionally on every run. Deduplicating would cost either an
  O(n) scan per read or a per-run `Set` allocation — both worse in the common
  case where a computation reads each source once or twice. Principle 1 says
  the prior wins: a model's expectation of Solid's edge behavior is correct
  here, and quietly diverging to "improve" it is the failure mode this
  project exists to avoid.
- **Signals are the only state primitive.** No proxy store, no deep
  reactivity. Proxies are where models most often guess wrong about what is
  tracked, and where in-place mutation silently defeats change detection.
  Explicit reads (`todos()`) and immutable writes (`setTodos(prev => ...)`)
  keep every reactive edge visible in the code.
- **Errors are prompts.** Thirty-one error codes, each a short imperative
  telling the reader what to write instead — including guards for the exact
  mistakes a Solid- or VanJS-trained model makes (`E-FOR-ITEM-ACCESS`,
  `E-NO-REF`, `E-SAMEREF-SET`, ...). The vendored bundle ships with all
  assertions on: they are the product, not overhead.
- **A written behavioral contract.** [contract.md](contract.md) states every
  promise as a numbered clause. The tests cite clause numbers; code comments
  cite them at the line that makes them true; when code and contract disagree,
  the contract wins and the code is the bug.

## Lessons carried as regression tests

The first prototype of vint was written by an LLM in a chat session and never
executed. It looked plausible and failed in exactly the ways this project
exists to prevent: effects that wedged permanently when written during a
flush, a store whose reads went stale after mutation, cleanups silently
dropped, conditional rendering that rebuilt on every value change. Every one
of those failure classes is a named regression test today, and the deeper
lesson became principle 1: the prototype blended VanJS, VanX, and Solid
semantics, so nothing behaved quite like the prior it invoked. A framework
for models must never be *almost* like something the model knows.

## Non-goals

SSR and hydration. JSX. A component library or design system (bring your own
web components — they work as ordinary tags). Being a general-purpose
framework for large human teams. npm-first distribution (vendoring one file
from a release is the intended no-build path).

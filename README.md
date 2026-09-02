# vint

**Vanilla In TypeScript** — a UI framework whose primary user is an AI.

Real DOM, no virtual DOM, no JSX, no build step. VanJS-shaped tag functions
over a Solid-faithful reactive core, wrapped in the thing most frameworks
don't ship: a precise behavioral contract, an agent-sized guide, and error
messages written as prompts. Zero runtime dependencies, one ~28 kB ESM file
(~8 kB gzipped).

```ts
import { createSignal, createMemo, For, mount, tags } from "vint"

const { div, button, input, ul, li, span } = tags

function TodoApp() {
  const [todos, setTodos] = createSignal<{ id: number; title: string; done: boolean }[]>([])
  const [title, setTitle] = createSignal("")
  const left = createMemo(() => todos().filter((t) => !t.done).length)
  let nextId = 1

  return div(
    input({ value: title, oninput: (e: Event) => setTitle((e.target as HTMLInputElement).value) }),
    button(
      {
        onclick: () => {
          if (!title().trim()) return
          setTodos((prev) => [...prev, { id: nextId++, title: title(), done: false }])
          setTitle("")
        },
      },
      "Add",
    ),
    span(() => `${left()} left`),
    ul(
      For({
        each: todos,
        key: (t) => t.id,
        fallback: () => li("nothing yet"),
        children: (item) => li(() => item().title),
      }),
    ),
  )
}

mount(document.body, TodoApp)
```

A component runs **once**. Every function child or function prop is a live,
fine-grained binding. There is no re-render.

## Why this exists

Most application code is now written by models, but frameworks still optimize
for human learning curves. vint optimizes for one metric instead: *the
probability that a model writes a correct app on the first try, and can
diagnose a failure on the second.* Concretely:

- **Inherited semantics.** Where vint uses a Solid name, it implements
  Solid's behavior faithfully — a model's prior is already correct. The few
  deliberate divergences are listed at the top of
  [docs/llms.txt](docs/llms.txt), not left subtly different.
- **Errors are prompts.** Nineteen prescriptive error codes catch the exact
  mistakes Solid- and VanJS-trained authors make, and each one states the
  fix: `E-FOR-ITEM-ACCESS: you read .title on the item accessor — call it
  first: item().title`.
- **A written contract.** Every behavioral promise is a numbered clause in
  [docs/contract.md](docs/contract.md); the test suite cites the clauses; if
  code and contract disagree, the code is the bug.
- **One way to do each thing.** No aliases, no proxy store, no second state
  primitive. Small surface, consistent generated code.

The full rationale: [docs/design.md](docs/design.md).

## Measured, not claimed

The metric above is testable, so we test it. The [eval harness](eval/README.md)
gives four models — Claude Opus 5, Claude Sonnet 5, and OpenAI's
gpt-5.6-terra and gpt-5.6-luna — the same app specs under five conditions:
vint with llms.txt in context, vint with only its type declarations, and
React, Solid, and VanJS as baselines. Solutions are graded by behavioral
acceptance tests (DOM identity across reorders, race outcomes, subscription
discipline, state surviving navigation), with one fix attempt per failure.
**pass@1** is first-try correctness; **pass@2** is second-try diagnosis.

Ten small-to-trap-sized tasks (pass@1 → pass@2):

| condition | Opus 5 | Sonnet 5 | gpt-5.6-terra | gpt-5.6-luna |
|---|---|---|---|---|
| **vint + llms.txt** | 49/50 → 50/50 | 48/50 → 50/50 | 48/50 → 50/50 | 49/50 → 50/50 |
| **vint, types only** | 50/50 | 50/50 | 64/65 → 65/65 | 64/65 → 65/65 |
| react | 49/49¹ | 50/50 | 50/50 | 50/50 |
| solid | 49/50 → 50/50 | 48/50 → 49/50 | 49/50 → 49/50 | 50/50 |
| vanjs | 38/50 → 50/50 | 35/50 → 43/50 | 28/50 → 45/50 | 22/50 → 36/50 |

And one large app — a three-view project tracker (~300 lines: async seed,
nested keyed lists, cross-view derived counts, state surviving navigation):

| condition | Opus 5 | Sonnet 5 | gpt-5.6-terra | gpt-5.6-luna |
|---|---|---|---|---|
| **vint + llms.txt** | 5/5 | 5/5 | 3/5 → **5/5** | **5/5** |
| vint, types only | 5/5 | 3/5 → 5/5 | 3/5 → 3/5 | 3/5 → 4/5 |
| react | 5/5 | 5/5 | 3/5 → 5/5 | 4/5 → 4/5 |
| solid | 5/5 | 5/5 | 4/5 → 4/5 | 4/5 → 5/5 |
| vanjs | 4/5 → 5/5 | 4/5 → 4/5 | 5/5 | 3/5 → 3/5 |

What the numbers say:

- **A framework with zero training presence scores at React/Solid level on
  every engine** — from the type declarations alone on small tasks, and
  from the ~2k-token llms.txt at scale. On the large app, vint + llms.txt
  is the only condition of the five that reaches 5/5 (or recovers to it)
  on all four engines — including gpt-5.6-luna, OpenAI's smallest model,
  where it beat the model's own React prior.
- **The guide carries identifiable failure classes.** Without it, models
  writing the large app repeatedly shipped the rule-1 bug (a one-shot
  untracked read of async state — rendering "undefined" forever); with it
  in context, that class vanished.
- **VanJS is the outlier, in the direction this project's design
  predicted.** vint kept VanJS's authoring shape but replaced `.val`
  proxies and re-render semantics with Solid's reactive contract, because
  that's where models guess wrong. The table agrees: the shape scores at
  Solid level, and the discarded semantics are what fails — with the
  weakest second-try recovery, since silent staleness gives the model
  nothing to diagnose from.
- **The item-accessor divergence in `For` costs nothing**: 59/60 vs 59/60
  in a controlled A/B against a value-passing variant, and zero
  `E-FOR-ITEM-ACCESS` occurrences across ~1,100 scored generations.

Reproduce it: `cd eval && npm install && npm run calibrate`, then
`npm run pilot` with API credentials. Method, per-run costs (the entire
gpt-5.6-luna program cost under a dollar), and every lesson the harness
taught us: [eval/README.md](eval/README.md). The full analysis — complete
methodology, the incident log (including how our own harness biases were
caught and fixed), failure taxonomy, threats to validity, and a
step-by-step reproduction guide with archived raw data — is in the wiki:
[AI-Native Evaluation](https://github.com/Vela-Intelligence/vint/wiki/AI-Native-Evaluation).

¹ One cell excluded: a deterministic safety-classifier refusal (category
"cyber", triggered by the word "monitor" in an early task spec), not a
coding failure. Diagnosed and reworded; see the eval lessons.

## Install

**Vendored, no build (the intended simple path):** download `vint.js` (and
`vint.d.ts` for editor types) from a
[release](https://github.com/Vela-Intelligence/vint/releases), drop them next
to your app, and:

```html
<script type="module">
  import { createSignal, mount, tags } from "./vint.js"
</script>
```

**As TypeScript source** (Vite or any bundler with `moduleResolution:
"bundler"`): add the repo as a dependency or copy `src/`, then import from the
package root. Types come straight from the source.

## API

Everything, in one table — there are no other entry points:

| Area | Exports |
| --- | --- |
| State | `createSignal` `createMemo` `createEffect` `createRenderEffect` `batch` `untrack` `on` |
| Lifecycle | `createRoot` `onMount` `onCleanup` `getOwner` `runWithOwner` |
| DOM | `tags` `tagsNS` `mount` |
| Control flow | `Show` `Switch` `Match` `For` |
| Async | `createResource` |

Custom elements are ordinary tags — `tags["my-button"]({ label: "Save" })` —
with property-first assignment, so Lit and friends just work.

## If you're pointing an AI at this

Give it [docs/llms.txt](docs/llms.txt). It's ~2k tokens: the six rules, the
Solid divergences, the untrusted-data rules, and every error code. That file
is a first-class deliverable of this project — if the guide and the library
ever disagree, file a bug.

For agent harnesses with skill support (Claude Code and compatible), vendor
[skills/vint/SKILL.md](skills/vint/SKILL.md) into your project's skills
directory alongside `vint.js` — it's the same guide, packaged to load
automatically whenever the agent works with vint code.

## Examples

`examples/` is a small gallery — counter, todos, stopwatch, fetch-then-render,
and a component-patterns page — built only on vint and plain elements:

```bash
npm install
npm run examples   # builds and serves examples/ with rebuild-on-change
```

## Development

```bash
npm test            # vitest + happy-dom; tests cite contract clauses
npm run typecheck   # strict TS
npm run lint        # biome
npm run build       # dist/vint.js + rolled-up dist/vint.d.ts
npm run smoke       # imports the built bundle in plain Node
```

Docs map: [design.md](docs/design.md) (why) ·
[contract.md](docs/contract.md) (exact behavior, the source of truth) ·
[llms.txt](docs/llms.txt) (the agent guide) ·
[wiki](https://github.com/Vela-Intelligence/vint/wiki) (the evaluation:
methodology, results, defense).

Contributions welcome. The bar for any behavior change: update the contract
first, then the tests, then the code — in that order.

## License

[MIT](LICENSE)

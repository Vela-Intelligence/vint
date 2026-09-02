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
[llms.txt](docs/llms.txt) (the agent guide).

Contributions welcome. The bar for any behavior change: update the contract
first, then the tests, then the code — in that order.

## License

[MIT](LICENSE)

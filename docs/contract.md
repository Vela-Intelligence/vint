# vint — semantic contract

Every clause here is a behavioral promise. The test suite cites these clause
numbers; code comments cite them at the line that makes them true. If code and
this document disagree, this document wins — fix the code. If a promise must
change, change it here first, then the tests, then the code.

## R — Reactivity

- **R1. Setup code runs once.** A component is a plain function that builds and
  returns DOM. It executes exactly once. Nothing re-runs it. All updating
  happens through the bindings and computations it created.
- **R2. Tracking is scoped to computations.** Reading a signal or memo inside a
  memo, an effect, or a DOM binding subscribes that computation to it. Reads
  anywhere else (component bodies, event handlers, timers) are untracked and
  free. `untrack(fn)` suppresses tracking inside `fn`.
- **R3. Dependencies are dynamic.** Each run of a computation re-collects its
  dependencies from what it actually read. A dependency not read on the latest
  run no longer triggers the computation.
- **R4. Signals: `createSignal(v, opts?) → [get, set]`.** `get()` returns the
  current value (tracked per R2). `set(v)` or `set(prev => v)` writes. A write
  whose value is equal (default `===`, or `opts.equals`) to the current value
  is a no-op: no notifications, no runs. To store a function as a value, write
  `set(() => fn)`.
- **R5. Memos: `createMemo(fn, initial?, opts?) → get`.** Computed once at
  creation, then lazily: a memo re-computes at most once per change, on first
  read after invalidation. A recompute that produces an equal value (default
  `===`, or `opts.equals`) does not propagate — downstream computations do not
  run.
- **R6. Glitch-freedom.** A computation never observes a stale memo. In a
  diamond (signal → memo A, memo B → effect), one write runs the effect exactly
  once, and the effect sees consistent A and B.
- **R7. Effects: `createEffect(fn)`.** Runs after creation (deferred to the end
  of the enclosing root body or current flush — never mid-construction), then
  re-runs after any of its dependencies change. Effects run after all memos
  they read have settled. `createRenderEffect(fn)` is identical but runs in the
  earlier render phase of each flush; DOM bindings use it. Within one flush,
  all pending render effects run before pending user effects.
- **R8. Writes during a flush are safe.** An effect writing an unrelated signal
  queues the dependent effects into the *same* flush; chains (a→b→c) settle in
  one flush with each effect running once. Nothing is ever silently dropped or
  wedged. An effect that endlessly re-triggers itself is detected and throws
  error E-LOOP naming the effect.
- **R9. `batch(fn)`.** Writes inside apply immediately (reads see new values,
  memos read inside are freshly validated), but effects run once, after the
  outermost batch exits. Nested batches flush only at the outermost exit.
  Every `set` outside a batch flushes synchronously.
- **R10. Errors don't corrupt the graph.** An effect that throws is skipped for
  that flush; every other queued effect still runs; the error (or an
  `AggregateError` for several) is rethrown after the flush completes. The
  system remains fully usable afterwards. A memo whose `fn` throws propagates
  the error to its reader and stays invalid — the next read retries.
- **R11. `on(deps, fn, opts?)`.** Wraps `fn` for use in an effect/memo so only
  `deps` (one accessor or an array) are tracked; the body is untracked. `fn`
  receives `(input, prevInput, prevValue)`. `{ defer: true }` skips the first
  run. This replaces hand-rolled "depend on X without using it" helpers.

## O — Ownership & disposal

- **O1. Owner tree.** Every computation is created under the current owner
  (root, effect run, memo run, or scope). Disposing an owner disposes its
  entire subtree: computations stop, cleanups run, subscriptions detach.
- **O2. Per-run scope.** Before every re-run of an effect, everything
  registered during its previous run — `onCleanup` callbacks (run LIFO) and
  child computations — is disposed. A listener added in an effect with a
  matching `onCleanup` can therefore never duplicate.
- **O3. `createRoot(fn)`.** Creates a detached owner; `fn` receives `dispose`.
  The caller owns disposal. `mount()` wraps this. Effects created inside the
  root body run when the body completes, not mid-body.
- **O4. `onMount(fn)`.** Runs `fn` once, untracked, after the enclosing body's
  DOM bindings have run — synchronously, no microtask. The owner at the
  `onMount` call site is active inside `fn`, so `onCleanup` registered there
  lands on the component. `fn`'s return value is ignored (Solid semantics) —
  register teardown with `onCleanup`, not by returning a function.
- **O5. Disposal is total and idempotent.** After dispose, a computation never
  runs again (even if it was already queued in an in-flight flush), it is
  detached from every source (writes afterward touch nothing — no leaks, no
  ghost updates), and disposing twice is harmless. Reading a memo whose owner
  was disposed throws E-DISPOSED-MEMO in dev rather than returning stale data.

## D — DOM

- **D1. Tag functions.** `tags.div(...)`, `tags["vi-button"](...)`,
  destructuring `const { div, button } = tags`. First argument may be a props
  object; all remaining arguments are children. `tagsNS(namespace)` returns the
  same for namespaced elements (SVG). The call returns a real, live `Element`
  — keep the reference if you need the node; there is no `ref` indirection.
- **D2. Children.** Strings/numbers become text nodes. Nodes pass through
  (fragments are expanded). `null`/`undefined`/booleans render nothing. Arrays
  flatten, recursively. A **function child is a live binding**: it re-runs
  when its dependencies change and its result replaces the previous one in
  place.
- **D3. Null-first recovery.** Every function child is anchored by a pair of
  comment markers that exist from the start. A binding whose value is `null`
  (or anything empty) on the first render renders nothing but keeps its
  anchor, and renders normally the moment a later value is non-empty.
  Placeholder `display:none` divs are never needed.
- **D4. Arrays stay live.** A function child returning an array (including
  nested functions inside it) is re-normalized on every run — it never goes
  inert. Functions nested inside a returned array are tracked by the same
  binding (coarse-grained); give a child its own function position for
  fine-grained updates.
- **D5. Node identity is respected.** If a run returns the same node(s) as the
  previous run, they are not detached or moved — focus, selection, and media
  state survive. Text-only changes update the existing text node's data.
- **D6. Props: settable property wins.** For each key, if the element (or its
  prototype chain) has a settable property of that name, the value is assigned
  as a property; otherwise it is set as an attribute (`true` → empty
  attribute, `false`/`null`/`undefined` → attribute removed). Force the
  routing with `"prop:name"` or `"attr:name"`. This is what makes Lit/custom
  elements (`vi-*`) work as plain tags.
- **D7. Reactive props.** A function-valued prop (that is not an event
  handler) is a live binding: `class: () => active() ? "on" : ""`. A signal
  getter passed directly (`value: title`) is the same thing. `style` accepts a
  string or an object (camelCase keys converted; `null` removes).
- **D8. Events.** A function under an `on*` key is added once with
  `addEventListener(key.slice(2).toLowerCase(), fn)` and lives exactly as long
  as the element. Event props are not reactive — swap behavior inside the
  handler, not by swapping handlers.
- **D9. `mount(container, view) → dispose`.** Calls `view()` once (R1) under a
  new root, appends the result, returns a disposer that tears down every
  computation and removes the mounted DOM. One `mount` per app is the norm.

## C — Control flow

- **C1. `Show({ when, fallback?, children })`.** `children` and `fallback` are
  thunks (`() => Child`), built lazily. The branch is keyed on
  `Boolean(when())`: truthy→truthy value changes never rebuild; only a real
  flip tears down one branch (running its cleanups) and builds the other.
- **C2. `For({ each, key?, children })`.** `each` must be a function returning
  an array (E-FOR-ARRAY otherwise). `children(item, index)` receives two
  accessors and is called once per key — not per render. Rows are reconciled
  by key (default: item reference identity; pass `key: t => t.id` for object
  rows). Existing rows keep their DOM nodes: removals leave no holes,
  reorders move the same nodes (focus in unmoved rows survives), a
  same-keyed replacement updates the row in place through `item()`. Removed
  rows are disposed (cleanups run, subscriptions detach). Duplicate keys are
  an error (E-FOR-DUPKEY). Mutating the array in place and returning the same
  reference warns (E-FOR-SAMEREF) — update immutably.
- **C3. `Switch({ fallback?, children: [Match, ...] })` / `Match({ when,
  children })`.** First truthy `Match` wins; `Match` children are thunks. A
  change that doesn't alter which branch wins does not rebuild. `Match`es
  after the current winner are not even tracked.

## A — Async

- **A1. `createResource(source?, fetcher) → [data, { refetch, mutate }]`.**
  `fetcher(sourceValue, { value, refetching })` returns a promise. `data()` is
  a tracked accessor (`undefined` until first success); `data.loading` and
  `data.error` are tracked booleans/values. Source is an accessor: when its
  value changes, the resource refetches; `false`/`null`/`undefined` skips
  fetching.
- **A2. Last fetch wins.** A response arriving after a newer fetch started is
  discarded — loading/error/data always describe the newest request. A
  response arriving after the owner was disposed writes nothing.
- **A3. `data()` never throws.** Unlike Solid (which throws for error
  boundaries vint doesn't have), errors land only in `data.error`. Check it.

## E — Errors are prompts

Dev-mode assertions are a feature. Every error/warning names what happened and
states the fix in imperative form. The canonical messages live in
`src/dev.ts`; the codes: **E-LOOP** (effect re-triggers itself endlessly),
**E-WRITE-IN-MEMO** (signal written inside a memo — memos must be pure),
**E-CIRCULAR-MEMO** (memo reads itself), **E-DISPOSED-MEMO** (read of a memo
whose owner was disposed), **E-NO-OWNER** (warn: computation created outside
any root is never disposed), **E-FOR-ARRAY**, **E-FOR-DUPKEY**,
**E-FOR-SAMEREF**.

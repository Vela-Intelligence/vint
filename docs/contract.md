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
  earlier render phase of each flush; DOM bindings use it. At every point in a
  flush, pending render effects run before the next user effect — so when a
  user effect writes a DOM-bound signal, the DOM is updated before any later
  user effect runs.
- **R8. Writes during a flush are safe.** An effect writing an unrelated signal
  queues the dependent effects into the *same* flush; chains (a→b→c) settle in
  one flush with each effect running once. Nothing is ever silently dropped or
  wedged. An effect that endlessly re-triggers itself is detected and throws
  error E-LOOP naming the effect; the offending effect is skipped for the
  remainder of that flush and resumes on the next write to one of its
  dependencies (each flush it loops in reports E-LOOP again until the loop is
  fixed — it is never silently killed).
- **R9. `batch(fn)`.** Writes inside apply immediately (reads see new values,
  memos read inside are freshly validated), but effects run once, after the
  outermost batch exits. Nested batches flush only at the outermost exit.
  Every `set` outside a batch flushes synchronously.
- **R10. Errors don't corrupt the graph.** An effect that throws is skipped for
  that flush; every other queued effect still runs; the error (or an
  `AggregateError` for several) is rethrown after the flush completes. The
  system remains fully usable afterwards. A memo whose `fn` throws stays
  invalid — the next read retries the computation (it never silently returns
  a stale value), and a later write to one of its dependencies re-notifies
  its observers: a memo error never permanently detaches downstream effects.
  *Where* that error surfaces depends on who reads the memo. A direct,
  top-level read receives the throw at the read site. When the reader is a
  queued computation, the memo is recomputed while that computation's
  dependencies are being validated — before its body runs — so the error
  surfaces from the flush (per the effect rules above) and a `try`/`catch`
  written *inside* the effect never sees it. Guard the fetch, not the read.
  If a `batch` (or `createRoot`) body
  throws and the flush it triggers also throws, neither error is lost — they
  are combined into an `AggregateError`. One caveat for effects: a throwing
  run keeps only the dependencies it read *before* the throw; an effect that
  throws before reading anything will not re-run.
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
  Placeholder `display:none` divs are never needed. A binding reconciles the
  *live* contents of its range: nodes that nested regions (such as `For` rows)
  insert into the range after a run are still replaced correctly on the next
  run — nothing is orphaned. If the markers themselves leave the DOM (the
  containing node was removed or moved outside vint), the binding can no
  longer render and warns E-BIND-DETACHED in dev.
- **D4. Arrays stay live.** A function child returning an array (including
  nested functions inside it) is re-normalized on every run — it never goes
  inert. Functions nested inside a returned array are tracked by the same
  binding (coarse-grained); give a child its own function position for
  fine-grained updates.
- **D5. Node identity is respected.** If a run returns the same node(s) as the
  previous run, identical leading and trailing runs are left untouched — focus,
  selection, and media state survive there. A kept node whose *position within
  the changed middle* moved is detached and reinserted (order is always
  correct); use `For` for reorder-heavy lists where per-row state must
  survive moves (C2). A string/number result reuses the text node the binding
  itself created, updating its data in place; a `Text` node *you* created and
  returned is treated as a node — replaced, never mutated.
- **D6. Props: settable property wins.** For each key, if the element (or its
  prototype chain) has a settable property of that name, the value is assigned
  as a property; otherwise it is set as an attribute (`true` → empty
  attribute, `false`/`null`/`undefined` → attribute removed). Force the
  routing with `"prop:name"` or `"attr:name"`. This is what makes Lit/custom
  elements (`vi-*`) work as plain tags. A `__proto__` key is ignored (with a
  dev warning) — it can never reach the element.
- **D7. Reactive props.** A function-valued prop (that is not an event
  handler, and not `prop:`-prefixed — see D8) is a live binding:
  `class: () => active() ? "on" : ""`. A signal getter passed directly
  (`value: title`) is the same thing. `style` accepts a string or an object
  (camelCase keys converted; `null` removes). Reactive style objects are
  diffed per run: keys the binding set previously and no longer returns are
  removed; style properties set outside the binding are left alone. A
  reactive binding is called with NO arguments — a function that declares
  parameters under a non-event prop key was almost certainly meant as a
  callback VALUE (a Lit formatter, a renderer): dev warns E-CALLBACK-PROP,
  prescribing `prop:` (D8), and the seam this guards is exactly
  custom-element function properties. There is no
  `classList` (E-NO-CLASSLIST, always on) and no `ref` (E-NO-REF, always on):
  classes are one computed `class` string, and the tag call already returns
  the element.
- **D8. Events.** A function under an `on*` key is added once with
  `addEventListener` — `onclick` → "click" (lowercased), and `"on:vi-change"`
  → "vi-change" (exact name, for custom-element events). Listeners live
  exactly as long as the element. Event props are not reactive — swap
  behavior inside the handler, not by swapping handlers. Corollaries: ANY
  function under a key starting with "on" becomes a listener, so a
  function-valued property that happens to start with "on" (e.g. `online`)
  needs `prop:online`; a non-function value under an `on*` key is skipped
  with a dev warning (E-EVENT-VALUE), never assigned or set as an attribute.
  A function under a `prop:` key is assigned as-is — `prop:` is the one way
  to store a function *as a property value*, and is therefore never treated
  as a reactive binding (`attr:` keys, where a function value is meaningless
  as data, stay reactive).
- **D9. `mount(container, view) → dispose`.** Calls `view()` once (R1) under a
  new root, appends the result, returns a disposer that tears down every
  computation and removes the mounted DOM. "Every" is literal: when the
  view's own top-level child is a live binding (`Show`, `For`, a bare
  accessor, an array containing a function), the content that binding renders
  *after* mount returns is removed too — the disposer runs the bindings'
  own teardown before removing what it appended itself. One `mount` per app
  is the norm. `container` must be an `Element` or a `ShadowRoot`/
  `DocumentFragment` — anything else (including `null` and `document`) is
  E-MOUNT-CONTAINER (always on). Passing a node instead of a function as
  `view` is E-MOUNT-VIEW (always on).
- **D10. Untrusted data.** Children are XSS-safe by construction: every child
  value becomes a text node or an appended node — no string is ever parsed as
  HTML in the children path. Render untrusted data ONLY as children/text
  bindings. Props are not safe by construction: `innerHTML`, `outerHTML`, and
  `srcdoc` parse strings as HTML (dev warning E-RAW-HTML when used); `href`/
  `src`/`action` accept `javascript:` URLs — allow only http(s)/mailto/tel/
  relative, and a `javascript:`, `vbscript:`, or non-image `data:` value on
  one of those keys is a dev warning (E-URL-SCHEME) that still assigns;
  a `style` string is CSS injection surface; spreading an
  untrusted object into props hands the attacker the KEYS (never do it); and
  tag names must never be derived from data (`tags[userString]` can create a
  script element).

## C — Control flow

- **C1. `Show({ when, fallback?, children })`.** `when` must be a FUNCTION —
  unlike Solid's JSX, where the compiler wraps a bare expression, nothing
  wraps it here, so a value would freeze the branch forever: E-SHOW-WHEN
  (always on). `children` and `fallback` are
  thunks (`() => Child`), built lazily; a non-function under either is
  E-CHILDREN-FN (always on). `children` may instead take one
  parameter — `(item) => Child` — and receives an accessor for the narrowed
  `when` value (modern Solid's non-keyed callback form). The accessor is
  passed on *every* call — a thunk simply ignores it — so callbacks written
  with default or rest parameters receive it too. The branch is keyed
  on `Boolean(when())`: truthy→truthy value changes never rebuild; only a
  real flip tears down one branch (running its cleanups) and builds the
  other — render current values via bindings (or the item accessor), not by
  closure.
- **C2. `For({ each, key?, children, fallback? })`.** `each` must be a
  function returning an array — E-FOR-ARRAY at construction, and
  E-FOR-EACH-RESULT (always on, even in prod) if `each()` returns a
  non-array at runtime. **UNLIKE Solid's For, `children(item, index)`
  receives two ACCESSORS** — call `item()` to get the value — and is called
  once per key, not per render. Rows are reconciled by key (default: item
  reference identity; pass `key: t => t.id` for object rows). Existing rows
  keep their DOM nodes: removals leave no holes, and reorders move as FEW
  rows as possible — a row whose position relative to the other retained
  rows is unchanged is never re-inserted, so focus, selection, and IME
  state inside it survive. A same-keyed replacement updates
  the row in place through `item()`. Removed rows are disposed (cleanups
  run, subscriptions detach). `fallback` (a thunk) renders while the list is
  empty. `children` and `fallback` must be functions — E-CHILDREN-FN
  (always on) otherwise. Duplicate keys are an error (E-FOR-DUPKEY, always on) detected
  *before* any row is touched — the For stays intact and renders correctly
  once the data is fixed.
- **C3. `Switch({ fallback?, children: [Match, ...] })` / `Match({ when,
  children })`.** First truthy `Match` wins; `Match` children are thunks. A
  change that doesn't alter which branch wins does not rebuild. `Match`es
  after the current winner are not even tracked. `Switch`'s `children` must
  be an array (E-SWITCH-ARRAY otherwise, always on) and its optional
  `fallback` a function (E-CHILDREN-FN). Each `Match`'s `when` must be a
  FUNCTION for the same reason as C1's — E-MATCH-WHEN (always on) — and its
  `children` a thunk (E-CHILDREN-FN, always on).

## A — Async

- **A1. `createResource(source?, fetcher) → [data, { refetch, mutate }]`.**
  `fetcher(sourceValue, { value, refetching })` returns a promise (or a
  value). The first fetch starts synchronously at creation — `data.loading`
  is `true` in the component body, like Solid. `data()` is a tracked accessor
  (`undefined` until first success); `data.loading` and `data.error` are
  tracked. Source is an accessor: when its value changes, the resource
  refetches; `false`/`null`/`undefined` skips fetching. `refetch(info?)`
  returns a promise that settles when that fetch does.
- **A2. Last fetch wins — and a falsy source cancels interest.** A response
  arriving after a newer fetch started is discarded — loading/error/data
  always describe the newest request. When the source turns falsy, any
  in-flight response is discarded and `loading` resets to false. Disposal
  cancels interest the same way: an in-flight response writes nothing,
  `loading` resets to false, and `refetch()` after dispose is a no-op that
  resolves to `undefined` — the fetcher is not called. A source change at any
  point after creation refetches, including one made later in the same root
  body or batch that created the resource.
- **A3. `data()` never throws — and fetcher errors never escape.** Unlike
  Solid (which throws for error boundaries vint doesn't have), all fetcher
  failures — rejected promises AND synchronous throws — land only in
  `data.error`. Check it.

## E — Errors are prompts

Assertions are a feature. Every error/warning names what happened and states
the fix in imperative form. The canonical messages live in `src/dev.ts`.

**DEV matrix.** The vendored bundle (`dist/vint.js`) ships with DEV **on** —
assertions are the product; there is no separate prod bundle. Under Vite, DEV
follows `import.meta.env.DEV` (on in dev, off in production builds). Checks
marked *(always)* below run regardless of DEV, because losing them degrades a
prescriptive error into a raw TypeError or a silent corruption.

Codes: **E-LOOP** *(always)* (effect re-triggers itself endlessly),
**E-WRITE-IN-MEMO** (signal written inside a memo), **E-CIRCULAR-MEMO**,
**E-DISPOSED-MEMO** (read of a memo whose owner was disposed),
**E-NO-OWNER** (warn: computation created outside any root),
**E-SAMEREF-SET** (warn: setter got the same array instance it holds — the
set is a no-op; update immutably), **E-FOR-ARRAY** (each isn't a function),
**E-FOR-EACH-RESULT** *(always)* (each() returned a non-array),
**E-FOR-DUPKEY** *(always)*, **E-FOR-SAMEREF** (warn, `equals:false` path),
**E-FOR-ITEM-ACCESS** (warn: property read on the item accessor — call
item() first), **E-FOR-DETACHED** (warn: For's markers left the DOM outside
vint), **E-BIND-DETACHED** (warn: a live binding's markers left the DOM
outside vint), **E-SWITCH-ARRAY** *(always)*, **E-SHOW-WHEN** *(always)*
(Show's `when` is a value, not an accessor), **E-MATCH-WHEN** *(always)*
(same for Match), **E-CHILDREN-FN** *(always)* (a built element where a
thunk belongs), **E-NO-REF** *(always)*,
**E-NO-CLASSLIST** *(always)*, **E-MOUNT-VIEW** *(always)*,
**E-MOUNT-CONTAINER** *(always)* (container is not an element),
**E-URL-SCHEME** (warn: `javascript:`/`vbscript:`/non-image `data:` on
`href`/`src`/`action`),
**E-CALLBACK-PROP** (warn: argument-taking function under a non-event
prop key — a callback value needs `prop:`, bindings take no arguments),
**E-RAW-HTML** (warn: innerHTML/outerHTML/srcdoc prop),
**E-PROTO-KEY** (warn: `__proto__` prop key skipped),
**E-EVENT-VALUE** (warn: non-function under an on* key, skipped).

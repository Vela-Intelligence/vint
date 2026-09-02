/**
 * vint reactive core — Solid 1.x-style three-state mark-and-pull scheduler.
 *
 * Push phase: a signal write marks its downstream graph (memos → CHECK/DIRTY,
 * effects → queued). Pull phase: effects (and memo reads) lazily validate
 * memos via updateIfNecessary, so a computation never observes a stale memo
 * (contract R6) and memos are never queued at all.
 *
 * Clause numbers in comments refer to docs/contract.md.
 */

import { DEV, LOOP_LIMIT, named, vintError, vintWarn } from "./dev"

export type Accessor<T> = () => T
export type Setter<T> = (value: T | ((prev: T) => T)) => T

export interface SignalOptions<T> {
  equals?: false | ((a: T, b: T) => boolean)
  name?: string
}

const CLEAN = 0
const CHECK = 1
const DIRTY = 2
type NodeState = 0 | 1 | 2

interface SignalNode<T> {
  kind: "signal"
  value: T
  equals: (a: T, b: T) => boolean
  observers: ComputationNode[]
  observerSlots: number[]
  name: string | undefined
}

interface ComputationNode {
  kind: "memo" | "render" | "user" | "owner"
  fn: ((prev: unknown) => unknown) | null
  value: unknown
  state: NodeState
  sources: Array<SignalNode<unknown> | ComputationNode>
  sourceSlots: number[]
  observers: ComputationNode[]
  observerSlots: number[]
  equals: ((a: unknown, b: unknown) => boolean) | null
  owner: ComputationNode | null
  owned: ComputationNode[] | null
  cleanups: Array<() => void> | null
  disposed: boolean
  queued: boolean
  computing: boolean
  loopRuns: number
  loopEpoch: number
  name: string | undefined
}

/** Opaque owner handle (getOwner/runWithOwner). */
export type Owner = ComputationNode

const NODE = Symbol("vint.node")

let CurrentOwner: ComputationNode | null = null
let Listener: ComputationNode | null = null
let batchDepth = 0
let flushing = false
let flushEpoch = 0
const renderQueue: ComputationNode[] = []
const userQueue: ComputationNode[] = []

const refEquals = (a: unknown, b: unknown) => a === b

// ---------------------------------------------------------------------------
// Graph edges (Solid's paired-array slot trick: O(1) detach, invariant I1:
// sources[i].observers[sourceSlots[i]] === this, and symmetrically back)
// ---------------------------------------------------------------------------

function track(source: SignalNode<unknown> | ComputationNode): void {
  const listener = Listener
  if (!listener || listener.disposed) return
  source.observers.push(listener)
  source.observerSlots.push(listener.sources.length)
  listener.sources.push(source)
  listener.sourceSlots.push(source.observers.length - 1)
}

function detachSources(node: ComputationNode): void {
  while (node.sources.length) {
    const source = node.sources.pop() as SignalNode<unknown> | ComputationNode
    const slot = node.sourceSlots.pop() as number
    const observers = source.observers
    if (observers.length) {
      const lastObserver = observers.pop() as ComputationNode
      const lastSlot = source.observerSlots.pop() as number
      if (slot < observers.length) {
        // move the popped tail edge into our vacated slot and fix its back-pointer
        observers[slot] = lastObserver
        source.observerSlots[slot] = lastSlot
        lastObserver.sourceSlots[lastSlot] = slot
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Ownership (contract O1–O5)
// ---------------------------------------------------------------------------

/**
 * Per-run scope reset (O2): before every run — and on dispose — detach all
 * source edges, dispose computations created during the previous run, and run
 * that run's cleanups (LIFO). Ends with state = CLEAN so that a write landing
 * *during* the run marks the node DIRTY again and re-queues it (R8).
 */
function cleanNode(node: ComputationNode): void {
  detachSources(node)
  if (node.owned) {
    const owned = node.owned
    node.owned = null // detach first so children's self-removal skips this array
    for (let i = owned.length - 1; i >= 0; i--) disposeNode(owned[i] as ComputationNode)
  }
  if (node.cleanups) {
    const cleanups = node.cleanups
    node.cleanups = null
    for (let i = cleanups.length - 1; i >= 0; i--) (cleanups[i] as () => void)()
  }
  node.state = CLEAN
}

/** @internal Total and idempotent disposal (O5). */
export function disposeNode(node: ComputationNode): void {
  if (node.disposed) return
  node.disposed = true
  // unhook from the owner so long-lived owners don't accumulate dead children
  const owner = node.owner
  if (owner?.owned) {
    const i = owner.owned.indexOf(node)
    if (i >= 0) {
      owner.owned[i] = owner.owned[owner.owned.length - 1] as ComputationNode
      owner.owned.pop()
    }
  }
  cleanNode(node)
}

function createComputation(
  fn: ((prev: unknown) => unknown) | null,
  initial: unknown,
  kind: ComputationNode["kind"],
  equals: ((a: unknown, b: unknown) => boolean) | null,
  name: string | undefined,
): ComputationNode {
  const node: ComputationNode = {
    kind,
    fn,
    value: initial,
    state: DIRTY,
    sources: [],
    sourceSlots: [],
    observers: [],
    observerSlots: [],
    equals,
    owner: CurrentOwner,
    owned: null,
    cleanups: null,
    disposed: false,
    queued: false,
    computing: false,
    loopRuns: 0,
    loopEpoch: -1,
    name,
  }
  if (CurrentOwner) (CurrentOwner.owned ??= []).push(node)
  else if (DEV && kind !== "owner")
    vintWarn("E-NO-OWNER", `a ${kind === "memo" ? "memo" : "effect"}${named(name)}`)
  return node
}

export function createRoot<T>(fn: (dispose: () => void) => T): T {
  // Detached owner (O3): the caller owns disposal. Effects created in the
  // body are deferred (batchDepth) and flush when the body completes.
  const prevOwner = CurrentOwner
  const prevListener = Listener
  CurrentOwner = null // detach: the root must not join the enclosing owner tree
  const root = createComputation(null, undefined, "owner", null, "root")
  CurrentOwner = root
  Listener = null
  batchDepth++
  try {
    return fn(() => disposeNode(root))
  } finally {
    CurrentOwner = prevOwner
    Listener = prevListener
    batchDepth--
    maybeFlush()
  }
}

/** @internal Owner scope attached to the current owner (For rows). */
export function createScope<T>(fn: () => T): [T, () => void] {
  const scope = createComputation(null, undefined, "owner", null, "scope")
  const prevOwner = CurrentOwner
  const prevListener = Listener
  CurrentOwner = scope
  Listener = null
  try {
    return [fn(), () => disposeNode(scope)]
  } finally {
    CurrentOwner = prevOwner
    Listener = prevListener
  }
}

export function onCleanup(fn: () => void): void {
  if (CurrentOwner) (CurrentOwner.cleanups ??= []).push(fn)
  else if (DEV) vintWarn("E-NO-OWNER", "an onCleanup callback")
}

export function getOwner(): Owner | null {
  return CurrentOwner
}

export function runWithOwner<T>(owner: Owner | null, fn: () => T): T {
  const prevOwner = CurrentOwner
  const prevListener = Listener
  CurrentOwner = owner
  Listener = null
  try {
    return fn()
  } finally {
    CurrentOwner = prevOwner
    Listener = prevListener
  }
}

export function untrack<T>(fn: () => T): T {
  const prev = Listener
  Listener = null
  try {
    return fn()
  } finally {
    Listener = prev
  }
}

// ---------------------------------------------------------------------------
// Scheduler (contract R6–R10)
// ---------------------------------------------------------------------------

function maybeFlush(): void {
  if (batchDepth === 0 && !flushing) flush()
}

export function batch<T>(fn: () => T): T {
  batchDepth++
  try {
    return fn()
  } finally {
    batchDepth--
    maybeFlush()
  }
}

function mark(node: ComputationNode, state: NodeState): void {
  if (node.disposed || node.state >= state) return
  node.state = state
  if (node.kind === "memo") {
    // downstream only *might* change — memo may recompute equal (R5)
    for (let i = 0; i < node.observers.length; i++) mark(node.observers[i] as ComputationNode, CHECK)
  } else if (node.kind === "render" || node.kind === "user") {
    if (!node.queued) {
      node.queued = true
      ;(node.kind === "render" ? renderQueue : userQueue).push(node)
    }
  }
}

function flush(): void {
  flushing = true
  flushEpoch++
  const errors: unknown[] = []
  try {
    // render effects run before the NEXT user effect at every point (R7):
    // the user queue yields back here whenever render work appears mid-run
    while (renderQueue.length || userQueue.length) {
      if (renderQueue.length) runQueue(renderQueue, errors, false)
      else runQueue(userQueue, errors, true)
    }
  } finally {
    flushing = false
    renderQueue.length = 0
    userQueue.length = 0
  }
  if (errors.length === 1) throw errors[0]
  if (errors.length > 1) throw new AggregateError(errors, `${errors.length} effects threw during flush`)
}

function runQueue(queue: ComputationNode[], errors: unknown[], yieldToRender: boolean): void {
  // Index iteration over a queue that MAY GROW while we walk it: effects
  // marked during the flush run in this same flush — never dropped (R8,
  // regression: prototype bug #1).
  for (let i = 0; i < queue.length; i++) {
    const node = queue[i] as ComputationNode
    node.queued = false // before running, so a self-mark re-queues (I2)
    if (!node.disposed) {
      // dispose-during-flush skips silently (O5)
      if (node.loopEpoch !== flushEpoch) {
        node.loopEpoch = flushEpoch
        node.loopRuns = 0
      }
      if (++node.loopRuns > LOOP_LIMIT) {
        // self-feeding effect: report once, stop running it this flush (R8)
        if (node.loopRuns === LOOP_LIMIT + 1) errors.push(vintError("E-LOOP", named(node.name)))
        continue
      }
      try {
        updateIfNecessary(node)
      } catch (err) {
        errors.push(err) // one bad effect never skips the rest (R10)
      }
    }
    // R7: a user effect that produced render work yields so DOM bindings
    // settle before the next user effect runs
    if (yieldToRender && renderQueue.length) {
      queue.splice(0, i + 1)
      return
    }
  }
  queue.length = 0
}

/**
 * Pull-phase validation. CHECK means "an upstream memo might have changed":
 * recompute those memos first; only if one actually changed (it promotes us
 * to DIRTY) do we run. This is what makes diamonds glitch-free (R6) and lets
 * memo equality stop downstream work (R5).
 */
function updateIfNecessary(node: ComputationNode): void {
  if (node.state === CHECK) {
    for (let i = 0; i < node.sources.length; i++) {
      const source = node.sources[i] as SignalNode<unknown> | ComputationNode
      if ((source as ComputationNode).kind === "memo") {
        updateIfNecessary(source as ComputationNode)
        if ((node.state as NodeState) === DIRTY) break
      }
    }
    if (node.state === CHECK) node.state = CLEAN // every upstream memo resolved equal
  }
  if (node.state === DIRTY) updateNode(node)
}

function updateNode(node: ComputationNode): void {
  cleanNode(node) // per-run scope (O2); leaves state CLEAN so self-marks re-queue
  const prevOwner = CurrentOwner
  const prevListener = Listener
  CurrentOwner = node
  Listener = node
  node.computing = true
  let next: unknown
  try {
    next = (node.fn as (prev: unknown) => unknown)(node.value)
  } catch (err) {
    // R10: a throwing memo stays invalid — the next read retries instead of
    // silently returning the stale value cleanNode's CLEAN reset would allow.
    if (node.kind === "memo") node.state = DIRTY
    throw err
  } finally {
    node.computing = false
    CurrentOwner = prevOwner
    Listener = prevListener
  }
  if (node.kind === "memo") {
    if (!(node.equals as (a: unknown, b: unknown) => boolean)(node.value, next)) {
      node.value = next
      // Direct CHECK→DIRTY promotion of observers: the single line that makes
      // equality gating in diamonds correct (contract R5/R6). Everything
      // downstream was already queued at mark time — no queueing here.
      for (let i = 0; i < node.observers.length; i++) {
        const observer = node.observers[i] as ComputationNode
        if (!observer.disposed) observer.state = DIRTY
      }
    }
  } else {
    node.value = next
  }
}

// ---------------------------------------------------------------------------
// Public primitives (contract R4, R5, R7, R11, O4)
// ---------------------------------------------------------------------------

export function createSignal<T>(value: T, options?: SignalOptions<T>): [Accessor<T>, Setter<T>] {
  const equals =
    options?.equals === false ? () => false : (options?.equals ?? (refEquals as (a: T, b: T) => boolean))
  const node: SignalNode<T> = {
    kind: "signal",
    value,
    equals,
    observers: [],
    observerSlots: [],
    name: options?.name,
  }
  const read: Accessor<T> = () => {
    if (Listener) track(node as SignalNode<unknown>)
    return node.value
  }
  ;(read as Accessor<T> & { [NODE]: unknown })[NODE] = node
  const write: Setter<T> = (value) => {
    const next = typeof value === "function" ? (value as (prev: T) => T)(node.value) : value
    if (node.equals(node.value, next)) {
      // The push-then-set footgun: same array instance back means any in-place
      // mutation is invisible — the set is a no-op. Warn prescriptively.
      if (DEV && Array.isArray(next) && (next as unknown) === (node.value as unknown)) {
        vintWarn("E-SAMEREF-SET")
      }
      return node.value
    }
    if (DEV && Listener?.kind === "memo" && Listener.computing) {
      throw vintError("E-WRITE-IN-MEMO", named(Listener.name))
    }
    node.value = next
    for (let i = 0; i < node.observers.length; i++) mark(node.observers[i] as ComputationNode, DIRTY)
    maybeFlush()
    return next
  }
  return [read, write]
}

export function createMemo<T>(
  fn: (prev: T | undefined) => T,
  initial?: T,
  options?: SignalOptions<T>,
): Accessor<T> {
  const equals =
    options?.equals === false ? () => false : (options?.equals ?? (refEquals as (a: T, b: T) => boolean))
  const node = createComputation(
    fn as (prev: unknown) => unknown,
    initial,
    "memo",
    equals as (a: unknown, b: unknown) => boolean,
    options?.name ?? (fn.name || undefined),
  )
  updateNode(node) // computed once at creation (R5)
  const read: Accessor<T> = () => {
    if (node.disposed) {
      if (DEV) throw vintError("E-DISPOSED-MEMO", named(node.name))
      return node.value as T
    }
    if (DEV && node.computing) throw vintError("E-CIRCULAR-MEMO", named(node.name))
    if (node.state !== CLEAN) updateIfNecessary(node)
    if (Listener) track(node)
    return node.value as T
  }
  ;(read as Accessor<T> & { [NODE]: unknown })[NODE] = node
  return read
}

export function createEffect<T>(fn: (prev: T | undefined) => T | void, initial?: T): void {
  scheduleEffect(
    createComputation(fn as (prev: unknown) => unknown, initial, "user", null, fn.name || undefined),
  )
}

/** Like createEffect but runs in the earlier render phase (DOM bindings). */
export function createRenderEffect<T>(fn: (prev: T | undefined) => T | void, initial?: T): void {
  scheduleEffect(
    createComputation(fn as (prev: unknown) => unknown, initial, "render", null, fn.name || undefined),
  )
}

function scheduleEffect(node: ComputationNode): void {
  node.queued = true
  ;(node.kind === "render" ? renderQueue : userQueue).push(node)
  maybeFlush()
}

/** Runs once, untracked, after the enclosing body's render effects (O4). */
export function onMount(fn: () => void): void {
  createEffect(() => untrack(fn))
}

export function on<T, U>(
  deps: Accessor<T>,
  fn: (input: T, prevInput: T | undefined, prevValue: U | undefined) => U,
  options?: { defer?: boolean },
): (prevValue: U | undefined) => U | undefined
export function on<T extends readonly Accessor<unknown>[], U>(
  deps: readonly [...T],
  fn: (
    input: { [K in keyof T]: T[K] extends Accessor<infer V> ? V : never },
    prevInput: { [K in keyof T]: T[K] extends Accessor<infer V> ? V : never } | undefined,
    prevValue: U | undefined,
  ) => U,
  options?: { defer?: boolean },
): (prevValue: U | undefined) => U | undefined
export function on(
  deps: Accessor<unknown> | ReadonlyArray<Accessor<unknown>>,
  // loose impl signature — the overloads above are the real contract
  // biome-ignore lint/suspicious/noExplicitAny: overload erasure
  fn: (input: any, prevInput: any, prevValue: any) => unknown,
  options?: { defer?: boolean },
): (prevValue: unknown) => unknown {
  const isArray = Array.isArray(deps)
  let prevInput: unknown
  let defer = options?.defer ?? false
  return (prevValue) => {
    const input = isArray
      ? (deps as ReadonlyArray<Accessor<unknown>>).map((d) => d())
      : (deps as Accessor<unknown>)()
    if (defer) {
      defer = false
      return undefined
    }
    const result = untrack(() => fn(input, prevInput, prevValue))
    prevInput = input
    return result
  }
}

// ---------------------------------------------------------------------------
// Test-only introspection (not exported from index.ts)
// ---------------------------------------------------------------------------

/** @internal White-box helper for leak tests: live observer count of a signal or memo. */
export function __observerCount(accessor: Accessor<unknown>): number {
  const node = (accessor as Accessor<unknown> & { [NODE]?: { observers: unknown[] } })[NODE]
  return node ? node.observers.length : 0
}

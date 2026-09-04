/**
 * vint reactive core — Solid 1.x-style three-state mark-and-pull scheduler.
 *
 * Push phase: a signal write marks its downstream graph (memos → CHECK/DIRTY,
 * effects → queued). Pull phase: effects (and memo reads) lazily validate
 * memos via updateIfNecessary, so a computation never observes a stale memo
 * (contract R6) and memos are never queued at all.
 *
 * Two structural rules hold the scheduler together (assessment §8, Phase 2):
 *
 *  - ONE GATE. Every entry point that can create or trigger work — a signal
 *    write, a batch, a root body, a memo's creation, a stale memo read at
 *    top level — passes through runUpdates(), which defers effects until the
 *    outermost entry returns. "Never mid-computation" (R7) is therefore a
 *    property of the gate, not of each call site.
 *
 *  - INVARIANT I3. For every live memo M that is not CLEAN and not `aborted`,
 *    every observer of M is at least CHECK and every effect downstream is
 *    queued. mark() relies on it: a node already at the target state is
 *    assumed to have queued observers, so it stops walking. Every path that
 *    ABORTS a node's processing (a memo throwing, an upstream throw unwinding
 *    through validation, an E-LOOP skip) breaks that assumption, so every
 *    such path sets `aborted`, and mark() re-walks an aborted node's
 *    observers instead of stopping. The property suite checks I3 white-box.
 *
 * Clause numbers in comments refer to docs/contract.md.
 */

import { DEV, LOOP_LIMIT, named, vintDevError, vintError, vintWarn } from "./dev"

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
  /** Index of this node in owner.owned — O(1) unlink on dispose (O1). */
  ownerSlot: number
  owned: ComputationNode[] | null
  cleanups: Array<() => void> | null
  disposed: boolean
  queued: boolean
  computing: boolean
  /** Processing of this node was cut short (throw, loop skip): its observers
   *  may not be queued, so mark() must re-walk them (invariant I3). */
  aborted: boolean
  /** A memo that has produced a value at least once; the first compute
   *  assigns unconditionally, bypassing `equals` (R5). */
  computed: boolean
  loopRuns: number
  loopEpoch: number
  /** Flush in which this memo last threw: it rethrows `lastError` to every
   *  further pull in that flush instead of recomputing — "the next read
   *  retries" means the next flush, and one failure is one error object,
   *  however many observers (or re-runs) it reaches; flush() dedupes. */
  erroredEpoch: number
  lastError: unknown
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
/** Next unprocessed user-queue entry: the user queue yields to render work
 *  mid-run (R7), and resuming from a cursor keeps a flush of n yields O(n). */
let userHead = 0

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

function combine(errors: unknown[], what: string): unknown {
  return errors.length === 1 ? errors[0] : new AggregateError(errors, `${errors.length} ${what}`)
}

/**
 * Per-run scope reset (O2): before every run — and on dispose — detach all
 * source edges, dispose computations created during the previous run, and run
 * that run's cleanups (LIFO). Ends with state = CLEAN so that a write landing
 * *during* the run marks the node DIRTY again and re-queues it (R8).
 *
 * TOTAL (O2/O5): a throwing cleanup or child never stops the rest. Errors are
 * collected into `errors` when the caller passes one, otherwise thrown once
 * at the end (an AggregateError if several) — after the reset is complete.
 */
function cleanNode(node: ComputationNode, errors?: unknown[]): void {
  const errs = errors ?? []
  detachSources(node)
  if (node.owned) {
    const owned = node.owned
    node.owned = null // detach first so children's self-removal skips this array
    for (let i = owned.length - 1; i >= 0; i--) disposeNode(owned[i] as ComputationNode, errs)
  }
  if (node.cleanups) {
    const cleanups = node.cleanups
    node.cleanups = null
    // the owner stays active while its cleanups run, so an onCleanup
    // registered inside a cleanup lands here and runs on the next reset
    const prevOwner = CurrentOwner
    const prevListener = Listener
    CurrentOwner = node
    Listener = null
    try {
      for (let i = cleanups.length - 1; i >= 0; i--) {
        try {
          ;(cleanups[i] as () => void)()
        } catch (err) {
          errs.push(err)
        }
      }
    } finally {
      CurrentOwner = prevOwner
      Listener = prevListener
    }
  }
  node.state = CLEAN
  node.aborted = false
  if (!errors && errs.length) throw combine(errs, "cleanups threw")
}

/** @internal Total and idempotent disposal (O5). */
export function disposeNode(node: ComputationNode, errors?: unknown[]): void {
  if (node.disposed) return
  node.disposed = true
  // unhook from the owner so long-lived owners don't accumulate dead children
  const owner = node.owner
  if (owner?.owned) {
    const owned = owner.owned
    const last = owned.pop() as ComputationNode
    if (last !== node) {
      owned[node.ownerSlot] = last
      last.ownerSlot = node.ownerSlot
    }
  }
  cleanNode(node, errors)
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
    ownerSlot: -1,
    owned: null,
    cleanups: null,
    disposed: false,
    queued: false,
    computing: false,
    aborted: false,
    computed: false,
    loopRuns: 0,
    loopEpoch: -1,
    erroredEpoch: -1,
    lastError: undefined,
    name,
  }
  if (CurrentOwner) {
    if (CurrentOwner.disposed) {
      // O5: nothing created here could ever be cleaned up. Loud in dev;
      // in prod the node is born disposed and never runs.
      if (DEV) {
        throw vintDevError(
          "E-DISPOSED-OWNER",
          `${kind === "memo" ? "a memo" : "an effect"}${named(name)}`,
        )
      }
      node.disposed = true
      node.owner = null
      return node
    }
    const owned = (CurrentOwner.owned ??= [])
    node.ownerSlot = owned.length
    owned.push(node)
  } else if (DEV && kind !== "owner") {
    vintWarn("E-NO-OWNER", `${kind === "memo" ? "a memo" : "an effect"}${named(name)}`)
  }
  return node
}

export function createRoot<T>(fn: (dispose: () => void) => T): T {
  // Detached owner (O3): the caller owns disposal. Effects created in the
  // body are deferred by the gate and flush when the body completes.
  const prevOwner = CurrentOwner
  const prevListener = Listener
  CurrentOwner = null // detach: the root must not join the enclosing owner tree
  const root = createComputation(null, undefined, "owner", null, "root")
  CurrentOwner = root
  Listener = null
  try {
    return runUpdates(() => fn(() => runUpdates(() => disposeNode(root), "dispose")), "createRoot")
  } finally {
    CurrentOwner = prevOwner
    Listener = prevListener
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
    return [fn(), () => runUpdates(() => disposeNode(scope), "dispose")]
  } catch (err) {
    // a builder that throws leaves no half-built scope behind (C2, O5)
    disposeNode(scope)
    throw err
  } finally {
    CurrentOwner = prevOwner
    Listener = prevListener
  }
}

export function onCleanup(fn: () => void): void {
  const owner = CurrentOwner
  if (!owner) {
    if (DEV) vintWarn("E-NO-OWNER", "an onCleanup callback")
    return
  }
  if (owner.disposed) {
    // O5: the owner will never reset again — run the teardown now
    if (DEV) throw vintDevError("E-DISPOSED-OWNER", "an onCleanup callback")
    fn()
    return
  }
  ;(owner.cleanups ??= []).push(fn)
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

/**
 * THE gate (R7, R9). Work created inside `fn` — effects scheduled, nodes
 * marked — is deferred until the outermost gate returns, then flushed once.
 * Inside an open gate (a batch, a root body, a flush in progress) it is a
 * plain call: the enclosing gate flushes.
 */
function runUpdates<T>(fn: () => T, what: string): T {
  if (batchDepth > 0 || flushing) return fn()
  batchDepth++
  let result: T
  try {
    result = fn()
  } catch (err) {
    batchDepth--
    exitFlushAfterBodyError(err, what)
    throw err // exitFlushAfterBodyError throws first if the flush also threw
  }
  batchDepth--
  flush()
  return result
}

function maybeFlush(): void {
  if (batchDepth === 0 && !flushing) flush()
}

export function batch<T>(fn: () => T): T {
  return runUpdates(fn, "batch")
}

/** R10: a body error and a flush error must both surface — JS finally
 *  semantics would silently discard the body's. Throws an AggregateError
 *  when both threw; returns (caller rethrows the body error) otherwise. */
function exitFlushAfterBodyError(bodyError: unknown, what: string): void {
  try {
    maybeFlush()
  } catch (flushError) {
    throw new AggregateError([bodyError, flushError], `${what} body and flush both threw`)
  }
}

function mark(node: ComputationNode, state: NodeState): void {
  if (node.disposed) return
  // a memo whose dependency changed may recompute again this flush — it is
  // already DIRTY after a throw, so this sits outside the transition guard
  if (node.kind === "memo" && state === DIRTY) node.erroredEpoch = -1
  if (node.state < state || node.aborted) {
    // Invariant I3: a node already at-state has queued observers — unless
    // its processing was aborted, in which case they may have been left
    // un-notified. Re-walk, and clear the flag: they are notified now.
    if (node.state < state) node.state = state
    node.aborted = false
    if (node.kind === "memo") {
      // downstream only *might* change — memo may recompute equal (R5)
      for (let i = 0; i < node.observers.length; i++) mark(node.observers[i] as ComputationNode, CHECK)
    }
  }
  // Queueing is decoupled from the state transition: an effect can be
  // at-state yet unqueued (E-LOOP skip, a memo-throw abort) — R8's "never
  // wedged" means any mark must be able to re-queue it. That includes an
  // effect that already threw this flush: a NEW mark is a new dependency
  // change and it runs again (R10); a memo it fails on rethrows its cached
  // error, and the flush reports each error object once.
  if ((node.kind === "render" || node.kind === "user") && !node.queued) {
    node.queued = true
    ;(node.kind === "render" ? renderQueue : userQueue).push(node)
  }
}

/** An aborted pull leaves every non-CLEAN memo it would have validated with
 *  observers that may never be queued: flag them (invariant I3), recursing
 *  upstream through memos that are themselves pending. */
function abortUpstream(node: ComputationNode): void {
  for (let i = 0; i < node.sources.length; i++) {
    const source = node.sources[i] as SignalNode<unknown> | ComputationNode
    if ((source as ComputationNode).kind === "memo") {
      const memo = source as ComputationNode
      if (memo.state !== CLEAN && !memo.aborted) {
        memo.aborted = true
        abortUpstream(memo)
      }
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
    while (renderQueue.length || userHead < userQueue.length) {
      if (renderQueue.length) runQueue(renderQueue, errors, false)
      else runQueue(userQueue, errors, true)
    }
  } finally {
    flushing = false
    renderQueue.length = 0
    userQueue.length = 0
    userHead = 0
  }
  // one failure is one error: a memo that threw surfaces once however many
  // effects it stranded
  const unique = [...new Set(errors)]
  if (unique.length) throw combine(unique, "effects threw during flush")
}

function runQueue(queue: ComputationNode[], errors: unknown[], yieldToRender: boolean): void {
  // Index iteration over a queue that MAY GROW while we walk it: effects
  // marked during the flush run in this same flush — never dropped
  // (R8: the wedge failure mode this scheduler exists to prevent).
  for (let i = yieldToRender ? userHead : 0; i < queue.length; i++) {
    const node = queue[i] as ComputationNode
    if (node.disposed || node.state === CLEAN) {
      // dispose-during-flush skips silently (O5); CLEAN entries are no-op
      // re-queues (mark's queue/state decoupling) and must not count as runs
      node.queued = false
    } else {
      if (node.loopEpoch !== flushEpoch) {
        node.loopEpoch = flushEpoch
        node.loopRuns = 0
      }
      if (++node.loopRuns > LOOP_LIMIT) {
        // self-feeding effect: report once, stop running it this flush (R8).
        // The memos it would have pulled stay pending with this effect as an
        // un-queued observer — flag them so the next dependency write reaches
        // it again: the skip is per-flush, never a permanent kill.
        if (node.loopRuns === LOOP_LIMIT + 1) errors.push(vintError("E-LOOP", named(node.name)))
        abortUpstream(node)
        node.queued = false
      } else {
        try {
          // `queued` stays true through validation: an upstream memo that
          // recomputes to a new value marks this node DIRTY, and a duplicate
          // queue entry (and a duplicate error report, R10) must not follow.
          // updateNode clears it just before the body runs (a self-mark
          // re-queues); a validation that resolves CLEAN or throws clears it here.
          updateIfNecessary(node)
        } catch (err) {
          errors.push(err) // one bad effect never skips the rest (R10)
        } finally {
          // a DIRTY node that was NOT aborted re-queued itself during its
          // body (I2) and is in the queue; anything else is done with its slot
          if (node.state !== DIRTY || node.aborted) node.queued = false
        }
      }
    }
    // R7: a user effect that produced render work yields so DOM bindings
    // settle before the next user effect runs
    if (yieldToRender && renderQueue.length) {
      userHead = i + 1
      return
    }
  }
  if (yieldToRender) userHead = 0
  queue.length = 0
}

/**
 * Pull-phase validation. CHECK means "an upstream memo might have changed":
 * recompute those memos first; only if one actually changed (it promotes us
 * to DIRTY) do we run. This is what makes diamonds glitch-free (R6) and lets
 * memo equality stop downstream work (R5).
 */
function updateIfNecessary(node: ComputationNode): void {
  // a memo that already threw in this flush does not retry until the next
  // one (R10): its observers each see the same failure, reported once
  if (node.kind === "memo" && flushing && node.erroredEpoch === flushEpoch) throw node.lastError
  if (node.state === CHECK) {
    try {
      for (let i = 0; i < node.sources.length; i++) {
        const source = node.sources[i] as SignalNode<unknown> | ComputationNode
        if ((source as ComputationNode).kind === "memo") {
          updateIfNecessary(source as ComputationNode)
          if ((node.state as NodeState) === DIRTY) break
        }
      }
    } catch (err) {
      // an upstream memo threw mid-validation: this node's observers were
      // never reached, and neither were its OTHER pending memos — flag them
      // all so the next write to any of them re-walks (R10, I3)
      node.aborted = true
      abortUpstream(node)
      throw err
    }
    if (node.state === CHECK) {
      node.state = CLEAN // every upstream memo resolved equal
      node.aborted = false
    }
  }
  if (node.state === DIRTY) updateNode(node)
}

function updateNode(node: ComputationNode): void {
  // per-run scope (O2); leaves state CLEAN so self-marks re-queue. A throwing
  // cleanup never stops the run (O2): the body still executes, and the error
  // is rethrown afterwards together with the body's, if any.
  let cleanupError: unknown[] | null = null
  try {
    cleanNode(node)
  } catch (err) {
    cleanupError = [err]
  }
  if (node.disposed) {
    // a cleanup disposed this very node (O5): the body must not run
    if (cleanupError) throw combine(cleanupError, "cleanups threw")
    return
  }
  if (node.kind !== "memo") node.queued = false // I2: a self-mark in the body re-queues
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
    // `aborted` lets mark() see through the stuck-DIRTY state so later
    // dependency writes still reach observers (cleared by the next cleanNode).
    if (node.kind === "memo") {
      node.state = DIRTY
      node.aborted = true
      node.erroredEpoch = flushEpoch
      node.lastError = err
    }
    if (cleanupError) throw combine([...cleanupError, err], "cleanup and body both threw")
    throw err
  } finally {
    node.computing = false
    CurrentOwner = prevOwner
    Listener = prevListener
  }
  if (node.kind === "memo") {
    // R5: the first compute assigns unconditionally; `equals` gates re-computes
    if (!node.computed || !(node.equals as (a: unknown, b: unknown) => boolean)(node.value, next)) {
      node.computed = true
      node.value = next
      // CHECK→DIRTY promotion of observers: what makes equality gating in
      // diamonds correct (contract R5/R6). Done through mark() so an observer
      // left unqueued by an earlier error (R10 recovery via a direct read)
      // is re-queued; in the normal pull path this is a cheap no-op since
      // everything downstream was already queued at mark time.
      for (let i = 0; i < node.observers.length; i++) {
        mark(node.observers[i] as ComputationNode, DIRTY)
      }
    }
  } else {
    node.value = next
  }
  if (cleanupError) throw combine(cleanupError, "cleanups threw")
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
    if (DEV && CurrentOwner?.kind === "memo" && CurrentOwner.computing) {
      // the OWNER, not the listener: untrack() nulls the listener, and a memo
      // writing its own dependency under untrack is the same impurity
      throw vintDevError("E-WRITE-IN-MEMO", named(CurrentOwner.name))
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
  // computed once at creation (R5), through the gate so effects created in
  // the body run after the memo has its value (R7)
  if (!node.disposed) runUpdates(() => updateNode(node), "createMemo")
  else node.value = untrack(() => (fn as (prev: unknown) => unknown)(initial)) // prod, O5: right value, no edges
  const read: Accessor<T> = () => {
    if (node.disposed) {
      if (DEV) throw vintDevError("E-DISPOSED-MEMO", named(node.name))
      return node.value as T
    }
    if (DEV && node.computing) throw vintDevError("E-CIRCULAR-MEMO", named(node.name))
    if (node.state !== CLEAN) {
      // A stale read validates through the gate when it is the outermost
      // entry (R7): effects created inside the memo body — and effects an
      // earlier error left stranded (R10) — run after the value is produced,
      // never mid-computation. Inside a computation, batch or flush the
      // enclosing gate owns that.
      try {
        if (Listener || batchDepth > 0 || flushing) updateIfNecessary(node)
        else runUpdates(() => updateIfNecessary(node), "memo read")
      } catch (err) {
        // R10 through any depth: the reader keeps its edge to this memo even
        // though the read threw, so the next write here reaches it
        if (Listener) track(node)
        throw err
      }
    }
    if (Listener) track(node)
    return node.value as T
  }
  ;(read as Accessor<T> & { [NODE]: unknown })[NODE] = node
  return read
}

// biome-ignore lint/suspicious/noConfusingVoidType: `T | void` is deliberate — an effect body may return nothing, and `T | undefined` would reject void-returning functions
export function createEffect<T>(fn: (prev: T | undefined) => T | void, initial?: T): void {
  scheduleEffect(
    createComputation(fn as (prev: unknown) => unknown, initial, "user", null, fn.name || undefined),
  )
}

/** Like createEffect but runs in the earlier render phase (DOM bindings). */
// biome-ignore lint/suspicious/noConfusingVoidType: same deliberate `T | void` as createEffect
export function createRenderEffect<T>(fn: (prev: T | undefined) => T | void, initial?: T): void {
  scheduleEffect(
    createComputation(fn as (prev: unknown) => unknown, initial, "render", null, fn.name || undefined),
  )
}

function scheduleEffect(node: ComputationNode): void {
  if (node.disposed) return // born under a disposed owner (O5, prod)
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
      return prevValue // R11: the deferred run keeps the previous value (a memo's initial)
    }
    const result = untrack(() => fn(input, prevInput, prevValue))
    prevInput = input
    return result
  }
}

// ---------------------------------------------------------------------------
// Test-only introspection (not exported from index.ts)
// ---------------------------------------------------------------------------

/** @internal Sources tracked so far by the computation currently running.
 *  The DOM layer uses this to spot a binding that read nothing on its first
 *  run: dependencies are re-collected per run (R3), so a run that tracks
 *  nothing can never be re-triggered — the binding is provably dead. */
export function __currentSourceCount(): number {
  return Listener ? Listener.sources.length : 0
}

/** @internal White-box helper for leak tests: live observer count of a signal or memo. */
export function __observerCount(accessor: Accessor<unknown>): number {
  const node = (accessor as Accessor<unknown> & { [NODE]?: { observers: unknown[] } })[NODE]
  return node ? node.observers.length : 0
}

/** @internal White-box snapshot of one node (invariant tests). */
export interface DebugNode {
  kind: ComputationNode["kind"]
  /** 0 = CLEAN, 1 = CHECK, 2 = DIRTY. */
  state: number
  queued: boolean
  disposed: boolean
  /** True while an abort (throw, loop skip) left this node's observers
   *  possibly un-notified — mark() re-walks them (invariant I3). */
  aborted: boolean
  /** Number of source edges currently held. */
  sources: number
  /** `state` of each observer, in slot order — enough to check invariant I3
   *  (a non-CLEAN memo never has a CLEAN observer) without exposing nodes. */
  observers: number[]
  owned: DebugNode[]
}

/** @internal Snapshot of `owner` and its owned subtree, for invariant checks. */
export function __debugTree(owner: Owner): DebugNode {
  return {
    kind: owner.kind,
    state: owner.state,
    queued: owner.queued,
    disposed: owner.disposed,
    aborted: owner.aborted,
    sources: owner.sources.length,
    observers: owner.observers.map((o) => o.state),
    owned: owner.owned ? owner.owned.map(__debugTree) : [],
  }
}

/**
 * vint async — createResource (contract §A). Solid 1.x's shape and behaviour
 * wherever the name is shared (principle 1), with three deliberate
 * divergences stated in the contract: data() never throws (A3), refetch()
 * always returns a promise (A1), and disposal cancels interest — loading
 * resets and the fetcher is never called again (A2). No `state`, no
 * `latest`, no `storage`: one way to say each thing.
 */

import { DEV, vintWarn } from "./dev"
import type { Accessor, Setter } from "./reactive"
import { batch, createRenderEffect, createSignal, getOwner, on, onCleanup, untrack } from "./reactive"

export type ResourceAccessor<T> = Accessor<T | undefined> & {
  readonly loading: boolean
  readonly error: unknown
}

/** `data()` is `T` when `initialValue` was given (it is never undefined). */
export type InitializedResourceAccessor<T> = Accessor<T> & {
  readonly loading: boolean
  readonly error: unknown
}

export interface ResourceControls<T> {
  refetch: (info?: unknown) => Promise<T | undefined>
  mutate: Setter<T | undefined>
}

export interface InitializedResourceControls<T> {
  refetch: (info?: unknown) => Promise<T | undefined>
  mutate: Setter<T>
}

export interface ResourceFetcherInfo<T> {
  value: T | undefined
  refetching: unknown
}

export interface ResourceOptions<T> {
  initialValue?: T
  name?: string
}

type Fetcher<T, S> = (source: S, info: ResourceFetcherInfo<T>) => Promise<T> | T

export function createResource<T, S = true>(
  fetcher: Fetcher<T, S>,
  options: ResourceOptions<T> & { initialValue: T },
): [InitializedResourceAccessor<T>, InitializedResourceControls<T>]
export function createResource<T, S = true>(
  fetcher: Fetcher<T, S>,
  options?: ResourceOptions<T>,
): [ResourceAccessor<T>, ResourceControls<T>]
export function createResource<T, S>(
  source: Accessor<S>,
  fetcher: Fetcher<T, Exclude<NonNullable<S>, false>>,
  options: ResourceOptions<T> & { initialValue: T },
): [InitializedResourceAccessor<T>, InitializedResourceControls<T>]
export function createResource<T, S>(
  source: Accessor<S>,
  fetcher: Fetcher<T, Exclude<NonNullable<S>, false>>,
  options?: ResourceOptions<T>,
): [ResourceAccessor<T>, ResourceControls<T>]
export function createResource<T, S>(
  a: Accessor<S> | Fetcher<T, S>,
  b?: Fetcher<T, S> | ResourceOptions<T>,
  c?: ResourceOptions<T>,
): [ResourceAccessor<T>, ResourceControls<T>] {
  const hasSource = typeof b === "function"
  const source: Accessor<S> = hasSource ? (a as Accessor<S>) : () => true as unknown as S
  const fetcher: Fetcher<T, S> = hasSource ? (b as Fetcher<T, S>) : (a as Fetcher<T, S>)
  const options: ResourceOptions<T> = (hasSource ? c : (b as ResourceOptions<T> | undefined)) ?? {}

  const [value, setValue] = createSignal<T | undefined>(options.initialValue)
  const [loading, setLoading] = createSignal(false)
  const [error, setError] = createSignal<unknown>(undefined)

  let fetchId = 0
  let disposed = false
  /** A load started in this microtask: further refetch() calls share it (A4). */
  let scheduled = false
  let inflight: Promise<T | undefined> | null = null

  if (getOwner()) {
    onCleanup(() => {
      // A2: disposal cancels interest — in-flight responses are already
      // discarded via `disposed`; loading must not stay stuck true.
      disposed = true
      fetchId++
      inflight = null
      setLoading(false)
    })
  } else if (DEV) {
    vintWarn(
      "E-NO-OWNER",
      `a createResource${options.name ? ` "${options.name}"` : ""} (its fetch effect and signals will never be disposed)`,
    )
  }

  const valid = (s: S): boolean => s !== false && s != null

  /** A4: the only place `error` is written — set on failure, cleared on success. */
  const complete = (id: number, v: T | undefined, err: unknown): void => {
    if (id !== fetchId || disposed) return // stale or unmounted: discard (A2)
    inflight = null
    batch(() => {
      if (err === undefined) setValue(() => v)
      setLoading(false)
      setError(err)
    })
  }

  const load = (sourceValue: S, refetching: unknown): Promise<T | undefined> => {
    if (disposed) return Promise.resolve(undefined) // A2: no fetch after dispose
    if (refetching !== false && scheduled && inflight) return inflight // A4: dedupe
    scheduled = false
    if (!valid(sourceValue)) {
      cancel()
      return Promise.resolve(undefined)
    }
    const id = ++fetchId // A2: last fetch wins
    let result: Promise<T> | T
    try {
      result = untrack(() => fetcher(sourceValue, { value: untrack(value), refetching }))
    } catch (err) {
      // A3: a synchronous throw is an error result, never an escaping exception
      complete(id, undefined, castError(err))
      return Promise.resolve(undefined)
    }
    if (!isThenable(result)) {
      // A1: a plain value completes synchronously — loading is never true
      complete(id, result as T, undefined)
      return Promise.resolve(result as T)
    }
    scheduled = true
    queueMicrotask(() => {
      scheduled = false
    })
    setLoading(true) // `error` is left as it was until completion (A4)
    const p = (result as Promise<T>).then(
      (v) => {
        complete(id, v, undefined)
        return v // A2: the promise reports ITS fetch, even when superseded
      },
      (err) => {
        complete(id, undefined, castError(err))
        return undefined
      },
    )
    inflight = p
    return p
  }

  /** A2: a falsy source cancels interest — in-flight responses are discarded. */
  const cancel = (): void => {
    fetchId++
    inflight = null
    scheduled = false
    batch(() => {
      setLoading(false)
      setError(undefined)
    })
  }

  // A1: the first fetch starts synchronously at creation (loading is true in
  // the component body, like Solid); source changes refetch reactively, in
  // the render phase so they land before user effects (A2, R7). The effect's
  // first run compares against the creation-time value instead of being
  // deferred — a change made before the effect first runs (later in the
  // same root body or batch) must still refetch (A2), never be swallowed.
  const initial = untrack(source)
  let current: S = initial
  if (valid(initial)) load(initial, false) // like a source change: not a refetch (A4)
  createRenderEffect(
    on(source, function resourceSource(s) {
      if (s === current) return // unchanged since creation (or last change)
      current = s
      if (valid(s))
        load(s, false) // a source change is never deduplicated (A4)
      else cancel()
    }),
  )

  const read = (() => value()) as ResourceAccessor<T>
  Object.defineProperties(read, {
    loading: { get: () => loading() },
    error: { get: () => error() },
  })

  // A4: an omitted `info` is `true`; any given value passes through as-is
  const refetch = (info: unknown = true): Promise<T | undefined> => untrack(() => load(source(), info))

  return [read, { refetch, mutate: setValue }]
}

/** A3: every failure is an Error; a thrown non-Error keeps the raw value as `cause`. */
function castError(err: unknown): Error {
  return err instanceof Error ? err : new Error(String(err), { cause: err })
}

function isThenable(value: unknown): value is PromiseLike<unknown> {
  return (
    value !== null &&
    (typeof value === "object" || typeof value === "function") &&
    typeof (value as { then?: unknown }).then === "function"
  )
}

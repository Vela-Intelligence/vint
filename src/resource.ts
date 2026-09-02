/**
 * vint async — createResource (contract §A). Solid's shape, one deliberate
 * deviation (A3): data() never throws; ALL fetcher failures — rejections and
 * synchronous throws alike — land only in data.error.
 */

import { DEV, vintWarn } from "./dev"
import type { Accessor } from "./reactive"
import { batch, createEffect, createSignal, getOwner, on, onCleanup, untrack } from "./reactive"

export type ResourceAccessor<T> = Accessor<T | undefined> & {
  readonly loading: boolean
  readonly error: unknown
}

export interface ResourceControls<T> {
  refetch: (info?: unknown) => Promise<T | undefined>
  mutate: (value: T | undefined) => void
}

export interface ResourceFetcherInfo<T> {
  value: T | undefined
  refetching: unknown
}

type Fetcher<T, S> = (source: S, info: ResourceFetcherInfo<T>) => Promise<T> | T

export function createResource<T, S = true>(
  fetcher: Fetcher<T, S>,
): [ResourceAccessor<T>, ResourceControls<T>]
export function createResource<T, S>(
  source: Accessor<S>,
  fetcher: Fetcher<T, Exclude<NonNullable<S>, false>>,
): [ResourceAccessor<T>, ResourceControls<T>]
export function createResource<T, S>(
  a: Accessor<S> | Fetcher<T, S>,
  b?: Fetcher<T, S>,
): [ResourceAccessor<T>, ResourceControls<T>] {
  const source: Accessor<S> = b ? (a as Accessor<S>) : () => true as unknown as S
  const fetcher: Fetcher<T, S> = b ?? (a as Fetcher<T, S>)

  const [data, setData] = createSignal<T | undefined>(undefined)
  const [loading, setLoading] = createSignal(false)
  const [error, setError] = createSignal<unknown>(undefined)

  let fetchId = 0
  let disposed = false
  if (getOwner()) {
    onCleanup(() => {
      disposed = true
    })
  } else if (DEV) {
    vintWarn("E-NO-OWNER", "a createResource (its fetch effect and signals will never be disposed)")
  }

  const valid = (s: S): boolean => s !== false && s != null

  const load = (sourceValue: S, refetching: unknown): Promise<T | undefined> => {
    const id = ++fetchId // A2: last fetch wins
    batch(() => {
      setLoading(true)
      setError(undefined)
    })
    let result: Promise<T> | T
    try {
      result = fetcher(sourceValue, { value: untrack(data), refetching })
    } catch (err) {
      // A3: a synchronous throw is an error result, never an escaping exception
      if (id === fetchId && !disposed) {
        batch(() => {
          setError(err)
          setLoading(false)
        })
      }
      return Promise.resolve(undefined)
    }
    return Promise.resolve(result).then(
      (value) => {
        if (id !== fetchId || disposed) return undefined // stale or unmounted: discard
        batch(() => {
          setData(() => value)
          setLoading(false)
        })
        return value
      },
      (err) => {
        if (id !== fetchId || disposed) return undefined
        batch(() => {
          setError(err)
          setLoading(false)
        })
        return undefined
      },
    )
  }

  /** A2: a falsy source cancels interest — in-flight responses are discarded. */
  const cancel = (): void => {
    fetchId++
    batch(() => {
      setLoading(false)
      setError(undefined)
    })
  }

  // A1: the first fetch starts synchronously at creation (loading is true in
  // the component body, like Solid); source changes refetch reactively.
  const initial = untrack(source)
  if (valid(initial)) load(initial, undefined)
  createEffect(
    on(
      source,
      function resourceSource(s) {
        if (valid(s)) load(s, undefined)
        else cancel()
      },
      { defer: true },
    ),
  )

  const read = (() => data()) as ResourceAccessor<T>
  Object.defineProperties(read, {
    loading: { get: () => loading() },
    error: { get: () => error() },
  })

  const refetch = (info?: unknown): Promise<T | undefined> =>
    untrack(() => {
      const s = source()
      if (!valid(s)) return Promise.resolve(undefined)
      return load(s, info ?? true)
    })
  const mutate = (value: T | undefined): void => {
    setData(() => value)
  }

  return [read, { refetch, mutate }]
}

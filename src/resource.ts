/**
 * vint async — createResource (contract §A). Solid's shape, one deliberate
 * deviation (A3): data() never throws; errors land only in data.error.
 */

import type { Accessor } from "./reactive"
import { batch, createEffect, createSignal, onCleanup, untrack } from "./reactive"

export type ResourceAccessor<T> = Accessor<T | undefined> & {
  readonly loading: boolean
  readonly error: unknown
}

export interface ResourceControls<T> {
  refetch: (info?: unknown) => void
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
  const source: Accessor<S> = b ? (a as Accessor<S>) : (() => true as unknown as S)
  const fetcher: Fetcher<T, S> = b ?? (a as Fetcher<T, S>)

  const [data, setData] = createSignal<T | undefined>(undefined)
  const [loading, setLoading] = createSignal(false)
  const [error, setError] = createSignal<unknown>(undefined)

  let fetchId = 0
  let disposed = false
  onCleanup(() => {
    disposed = true
  })

  const load = (sourceValue: S, refetching: unknown): void => {
    const id = ++fetchId // A2: last fetch wins
    batch(() => {
      setLoading(true)
      setError(undefined)
    })
    Promise.resolve(fetcher(sourceValue, { value: untrack(data), refetching })).then(
      (value) => {
        if (id !== fetchId || disposed) return // stale or unmounted: discard
        batch(() => {
          setData(() => value)
          setLoading(false)
        })
      },
      (err) => {
        if (id !== fetchId || disposed) return
        batch(() => {
          setError(err)
          setLoading(false)
        })
      },
    )
  }

  createEffect(() => {
    const sourceValue = source()
    if (sourceValue === false || sourceValue == null) return // A1: falsy source skips
    untrack(() => load(sourceValue, undefined))
  })

  const read = (() => data()) as ResourceAccessor<T>
  Object.defineProperties(read, {
    loading: { get: () => loading() },
    error: { get: () => error() },
  })

  const refetch = (info?: unknown): void => {
    untrack(() => {
      const sourceValue = source()
      if (sourceValue === false || sourceValue == null) return
      load(sourceValue, info ?? true)
    })
  }
  const mutate = (value: T | undefined): void => {
    setData(() => value)
  }

  return [read, { refetch, mutate }]
}

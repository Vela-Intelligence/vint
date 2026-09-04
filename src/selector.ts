/**
 * vint createSelector — contract C4. The one selection primitive: a list of
 * N rows costs two row updates per selection change, not N.
 *
 * Solid's semantics on purpose (principle 1): `isSelected(key)` subscribes the
 * reading computation to that key alone. Per-key signals are created lazily
 * on first read and dropped when their last reader is disposed, so keys with
 * no live reader hold no state.
 */

import { DEV, vintWarn } from "./dev"
import type { Accessor } from "./reactive"
import { createRenderEffect, createSignal, getOwner, on, onCleanup, untrack } from "./reactive"

type Entry = { get: Accessor<boolean>; set: (v: boolean) => boolean; readers: number }

export function createSelector<T, U = T>(
  source: Accessor<T>,
  fn?: (key: U, value: T) => boolean,
): (key: U) => boolean {
  const compare = fn ?? ((key: U, value: T) => (key as unknown) === (value as unknown))
  const custom = fn !== undefined
  const entries = new Map<U, Entry>()
  if (DEV && !getOwner()) vintWarn("E-NO-OWNER", "a createSelector")
  // C4: on change, flip only the keys whose answer can differ — the previous
  // and the next selection with the default `===`; every live key otherwise
  createRenderEffect(
    on(source, (value, prev) => {
      if (custom) {
        for (const [key, entry] of entries) entry.set(compare(key, value))
        return
      }
      if (prev !== undefined) entries.get(prev as unknown as U)?.set(false)
      entries.get(value as unknown as U)?.set(true)
    }),
  )
  return (key: U): boolean => {
    let entry = entries.get(key)
    if (!entry) {
      const [get, set] = createSignal(compare(key, untrack(source)))
      entry = { get, set, readers: 0 }
      entries.set(key, entry)
    }
    // one reader edge per run of the reading computation; the cleanup runs
    // before its next run (O2) or on dispose, so `readers` is always exact
    entry.readers++
    const e = entry
    onCleanup(() => {
      if (--e.readers === 0 && entries.get(key) === e) entries.delete(key)
    })
    return entry.get()
  }
}

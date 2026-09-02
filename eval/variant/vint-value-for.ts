// A/B variant: vint with a Solid-style value-passing For.
// children(item, index) receives PLAIN VALUES; row content re-renders when
// the item changes (index is read untracked so reorders move rows without
// rebuilding them — matching the accessor For's identity behavior for the
// tasks under test). Everything else is stock vint.
import type { Child } from "../../src/index"
import { For as AccessorFor, untrack } from "../../src/index"

export * from "../../src/index"

export function For<T>(props: {
  each: () => readonly T[]
  key?: (item: T, index: number) => unknown
  children: (item: T, index: number) => Child
  fallback?: () => Child
}): Child {
  return AccessorFor<T>({
    each: props.each,
    key: props.key,
    fallback: props.fallback,
    children: (item, index) => () => props.children(item(), untrack(index)),
  })
}

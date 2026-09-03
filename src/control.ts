/**
 * vint control flow — Show / Switch / Match / For.
 * Clause numbers refer to docs/contract.md (§C).
 */

import { DEV, vintError, vintWarn } from "./dev"
import type { Child } from "./dom"
import { insertChild } from "./dom"
import type { Accessor, Setter } from "./reactive"
import {
  createMemo,
  createRenderEffect,
  createScope,
  createSignal,
  getOwner,
  onCleanup,
  runWithOwner,
  untrack,
} from "./reactive"

/** C1/C2/C3: a thunk position received an already-built element. Always on —
 *  without it the value is silently dropped or a raw TypeError surfaces. */
function assertThunk(value: unknown, what: string): void {
  if (typeof value !== "function") throw vintError("E-CHILDREN-FN", what)
}

/**
 * C1: keyed on Boolean(when()) — truthy→truthy value changes never rebuild.
 * children is a thunk, or a callback receiving the narrowed value as an
 * accessor (modern Solid's non-keyed form). Built lazily inside the binding's
 * scope so a flip disposes the old branch (cleanups run) before the new one.
 */
export function Show<T>(props: {
  when: Accessor<T>
  children: (() => Child) | ((item: Accessor<NonNullable<T>>) => Child)
  fallback?: () => Child
}): Child {
  // Solid's JSX wraps `when` for you; nothing does here, so a value would
  // freeze the branch forever (C1) — always on.
  if (typeof props.when !== "function") throw vintError("E-SHOW-WHEN")
  assertThunk(props.children, "Show's children")
  if (props.fallback !== undefined) assertThunk(props.fallback, "Show's fallback")
  const visible = createMemo(() => Boolean(props.when()))
  const item: Accessor<NonNullable<T>> = () => props.when() as NonNullable<T>
  return () => {
    if (visible()) {
      // The accessor is passed on EVERY call (C1): thunks ignore it, and
      // callbacks written with default/rest parameters (Function.length 0)
      // still receive it — no arity sniffing.
      return untrack(() => (props.children as (item: Accessor<NonNullable<T>>) => Child)(item))
    }
    return props.fallback ? untrack(props.fallback) : null
  }
}

export interface MatchProps {
  when: Accessor<unknown>
  children: () => Child
}

export function Match(props: MatchProps): MatchProps {
  if (typeof props.when !== "function") throw vintError("E-MATCH-WHEN") // always on
  assertThunk(props.children, "Match's children")
  return props
}

/** C3: first truthy Match wins; Matches after the winner are not tracked. */
export function Switch(props: { fallback?: () => Child; children: MatchProps[] }): Child {
  if (!Array.isArray(props.children)) throw vintError("E-SWITCH-ARRAY") // always on
  if (props.fallback !== undefined) assertThunk(props.fallback, "Switch's fallback")
  const index = createMemo(() => {
    const arms = props.children
    for (let i = 0; i < arms.length; i++) {
      if ((arms[i] as MatchProps).when()) return i
    }
    return -1
  })
  return () => {
    const i = index()
    if (i >= 0) return untrack((props.children[i] as MatchProps).children)
    return props.fallback ? untrack(props.fallback) : null
  }
}

/** DEV guard for the top Solid-prior mistake: property access on the item
 *  accessor instead of calling it (contract C2 — UNLIKE Solid's For). */
const accessorIntrinsics = new Set([
  "name",
  "length",
  "call",
  "apply",
  "bind",
  "toString",
  "constructor",
  "prototype",
  "arguments",
  "caller",
])
function guardItemAccessor<T>(item: Accessor<T>): Accessor<T> {
  return new Proxy(item, {
    get(target, prop, receiver) {
      if (typeof prop === "string" && !accessorIntrinsics.has(prop)) {
        vintWarn("E-FOR-ITEM-ACCESS", prop)
      }
      return Reflect.get(target, prop, receiver)
    },
  }) as Accessor<T>
}

/**
 * C2: keyed list. children(item, index) receives two ACCESSORS (unlike
 * Solid's For) and runs once per key; rows keep their DOM nodes across
 * reorders; removed rows are fully disposed; fallback renders while empty.
 * Default key is the item itself (reference identity) — object rows should
 * pass key: t => t.id.
 */
export function For<T>(props: {
  each: Accessor<readonly T[]>
  key?: (item: T, index: number) => unknown
  children: (item: Accessor<T>, index: Accessor<number>) => Child
  fallback?: () => Child
}): Child {
  if (typeof props.each !== "function") throw vintError("E-FOR-ARRAY") // always on
  assertThunk(props.children, "For's children")
  if (props.fallback !== undefined) assertThunk(props.fallback, "For's fallback")

  type Row = {
    key: unknown
    anchor: Comment
    setItem: Setter<T>
    setIndex: Setter<number>
    dispose: () => void
  }

  const fragment = document.createDocumentFragment()
  const start = document.createComment("for")
  const end = document.createComment("/for")
  fragment.append(start, end)

  let rows = new Map<unknown, Row>()
  let prevList: readonly T[] | null = null
  let fallbackDispose: (() => void) | null = null
  const anchors = new Set<Comment>()
  const forOwner = getOwner() // rows attach here, NOT to the reconcile effect's run

  /** A row's nodes: its anchor up to (not including) the next live anchor or
   *  the end marker. Computed dynamically so content that bindings insert
   *  later still travels with the row. */
  const rowNodes = (row: Row): ChildNode[] => {
    const out: ChildNode[] = [row.anchor]
    let node: ChildNode | null = row.anchor.nextSibling
    while (node && node !== end && !anchors.has(node as Comment)) {
      out.push(node)
      node = node.nextSibling
    }
    return out
  }

  createRenderEffect(() => {
    const list = props.each()
    if (!Array.isArray(list)) throw vintError("E-FOR-EACH-RESULT", String(list)) // always on
    if (DEV && prevList !== null && prevList === list && rows.size > 0) vintWarn("E-FOR-SAMEREF")
    prevList = list
    const parent = end.parentNode
    if (!parent) {
      if (DEV) vintWarn("E-FOR-DETACHED")
      return
    }

    // C2/R10: validate ALL keys before touching any row state, so a
    // duplicate-key throw leaves the For intact and recoverable.
    const keyOf = props.key ?? ((item: T) => item)
    const keys: unknown[] = new Array(list.length)
    const seen = new Set<unknown>()
    for (let i = 0; i < list.length; i++) {
      const key = keyOf(list[i] as T, i)
      if (seen.has(key)) throw vintError("E-FOR-DUPKEY", String(key)) // always on
      seen.add(key)
      keys[i] = key
    }

    const nextRows = new Map<unknown, Row>()
    untrack(() => {
      // 1. reuse or create, in target order
      for (let i = 0; i < list.length; i++) {
        const value = list[i] as T
        const key = keys[i]
        const existing = rows.get(key)
        if (existing) {
          rows.delete(key)
          existing.setItem(() => value) // updater form: safe even for function items
          existing.setIndex(i)
          nextRows.set(key, existing)
        } else {
          const created = runWithOwner(forOwner, () =>
            createScope((): Row => {
              const [item, setItem] = createSignal<T>(value)
              const [index, setIndex] = createSignal(i)
              const anchor = document.createComment("row")
              anchors.add(anchor)
              const hold = document.createDocumentFragment()
              hold.appendChild(anchor)
              insertChild(hold, props.children(DEV ? guardItemAccessor(item) : item, index))
              const row: Row = { key, anchor, setItem, setIndex, dispose: () => {} }
              onCleanup(() => {
                for (const node of rowNodes(row)) node.remove()
                anchors.delete(anchor)
              })
              return row
            }),
          )
          const row = created[0]
          row.dispose = created[1]
          nextRows.set(key, row)
        }
      }

      // 2. dispose rows whose key vanished (their cleanup removes their nodes)
      for (const row of rows.values()) row.dispose()

      // 3. fallback lifecycle: shown while the list is empty (C2)
      if (list.length === 0 && props.fallback && !fallbackDispose) {
        const created = runWithOwner(forOwner, () =>
          createScope((): ChildNode[] => {
            const hold = document.createDocumentFragment()
            insertChild(hold, (props.fallback as () => Child)())
            const nodes = [...hold.childNodes]
            onCleanup(() => {
              for (const node of nodes) node.remove()
            })
            return nodes
          }),
        )
        for (const node of created[0]) parent.insertBefore(node, end)
        fallbackDispose = created[1]
      } else if (list.length > 0 && fallbackDispose) {
        fallbackDispose()
        fallbackDispose = null
      }

      // 4. order: move each row's whole range after the cursor when misplaced
      let cursor: ChildNode = start
      for (const row of nextRows.values()) {
        const range = rowNodes(row)
        if (cursor.nextSibling !== range[0]) {
          const ref = cursor.nextSibling
          for (const node of range) parent.insertBefore(node, ref)
        }
        cursor = range[range.length - 1] as ChildNode
      }
    })
    rows = nextRows
  })

  return fragment
}

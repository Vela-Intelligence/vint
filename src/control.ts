/**
 * vint control flow — Show / Switch / Match / For.
 * Clause numbers refer to docs/contract.md (§C).
 */

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
import { DEV, vintError, vintWarn } from "./dev"

/**
 * C1: keyed on Boolean(when()) — truthy→truthy value changes never rebuild.
 * children/fallback are thunks, built lazily inside the binding's scope so a
 * flip disposes the old branch (cleanups run) before building the new one.
 */
export function Show(props: {
  when: Accessor<unknown>
  children: () => Child
  fallback?: () => Child
}): Child {
  const visible = createMemo(() => Boolean(props.when()))
  return () => {
    if (visible()) return untrack(props.children)
    return props.fallback ? untrack(props.fallback) : null
  }
}

export interface MatchProps {
  when: Accessor<unknown>
  children: () => Child
}

export function Match(props: MatchProps): MatchProps {
  return props
}

/** C3: first truthy Match wins; Matches after the winner are not tracked. */
export function Switch(props: { fallback?: () => Child; children: MatchProps[] }): Child {
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

/**
 * C2: keyed list. children(item, index) runs once per key; rows keep their
 * DOM nodes across reorders (moved, not recreated); removed rows are fully
 * disposed. Default key is the item itself (reference identity) — object
 * rows should pass key: t => t.id.
 */
export function For<T>(props: {
  each: Accessor<readonly T[]>
  key?: (item: T, index: number) => unknown
  children: (item: Accessor<T>, index: Accessor<number>) => Child
}): Child {
  if (typeof props.each !== "function") throw vintError("E-FOR-ARRAY")

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
    if (DEV && !Array.isArray(list)) throw vintError("E-FOR-ARRAY")
    if (DEV && prevList !== null && prevList === list && rows.size > 0) vintWarn("E-FOR-SAMEREF")
    prevList = list
    const keyOf = props.key ?? ((item: T) => item)
    const parent = end.parentNode as Node
    const nextRows = new Map<unknown, Row>()

    untrack(() => {
      // 1. reuse or create, in target order
      for (let i = 0; i < list.length; i++) {
        const value = list[i] as T
        const key = keyOf(value, i)
        if (nextRows.has(key)) throw vintError("E-FOR-DUPKEY", String(key))
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
              insertChild(hold, props.children(item, index))
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

      // 3. order: move each row's whole range after the cursor when misplaced
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

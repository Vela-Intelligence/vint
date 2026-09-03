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

/** A row created this reconcile: it has no previous DOM position. */
const NEW = -1

/**
 * C2 minimality: flag the rows that must NOT move. `sources[i]` is row i's
 * previous DOM position (or NEW); the rows on a longest strictly-increasing
 * subsequence of those already sit in the right relative order, so leaving
 * them alone is what keeps focus/selection/IME alive in them.
 *
 * Patience sorting with a parent chain (the shape Solid's mapArray and Vue's
 * getSequence use). Previous positions are pairwise distinct — they are
 * indices into the previous row order — so strict `<` is correct.
 */
function markKeepers(sources: number[], keep: Uint8Array): void {
  const piles: number[] = [] // piles[k]: index of the smallest tail of a run of length k+1
  const parent = new Array<number>(sources.length)
  for (let i = 0; i < sources.length; i++) {
    const s = sources[i] as number
    if (s === NEW) continue // a new row has no position to keep
    if (piles.length === 0) {
      parent[i] = -1
      piles.push(i)
      continue
    }
    const last = piles[piles.length - 1] as number
    if ((sources[last] as number) < s) {
      parent[i] = last
      piles.push(i)
      continue
    }
    let lo = 0
    let hi = piles.length - 1
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if ((sources[piles[mid] as number] as number) < s) lo = mid + 1
      else hi = mid
    }
    if (s < (sources[piles[lo] as number] as number)) {
      parent[i] = lo > 0 ? (piles[lo - 1] as number) : -1
      piles[lo] = i
    }
  }
  for (
    let k = piles.length ? (piles[piles.length - 1] as number) : -1;
    k >= 0;
    k = parent[k] as number
  ) {
    keep[k] = 1
  }
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
    /** This row's index in current DOM row order — the LIS input next time. */
    pos: number
    /** The detached fragment a new row was built into, until it is placed. */
    pending: DocumentFragment | null
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

    // allocated only AFTER key validation, so a duplicate-key throw leaves
    // this reconcile having touched nothing at all (C2/R10)
    const nextRows = new Map<unknown, Row>()
    const order: Row[] = new Array(list.length)
    const sources: number[] = new Array(list.length)
    let moved = false // any retained row out of its previous relative order?
    let lastPos = -1
    untrack(() => {
      // 1. reuse or create, in target order
      for (let i = 0; i < list.length; i++) {
        const value = list[i] as T
        const key = keys[i]
        const existing = rows.get(key)
        if (existing) {
          rows.delete(key)
          const prev = existing.pos
          sources[i] = prev
          if (prev < lastPos) moved = true
          else lastPos = prev
          existing.setItem(() => value) // updater form: safe even for function items
          existing.setIndex(i)
          order[i] = existing
          nextRows.set(key, existing)
        } else {
          sources[i] = NEW
          const created = runWithOwner(forOwner, () =>
            createScope((): Row => {
              const [item, setItem] = createSignal<T>(value)
              const [index, setIndex] = createSignal(i)
              const anchor = document.createComment("row")
              anchors.add(anchor)
              const hold = document.createDocumentFragment()
              hold.appendChild(anchor)
              insertChild(hold, props.children(DEV ? guardItemAccessor(item) : item, index))
              // keep `hold`: step 4 inserts it whole, one call instead of
              // re-deriving the range node by node
              const row: Row = {
                key,
                anchor,
                pos: i,
                pending: hold,
                setItem,
                setIndex,
                dispose: () => {},
              }
              onCleanup(() => {
                for (const node of rowNodes(row)) node.remove()
                anchors.delete(anchor)
              })
              return row
            }),
          )
          const row = created[0]
          row.dispose = created[1]
          order[i] = row
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

      // 4. placement (C2 minimality). Walk target order BACKWARDS with a
      // trailing reference: everything after `ref` is already settled, so a
      // row that must move is inserted immediately before it.
      //
      // `ref = end` is safe to start from because step 3 disposed the
      // fallback whenever the list is non-empty, and this loop does not run
      // when it is empty — so nothing but row content sits before `end`.
      const keep = new Uint8Array(list.length)
      if (moved) markKeepers(sources, keep)
      // not moved: the retained rows' previous positions are already
      // increasing, so they ARE the longest increasing subsequence — the
      // skip is exact, not an approximation (append / remove / field update)
      else for (let i = 0; i < list.length; i++) if (sources[i] !== NEW) keep[i] = 1

      let ref: ChildNode = end
      for (let i = list.length - 1; i >= 0; i--) {
        const row = order[i] as Row
        // committed HERE, not in step 1: if anything above throws, step 4
        // never runs, nothing moved, and the recorded positions still
        // describe the real DOM. A wrong LIS input is wrong ORDER, not just
        // a slower reconcile.
        row.pos = i
        const pending = row.pending
        if (pending) {
          parent.insertBefore(pending, ref) // whole fragment, one call
          row.pending = null
        } else if (!keep[i]) {
          for (const node of rowNodes(row)) parent.insertBefore(node, ref)
        }
        // a row's first node is ALWAYS its anchor, so the running reference
        // needs no rowNodes() walk — this is what keeps an untouched row
        // free of DOM traversal entirely
        ref = row.anchor
      }
    })
    rows = nextRows
  })

  return fragment
}

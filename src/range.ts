/**
 * vint DOM ranges — the ONE way a piece of vint-owned DOM is delimited.
 *
 * A range is a run of sibling nodes between a start marker and either an end
 * marker or the first node an `isEnd` predicate accepts. Its contents are
 * always read LIVE from the DOM (D3): nested regions — a For's rows, a Show's
 * branch — insert nodes into the range on later flushes, and a snapshot
 * taken at build time would orphan them. Four owners share this: a function
 * child's binding, a For row's extent (control.ts walks it the same way,
 * bounded by the next row's anchor), a For fallback, and `mount`, which
 * removes the live run between the first and last node it appended.
 *
 * Nodes leave a range through `detach()`, never `.remove()` directly: a run
 * that came out of a DocumentFragment goes BACK into that fragment (D2), so
 * a hoisted `For` keeps reconciling there and is whole when it returns.
 *
 * The one ordering rule lives here too: `own(range)` registers the clearing
 * cleanup, and callers register it BEFORE building children, so LIFO cleanup
 * runs it LAST — every nested binding clears its own range while its markers
 * are still attached, and the outer range then removes what is left.
 * (F1 in docs/review-2026-09.md and H3 in docs/assessment-2026-09.md were
 * both this rule applied in one place and not the next.)
 */

import { onCleanup } from "./reactive"

/** What each fragment expanded to the last time a binding rendered it (D2). */
const expansions = new WeakMap<DocumentFragment, { first: ChildNode; last: ChildNode }>()
/** Reverse index: the first node of an expansion → its fragment. */
const fragmentOfFirst = new WeakMap<ChildNode, DocumentFragment>()

/** Record that `fragment` was just expanded to the run first..last. */
export function rememberExpansion(fragment: DocumentFragment, first: ChildNode, last: ChildNode): void {
  const prior = expansions.get(fragment)
  if (prior) fragmentOfFirst.delete(prior.first)
  expansions.set(fragment, { first, last })
  fragmentOfFirst.set(first, fragment)
}

/** The live run first..last a fragment expanded to, if it is still intact
 *  (same parent, walk from first reaches last); otherwise null. */
export function liveExpansion(fragment: DocumentFragment): ChildNode[] | null {
  const prior = expansions.get(fragment)
  if (!prior || !prior.first.parentNode || prior.first.parentNode !== prior.last.parentNode) return null
  return runBetween(prior.first, prior.last)
}

/** Walk siblings from `first` to `last` inclusive; null if `last` is not reached. */
export function runBetween(first: ChildNode, last: ChildNode): ChildNode[] | null {
  const run: ChildNode[] = []
  let node: ChildNode | null = first
  while (node && node !== last) {
    run.push(node)
    node = node.nextSibling
  }
  if (node !== last) return null
  run.push(last)
  return run
}

/** Take `node` out of the DOM. If it starts a fragment's expansion whose run
 *  is still intact, the whole run returns to its fragment instead (D2); the
 *  nodes then sit in the fragment, and a caller iterating a snapshot skips
 *  any node that already moved. */
export function detach(node: ChildNode): void {
  const fragment = fragmentOfFirst.get(node)
  if (fragment) {
    const prior = expansions.get(fragment)
    const run = prior && prior.first === node ? runBetween(node, prior.last) : null
    if (run) {
      fragment.append(...run)
      return
    }
  }
  // already returned to a fragment by an earlier detach in the same pass —
  // a real fragment, not a ShadowRoot (also nodeType 11, but it has a host)
  const parent = node.parentNode as (Node & { host?: unknown }) | null
  if (parent && parent.nodeType === 11 && !parent.host) return
  node.remove()
}

export interface Range {
  readonly start: Comment
  readonly end: Comment
  /** The nodes strictly between the markers, read from the live DOM. */
  nodes(): ChildNode[]
  /** Remove the contents and the markers. Safe to call more than once. */
  clear(): void
}

export function createRange(label: string): Range {
  const start = document.createComment(label)
  const end = document.createComment(`/${label}`)
  const nodes = (): ChildNode[] => {
    const out: ChildNode[] = []
    let node: ChildNode | null = start.nextSibling
    while (node && node !== end) {
      out.push(node)
      node = node.nextSibling
    }
    return out
  }
  return {
    start,
    end,
    nodes,
    clear() {
      for (const node of nodes()) detach(node)
      start.remove()
      end.remove()
    },
  }
}

/** A range bounded by markers that belong to someone else — the space between
 *  a For's own markers while it shows its fallback. `clear()` empties it and
 *  leaves the markers in place. */
export function between(start: Comment, end: Comment): Range {
  const nodes = (): ChildNode[] => {
    const out: ChildNode[] = []
    let node: ChildNode | null = start.nextSibling
    while (node && node !== end) {
      out.push(node)
      node = node.nextSibling
    }
    return out
  }
  return {
    start,
    end,
    nodes,
    clear() {
      for (const node of nodes()) detach(node)
    },
  }
}

/** Register the range's teardown on the current owner. Call BEFORE building
 *  the range's children (see the file comment). */
export function own(range: Range): void {
  onCleanup(() => range.clear())
}

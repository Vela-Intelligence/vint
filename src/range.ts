/**
 * vint DOM ranges — the ONE way a piece of vint-owned DOM is delimited.
 *
 * A range is a run of sibling nodes between a start marker and either an end
 * marker or the first node an `isEnd` predicate accepts. Its contents are
 * always read LIVE from the DOM (D3): nested regions — a For's rows, a Show's
 * branch — insert nodes into the range on later flushes, and a snapshot
 * taken at build time would orphan them. Four owners share this: a function
 * child's binding, a For row, a For fallback, and mount.
 *
 * The one ordering rule lives here too: `own(range)` registers the clearing
 * cleanup, and callers register it BEFORE building children, so LIFO cleanup
 * runs it LAST — every nested binding clears its own range while its markers
 * are still attached, and the outer range then removes what is left.
 * (F1 in docs/review-2026-09.md and H3 in docs/assessment-2026-09.md were
 * both this rule applied in one place and not the next.)
 */

import { onCleanup } from "./reactive"

export interface Range {
  readonly start: Comment
  /** `null` when the range ends at the first node `isEnd` accepts (For rows). */
  readonly end: Comment | null
  /** The nodes strictly between the markers, read from the live DOM. */
  nodes(): ChildNode[]
  /** Remove the contents and the markers. Safe to call more than once. */
  clear(): void
}

export function createRange(
  label: string,
  options?: { end?: false; isEnd: (node: ChildNode) => boolean },
): Range {
  const start = document.createComment(label)
  const end = options?.end === false ? null : document.createComment(`/${label}`)
  const isEnd = options?.isEnd
  const nodes = (): ChildNode[] => {
    const out: ChildNode[] = []
    let node: ChildNode | null = start.nextSibling
    while (node && node !== end && !(isEnd && isEnd(node))) {
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
      for (const node of nodes()) node.remove()
      start.remove()
      end?.remove()
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
      for (const node of nodes()) node.remove()
    },
  }
}

/** Register the range's teardown on the current owner. Call BEFORE building
 *  the range's children (see the file comment). */
export function own(range: Range): void {
  onCleanup(() => range.clear())
}

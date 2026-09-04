/**
 * vint DOM layer — VanJS-shaped tag functions over the reactive core.
 * Clause numbers refer to docs/contract.md (§D). Prop routing lives in
 * props.ts; node ranges in range.ts.
 */

import { DEV, vintError, vintWarn } from "./dev"
import { applyProps, isPropsObject, type Props } from "./props"
import type { SvgTagPropsMap, TagPropsMap } from "./props.generated"
import { createRange, detach, liveExpansion, own, rememberExpansion, runBetween } from "./range"
import { createRenderEffect, createRoot, onCleanup } from "./reactive"

export type { Props } from "./props"

export type Child = Node | string | number | boolean | null | undefined | (() => Child) | Child[]

// ---------------------------------------------------------------------------
// Children
// ---------------------------------------------------------------------------

/** Flatten a child value to concrete nodes. Called fresh on every binding run
 *  so arrays (and functions nested in them) stay live (D4). */
function normalize(value: Child, out: Node[]): void {
  if (value == null || typeof value === "boolean") return
  if (typeof value === "string") {
    out.push(document.createTextNode(value))
    return
  }
  if (typeof value === "number") {
    out.push(document.createTextNode(String(value)))
    return
  }
  if (typeof value === "function") {
    normalize(value(), out) // tracked by the enclosing binding (D4)
    return
  }
  if (Array.isArray(value)) {
    for (const child of value) normalize(child, out)
    return
  }
  // realm-safe fragment check (instanceof breaks across happy-dom realms)
  if ((value as Node).nodeType === 11 /* DOCUMENT_FRAGMENT_NODE */) {
    const fragment = value as DocumentFragment
    const nodes = fragment.childNodes
    if (nodes.length) {
      // D2: remember the run so the same fragment can come back later —
      // nodes it stops rendering return to it (range.ts detach), and a
      // fragment still in the DOM re-expands to its live contents
      rememberExpansion(fragment, nodes[0] as ChildNode, nodes[nodes.length - 1] as ChildNode)
      out.push(...nodes)
      return
    }
    const live = liveExpansion(fragment)
    if (live) out.push(...live)
    return
  }
  out.push(value)
}

/** Replace the middle of a marker-delimited range, leaving identical
 *  prefix/suffix nodes untouched (D5: focus and media state survive). */
function reconcileRange(end: Comment, current: Node[], next: Node[]): void {
  const parent = end.parentNode
  if (!parent) return
  let prefix = 0
  while (prefix < current.length && prefix < next.length && current[prefix] === next[prefix]) prefix++
  let currentEnd = current.length - 1
  let nextEnd = next.length - 1
  while (currentEnd >= prefix && nextEnd >= prefix && current[currentEnd] === next[nextEnd]) {
    currentEnd--
    nextEnd--
  }
  for (let i = prefix; i <= currentEnd; i++) detach(current[i] as ChildNode)
  const ref = nextEnd + 1 < next.length ? (next[nextEnd + 1] as Node) : end
  for (let i = prefix; i <= nextEnd; i++) parent.insertBefore(next[i] as Node, ref)
}

/** A function child: live binding anchored by a comment pair that exists from
 *  the start — a null first render still renders later (D3). */
function bindChild(parent: Node, fn: () => Child): void {
  const range = createRange("v")
  const end = range.end as Comment
  parent.appendChild(range.start)
  parent.appendChild(end)
  own(range) // before the effect: LIFO runs it after every nested binding's own teardown
  // D5: only a text node THIS binding created may be mutated in place — a
  // user-created Text node is treated as a node (replaced, never mutated)
  let ownedText: Text | null = null
  createRenderEffect(() => {
    const value = fn()
    if (!end.parentNode) {
      if (DEV) vintWarn("E-BIND-DETACHED")
      return
    }
    if (
      (typeof value === "string" || typeof value === "number") &&
      ownedText &&
      range.start.nextSibling === ownedText &&
      ownedText.nextSibling === end
    ) {
      // fast path: our own single text node updates in place (D5)
      ownedText.data = String(value)
      return
    }
    const next: Node[] = []
    normalize(value, next)
    // D3: reconcile against the LIVE range, not a snapshot — nested regions
    // (For rows) insert nodes between our markers after a run
    reconcileRange(end, range.nodes(), next)
    ownedText =
      (typeof value === "string" || typeof value === "number") && next.length === 1
        ? (next[0] as Text)
        : null
  })
}

/** Internal: append any Child to a parent (static or live). */
export function insertChild(parent: Node, child: Child): void {
  if (child == null || typeof child === "boolean") return
  if (typeof child === "function") {
    bindChild(parent, child)
    return
  }
  if (Array.isArray(child)) {
    for (const c of child) insertChild(parent, c)
    return
  }
  if (typeof child === "string" || typeof child === "number") {
    parent.appendChild(document.createTextNode(String(child)))
    return
  }
  parent.appendChild(child)
}

// ---------------------------------------------------------------------------
// Tags (D1)
// ---------------------------------------------------------------------------

/** A tag function: an optional props object first, then children (D1). `P`
 *  is the tag's typed props (D11) — generated from lib.dom for built-in
 *  tags, loose (`Props`) for custom elements and unknown namespaces. */
export type TagFn<E extends Element = HTMLElement, P = Props> = {
  (props: P, ...children: Child[]): E
  (...children: Child[]): E
}

/** D11: built-in tags are typed from lib.dom; a hyphenated (custom-element)
 *  tag accepts any key. `tags.dvi` is a type error. */
export type Tags = {
  [K in keyof HTMLElementTagNameMap]: TagFn<HTMLElementTagNameMap[K], TagPropsMap[K]>
} & { [K in `${string}-${string}`]: TagFn<HTMLElement, Props> }

export type SvgTags = {
  [K in keyof SVGElementTagNameMap]: TagFn<SVGElementTagNameMap[K], SvgTagPropsMap[K]>
} & { [K in `${string}-${string}`]: TagFn<SVGElement, Props> }

export const SVG_NS = "http://www.w3.org/2000/svg"

/** The shape of an element name the platform can accept: a letter, then
 *  letters, digits, `-`, `_`, `.`, `:`. Anything else — `<img onerror=…>`,
 *  an empty string, whitespace — is data that reached a tag position (D10),
 *  and happy-dom accepts what browsers reject, so it is checked here too. */
const VALID_TAG = /^[A-Za-z][-A-Za-z0-9_.:\u00B7\u00C0-\uFFFF]*$/

function createTag(ns: string | null, name: string): TagFn<Element, Props> {
  return ((...args: Array<Props | Child>): Element => {
    if (!VALID_TAG.test(name)) throw vintError("E-TAG-NAME", name) // always on
    let el: Element
    try {
      el = ns ? document.createElementNS(ns, name) : document.createElement(name)
    } catch {
      throw vintError("E-TAG-NAME", name) // always on: the platform rejected it
    }
    let start = 0
    let deferred: Props | null = null
    if (isPropsObject(args[0])) {
      let props = args[0] as Props
      if (name === "select") {
        // D6: a static value/selectedIndex names an option that does not
        // exist yet — apply it after the children (a binding runs later anyway)
        for (const key of ["value", "selectedIndex"]) {
          if (key in props && typeof props[key] !== "function") {
            if (!deferred) {
              deferred = {}
              props = { ...props }
            }
            deferred[key] = props[key]
            delete props[key]
          }
        }
      }
      applyProps(el, props)
      start = 1
    }
    for (let i = start; i < args.length; i++) insertChild(el, args[i] as Child)
    if (deferred) applyProps(el, deferred)
    return el
  }) as TagFn<Element, Props>
}

/** Keys the tag proxy must NOT turn into a tag function. `tags` sits behind a
 *  catch-all `get`, so answering these made it a *thenable* — awaiting
 *  anything that resolved to `tags` would call `tags.then` as a resolver —
 *  and made `String(tags)` and template interpolation throw "Cannot convert
 *  object to primitive value". They are forwarded to the plain target
 *  instead, so `toString`/`valueOf`/`constructor` behave like any object's
 *  and `then`/`$$typeof` are simply absent. None is a valid element name:
 *  HTML has no such tag, and a custom element must contain a hyphen. */
const NON_TAG_KEYS = new Set(["then", "toString", "valueOf", "constructor", "$$typeof"])

function tagProxy(ns: string | null): Record<string, TagFn<Element, Props>> {
  const cache = new Map<string, TagFn<Element, Props>>()
  return new Proxy({} as Record<string, TagFn<Element, Props>>, {
    get(target, name) {
      if (typeof name !== "string") return undefined
      if (NON_TAG_KEYS.has(name)) return Reflect.get(target, name)
      let fn = cache.get(name)
      if (!fn) {
        fn = createTag(ns, name)
        cache.set(name, fn)
      }
      return fn
    },
  })
}

export const tags: Tags = tagProxy(null) as unknown as Tags

/** Namespaced tags, e.g. const svg = tagsNS("http://www.w3.org/2000/svg") —
 *  the SVG namespace gets typed props (D11); any other namespace is loose. */
export function tagsNS(namespace: typeof SVG_NS): SvgTags
export function tagsNS(namespace: string): Record<string, TagFn<Element, Props>>
export function tagsNS(namespace: string): SvgTags | Record<string, TagFn<Element, Props>> {
  return tagProxy(namespace)
}

// ---------------------------------------------------------------------------
// Mount (D9)
// ---------------------------------------------------------------------------

/** Short, safe description of a bad argument for an error message. */
function describe(value: unknown): string {
  if (value === null) return "null"
  if (value === undefined) return "undefined"
  if (typeof value === "string") return `the string ${JSON.stringify(value)}`
  const nodeType = (value as { nodeType?: unknown }).nodeType
  if (nodeType === 9) return "the document"
  if (typeof nodeType === "number") return `a node of type ${nodeType}`
  return `a ${typeof value}`
}

export function mount(container: Element, view: () => Child): () => void {
  if (typeof view !== "function") throw vintError("E-MOUNT-VIEW") // always on
  // realm-safe: an Element (1) or a ShadowRoot/DocumentFragment (11). Rejects
  // null, `document` (9), and selector strings — each a raw TypeError before.
  const nodeType = (container as { nodeType?: unknown } | null)?.nodeType
  if (nodeType !== 1 && nodeType !== 11) {
    throw vintError("E-MOUNT-CONTAINER", describe(container)) // always on
  }
  let dispose: (() => void) | null = null
  try {
    return createRoot((d) => {
      dispose = d
      const fragment = document.createDocumentFragment()
      let appended: ChildNode[] = []
      // D9: registered BEFORE the view builds, so LIFO runs it LAST — every
      // binding created below clears its own range while its markers are
      // still attached, and we then remove what is left: the LIVE run from
      // the first to the last node we appended (a region another root put
      // between them goes too), or the nodes themselves if that run broke.
      onCleanup(() => {
        const first = appended[0]
        const last = appended[appended.length - 1]
        const run =
          first && last && first.parentNode === container && last.parentNode === container
            ? runBetween(first, last)
            : null
        for (const node of run ?? appended) detach(node)
      })
      insertChild(fragment, view()) // view runs exactly once (R1)
      appended = [...fragment.childNodes]
      container.appendChild(fragment)
      return d
    })
  } catch (err) {
    // D9: a throwing view — or a binding whose first run throws in the
    // flush after the body — leaves nothing subscribed and nothing appended
    if (dispose) {
      try {
        ;(dispose as () => void)()
      } catch (disposeError) {
        throw new AggregateError([err, disposeError], "mount view and its disposal both threw")
      }
    }
    throw err
  }
}

/**
 * vint DOM layer — VanJS-shaped tag functions over the reactive core.
 * Clause numbers refer to docs/contract.md (§D).
 */

import { createRenderEffect, createRoot, onCleanup } from "./reactive"

export type Child =
  | Node
  | string
  | number
  | boolean
  | null
  | undefined
  | (() => Child)
  | Child[]

export type Props = Record<string, unknown>

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
  if (value instanceof DocumentFragment) {
    out.push(...value.childNodes)
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
  for (let i = prefix; i <= currentEnd; i++) (current[i] as ChildNode).remove()
  const ref = nextEnd + 1 < next.length ? (next[nextEnd + 1] as Node) : end
  for (let i = prefix; i <= nextEnd; i++) parent.insertBefore(next[i] as Node, ref)
}

/** A function child: live binding anchored by a comment pair that exists from
 *  the start — a null first render still renders later (D3). */
function bindChild(parent: Node, fn: () => Child): void {
  const start = document.createComment("v")
  const end = document.createComment("/v")
  parent.appendChild(start)
  parent.appendChild(end)
  let current: Node[] = []
  createRenderEffect(() => {
    const value = fn()
    // fast path: single text node updates in place (D5)
    if (
      (typeof value === "string" || typeof value === "number") &&
      current.length === 1 &&
      current[0] instanceof Text
    ) {
      ;(current[0] as Text).data = String(value)
      return
    }
    const next: Node[] = []
    normalize(value, next)
    reconcileRange(end, current, next)
    current = next
  })
  onCleanup(() => {
    for (const node of current) (node as ChildNode).remove()
    start.remove()
    end.remove()
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
// Props (D6–D8)
// ---------------------------------------------------------------------------

function setAttribute(el: Element, name: string, value: unknown): void {
  if (value === false || value == null) el.removeAttribute(name)
  else if (value === true) el.setAttribute(name, "")
  else el.setAttribute(name, String(value))
}

function applyStyle(el: Element, value: unknown): void {
  const style = (el as HTMLElement).style
  if (typeof value === "string") {
    style.cssText = value
    return
  }
  style.cssText = ""
  if (value && typeof value === "object") {
    for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
      if (v == null) continue
      style.setProperty(key.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`), String(v))
    }
  }
}

function setProp(el: Element, key: string, value: unknown): void {
  if (key.startsWith("prop:")) {
    ;(el as unknown as Record<string, unknown>)[key.slice(5)] = value
    return
  }
  if (key.startsWith("attr:")) {
    setAttribute(el, key.slice(5), value)
    return
  }
  if (key === "style") {
    applyStyle(el, value)
    return
  }
  // D6: settable property wins — this is what makes Lit/vi-* elements work
  if (key in el) {
    try {
      ;(el as unknown as Record<string, unknown>)[key] = value
      return
    } catch {
      // readonly property — fall through to attribute
    }
  }
  setAttribute(el, key, value)
}

function isPropsObject(value: unknown): value is Props {
  return typeof value === "object" && value !== null && !Array.isArray(value) && !(value instanceof Node)
}

function applyProps(el: Element, props: Props): void {
  for (const [key, value] of Object.entries(props)) {
    if (key.startsWith("on") && typeof value === "function") {
      // D8: attached once, lives as long as the element, never reactive.
      // "onclick" → click; "on:vi-change" → vi-change (exact name).
      const type = key.startsWith("on:") ? key.slice(3) : key.slice(2).toLowerCase()
      el.addEventListener(type, value as EventListener)
    } else if (typeof value === "function") {
      // D7: reactive prop
      createRenderEffect(() => setProp(el, key, (value as () => unknown)()))
    } else {
      setProp(el, key, value)
    }
  }
}

// ---------------------------------------------------------------------------
// Tags (D1)
// ---------------------------------------------------------------------------

export type TagFn<E extends Element = HTMLElement> = (...args: Array<Props | Child>) => E

export type Tags = { [K in keyof HTMLElementTagNameMap]: TagFn<HTMLElementTagNameMap[K]> } & Record<
  string,
  TagFn<HTMLElement>
>

function createTag(ns: string | null, name: string): TagFn<Element> {
  return (...args: Array<Props | Child>): Element => {
    const el = ns ? document.createElementNS(ns, name) : document.createElement(name)
    let start = 0
    if (isPropsObject(args[0])) {
      applyProps(el, args[0] as Props)
      start = 1
    }
    for (let i = start; i < args.length; i++) insertChild(el, args[i] as Child)
    return el
  }
}

function tagProxy(ns: string | null): Record<string, TagFn<Element>> {
  const cache = new Map<string, TagFn<Element>>()
  return new Proxy({} as Record<string, TagFn<Element>>, {
    get(_, name) {
      if (typeof name !== "string") return undefined
      let fn = cache.get(name)
      if (!fn) {
        fn = createTag(ns, name)
        cache.set(name, fn)
      }
      return fn
    },
  })
}

export const tags: Tags = tagProxy(null) as Tags

/** Namespaced tags, e.g. const svg = tagsNS("http://www.w3.org/2000/svg"). */
export function tagsNS(namespace: string): Record<string, TagFn<Element>> {
  return tagProxy(namespace)
}

// ---------------------------------------------------------------------------
// Mount (D9)
// ---------------------------------------------------------------------------

export function mount(container: Element, view: () => Child): () => void {
  return createRoot((dispose) => {
    const fragment = document.createDocumentFragment()
    insertChild(fragment, view()) // view runs exactly once (R1)
    const nodes = [...fragment.childNodes]
    container.appendChild(fragment)
    onCleanup(() => {
      for (const node of nodes) node.remove()
    })
    return dispose
  })
}

/**
 * vint DOM layer — VanJS-shaped tag functions over the reactive core.
 * Clause numbers refer to docs/contract.md (§D).
 */

import { DEV, vintError, vintWarn } from "./dev"

import { __currentSourceCount, createRenderEffect, createRoot, onCleanup } from "./reactive"

export type Child = Node | string | number | boolean | null | undefined | (() => Child) | Child[]

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
  // realm-safe fragment check (instanceof breaks across happy-dom realms)
  if ((value as Node).nodeType === 11 /* DOCUMENT_FRAGMENT_NODE */) {
    out.push(...(value as DocumentFragment).childNodes)
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
  // D3: reconcile against the LIVE range, not a snapshot — nested regions
  // (For rows) insert nodes between our markers after a run, and a snapshot
  // would orphan them on the next run.
  const liveNodes = (): ChildNode[] => {
    const out: ChildNode[] = []
    let node: ChildNode | null = start.nextSibling
    while (node && node !== end) {
      out.push(node)
      node = node.nextSibling
    }
    return out
  }
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
      start.nextSibling === ownedText &&
      ownedText.nextSibling === end
    ) {
      // fast path: our own single text node updates in place (D5)
      ownedText.data = String(value)
      return
    }
    const next: Node[] = []
    normalize(value, next)
    reconcileRange(end, liveNodes(), next)
    ownedText =
      (typeof value === "string" || typeof value === "number") && next.length === 1
        ? (next[0] as Text)
        : null
  })
  onCleanup(() => {
    for (const node of liveNodes()) node.remove()
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

/** Keys the style binding set on each element last run — object values are
 *  DIFFED (D7): stale keys removed, styles set outside the binding untouched
 *  (a blanket cssText reset would also restart CSS transitions every run). */
const appliedStyleKeys = new WeakMap<Element, Set<string>>()

function applyStyle(el: Element, value: unknown): void {
  const style = (el as HTMLElement).style
  if (typeof value === "string") {
    style.cssText = value
    appliedStyleKeys.delete(el)
    return
  }
  const prev = appliedStyleKeys.get(el)
  if (!prev) style.cssText = "" // first object run, or replacing a string value
  const next = new Set<string>()
  if (value && typeof value === "object") {
    for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
      if (v == null) continue
      const cssKey = key.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)
      style.setProperty(cssKey, String(v))
      next.add(cssKey)
    }
  }
  if (prev) for (const key of prev) if (!next.has(key)) style.removeProperty(key)
  appliedStyleKeys.set(el, next)
}

const RAW_HTML_KEYS = new Set(["innerHTML", "outerHTML", "srcdoc"])

/** Props whose value a browser will navigate to or load (D10). */
const URL_KEYS = new Set(["href", "src", "action", "formAction", "formaction", "poster"])

/** Dev-only scheme check (D10, E-URL-SCHEME). Browsers strip ASCII control
 *  characters and spaces before matching a scheme, so `java\tscript:` runs —
 *  strip them the same way rather than trusting the literal prefix. */
function checkUrlScheme(key: string, value: unknown): void {
  if (typeof value !== "string") return
  // biome-ignore lint/suspicious/noControlCharactersInRegex: matching what the URL parser strips is the point
  const url = value.replace(/[\u0000-\u0020]/g, "").toLowerCase()
  if (
    url.startsWith("javascript:") ||
    url.startsWith("vbscript:") ||
    (url.startsWith("data:") && !url.startsWith("data:image/"))
  ) {
    vintWarn("E-URL-SCHEME", key)
  }
}

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

function setProp(el: Element, key: string, value: unknown): void {
  if (key === "__proto__" || key === "prop:__proto__") {
    // never let a data-derived key swap an element's prototype (D6)
    if (DEV) vintWarn("E-PROTO-KEY")
    return
  }
  if (DEV) {
    // strip a prop:/attr: prefix so both routings are checked (D10)
    const bare = key.startsWith("prop:") || key.startsWith("attr:") ? key.slice(5) : key
    // warn, then proceed on both — legitimate uses exist (D10)
    if (RAW_HTML_KEYS.has(bare)) vintWarn("E-RAW-HTML", key)
    if (URL_KEYS.has(bare)) checkUrlScheme(key, value)
  }
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
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    !(value instanceof Node) &&
    typeof (value as { nodeType?: unknown }).nodeType !== "number" // realm-safe
  )
}

function applyProps(el: Element, props: Props): void {
  for (const [key, value] of Object.entries(props)) {
    // Solid-prior traps get prescriptive errors, not silent misbehavior (D7)
    if (key === "ref") throw vintError("E-NO-REF") // always on
    if (key === "classList") throw vintError("E-NO-CLASSLIST") // always on
    if (key.startsWith("on") && key.length > 2) {
      if (typeof value === "function") {
        // D8: attached once, lives as long as the element, never reactive.
        // "onclick" → click; "on:vi-change" → vi-change (exact name).
        const type = key.startsWith("on:") ? key.slice(3) : key.slice(2).toLowerCase()
        el.addEventListener(type, value as EventListener)
      } else if (DEV) {
        // never fall through to a live setAttribute("onclick", ...) path (D8)
        vintWarn("E-EVENT-VALUE", key)
      }
    } else if (typeof value === "function" && !key.startsWith("prop:")) {
      // D7: reactive prop. Bindings take no arguments — a parameterized
      // function here was almost certainly meant as a callback VALUE (the
      // Lit/custom-element seam); prescribe prop: instead of silently
      // calling it and assigning the return.
      if (DEV && (value as (...args: unknown[]) => unknown).length > 0) {
        vintWarn("E-CALLBACK-PROP", key)
      }
      // Two things can only be judged after the binding has run once: whether
      // it overwrote a function-valued property (the element shipped a default
      // renderer and we just destroyed it), and whether it tracked anything at
      // all. Skipped when the arity check above already fired.
      let firstRun = DEV && (value as (...args: unknown[]) => unknown).length === 0
      createRenderEffect(() => {
        const next = (value as () => unknown)()
        if (firstRun) {
          firstRun = false
          if (
            typeof (el as unknown as Record<string, unknown>)[key] === "function" &&
            typeof next !== "function"
          ) {
            vintWarn("E-CALLBACK-PROP", key)
          } else if (__currentSourceCount() === 0) {
            // dependencies are collected per run (R3), so a run that tracked
            // nothing can never be re-triggered — this binding is dead
            vintWarn("E-DEAD-BINDING", key)
          }
        }
        setProp(el, key, next)
      })
    } else {
      // includes prop:-prefixed functions — assigned as-is, the one way to
      // store a function as a property value (D8)
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

/** Keys the tag proxy must NOT turn into a tag function. `tags` sits behind a
 *  catch-all `get`, so answering these made it a *thenable* — awaiting
 *  anything that resolved to `tags` would call `tags.then` as a resolver —
 *  and made `String(tags)` and template interpolation throw "Cannot convert
 *  object to primitive value". They are forwarded to the plain target
 *  instead, so `toString`/`valueOf`/`constructor` behave like any object's
 *  and `then`/`$$typeof` are simply absent. None is a valid element name:
 *  HTML has no such tag, and a custom element must contain a hyphen. */
const NON_TAG_KEYS = new Set(["then", "toString", "valueOf", "constructor", "$$typeof"])

function tagProxy(ns: string | null): Record<string, TagFn<Element>> {
  const cache = new Map<string, TagFn<Element>>()
  return new Proxy({} as Record<string, TagFn<Element>>, {
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

export const tags: Tags = tagProxy(null) as Tags

/** Namespaced tags, e.g. const svg = tagsNS("http://www.w3.org/2000/svg"). */
export function tagsNS(namespace: string): Record<string, TagFn<Element>> {
  return tagProxy(namespace)
}

// ---------------------------------------------------------------------------
// Mount (D9)
// ---------------------------------------------------------------------------

export function mount(container: Element, view: () => Child): () => void {
  if (typeof view !== "function") throw vintError("E-MOUNT-VIEW") // always on
  // realm-safe: an Element (1) or a ShadowRoot/DocumentFragment (11). Rejects
  // null, `document` (9), and selector strings — each a raw TypeError before.
  const nodeType = (container as { nodeType?: unknown } | null)?.nodeType
  if (nodeType !== 1 && nodeType !== 11) {
    throw vintError("E-MOUNT-CONTAINER", describe(container)) // always on
  }
  return createRoot((dispose) => {
    const fragment = document.createDocumentFragment()
    let appended: ChildNode[] = []
    // D9: registered BEFORE the view builds, so LIFO runs it LAST — every
    // binding created below clears its own range while its markers are still
    // attached, and we then remove what is left. Registering it after would
    // detach those markers first and orphan whatever the bindings rendered
    // (their content lands between the markers only once the flush runs,
    // after this body returns, so it is never in `appended`).
    onCleanup(() => {
      for (const node of appended) node.remove()
    })
    insertChild(fragment, view()) // view runs exactly once (R1)
    appended = [...fragment.childNodes]
    container.appendChild(fragment)
    return dispose
  })
}

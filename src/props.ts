/**
 * vint prop routing — contract D6–D8, D10. One decision per key, made from a
 * table of shapes rather than a chain of string tests, because every defect
 * in this area (H4, M5, L11, L12, L18 in docs/assessment-2026-09.md) was a
 * case the chain reasoned about correctly for lowercase, string,
 * HTML-element input and wrongly for the next input along.
 */

import { DEV, vintError, vintWarn } from "./dev"
import { __currentSourceCount, createRenderEffect } from "./reactive"

export type Props = Record<string, unknown>

// ---------------------------------------------------------------------------
// Attributes and style
// ---------------------------------------------------------------------------

/** The platform's attribute-name grammar (D6): a raw DOMException in browsers,
 *  silently accepted by happy-dom — checked here so both behave the same. */
const VALID_ATTR = /^[A-Za-z_:][-A-Za-z0-9_.:\u00B7\u00C0-\uFFFF]*$/

function setAttribute(el: Element, name: string, value: unknown): void {
  if (!VALID_ATTR.test(name)) {
    if (DEV) vintWarn("E-ATTR-NAME", name)
    return
  }
  if (value === false || value == null) el.removeAttribute(name)
  else if (value === true) el.setAttribute(name, "")
  else el.setAttribute(name, String(value))
}

/** What the style binding last set on each element: the keys of an object
 *  value (DIFFED per run — stale keys removed, styles set outside the binding
 *  untouched, D7), or STRING when the binding set cssText itself. Absent on
 *  the first run, which therefore never clears what the element already has. */
const STRING = Symbol("style:string")
const appliedStyle = new WeakMap<Element, Set<string> | typeof STRING>()

function applyStyle(el: Element, value: unknown): void {
  const style = (el as HTMLElement).style
  if (typeof value === "string") {
    style.cssText = value
    appliedStyle.set(el, STRING)
    return
  }
  const prev = appliedStyle.get(el)
  // only a string THIS binding set is replaced wholesale — the element's own
  // inline styles survive the first object run (D7)
  if (prev === STRING) style.cssText = ""
  const next = new Set<string>()
  if (value && typeof value === "object") {
    for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
      if (v == null) continue
      const cssKey = key.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)
      style.setProperty(cssKey, String(v))
      next.add(cssKey)
    }
  }
  if (prev && prev !== STRING) for (const key of prev) if (!next.has(key)) style.removeProperty(key)
  appliedStyle.set(el, next)
}

// ---------------------------------------------------------------------------
// Dev-only sink checks (D10)
// ---------------------------------------------------------------------------

const RAW_HTML_KEYS = new Set(["innerhtml", "outerhtml", "srcdoc"])

/** Props whose value a browser will navigate to or load, lowercased (D10). */
const URL_KEYS = new Set(["href", "src", "action", "formaction", "poster", "data", "xlink:href"])

/** Browsers strip ASCII control characters and spaces before matching a
 *  scheme, so `java\tscript:` runs — strip them the same way rather than
 *  trusting the literal prefix. The value is stringified first: a URL object
 *  or a toString-carrying object reaches the sink as a string too (L11). */
// biome-ignore lint/suspicious/noControlCharactersInRegex: matching what the URL parser strips is the point
const URL_NOISE = /[\u0000-\u0020]/g

/** Where a `data:image/…` URL can only ever be an image (D10): the element's
 *  own image-loading props. Anywhere else — `a[href]`, `iframe[src]`,
 *  `object[data]` — an SVG data URL is a document, and documents run script. */
const IMAGE_SINK_KEYS = new Set(["src", "srcset", "poster"])
const IMAGE_SINK_TAGS = new Set(["img", "picture", "source", "video", "audio", "track"])

function checkUrlScheme(el: Element, key: string, bare: string, value: unknown): void {
  if (value == null || typeof value === "boolean") return
  const url = String(value).replace(URL_NOISE, "").toLowerCase()
  if (url.startsWith("javascript:") || url.startsWith("vbscript:")) {
    vintWarn("E-URL-SCHEME", key)
    return
  }
  if (url.startsWith("data:")) {
    const imageSink =
      url.startsWith("data:image/") &&
      IMAGE_SINK_KEYS.has(bare.toLowerCase()) &&
      IMAGE_SINK_TAGS.has(el.localName)
    if (!imageSink) vintWarn("E-URL-SCHEME", key)
  }
}

// ---------------------------------------------------------------------------
// Routing
// ---------------------------------------------------------------------------

/** The prefix a key carries, if any. Case-sensitive on purpose: `prop:` and
 *  `attr:` are vint syntax, not element vocabulary. */
const prefixOf = (key: string): "prop" | "attr" | "on" | null =>
  key.startsWith("prop:")
    ? "prop"
    : key.startsWith("attr:")
      ? "attr"
      : key.startsWith("on:")
        ? "on"
        : null

/** An event-handler key: `on` + anything, in ANY casing (D8). Attribute names
 *  are case-insensitive in HTML documents, so `OnClick` would otherwise reach
 *  setAttribute as a live `onclick` (H4). */
const isEventKey = (key: string): boolean =>
  key.length > 2 && (key[0] === "o" || key[0] === "O") && (key[1] === "n" || key[1] === "N")

function setProp(el: Element, key: string, value: unknown): void {
  if (key === "__proto__" || key === "prop:__proto__") {
    // never let a data-derived key swap an element's prototype (D6)
    if (DEV) vintWarn("E-PROTO-KEY")
    return
  }
  const prefix = prefixOf(key)
  const bare = prefix === "prop" || prefix === "attr" ? key.slice(5) : key
  if (DEV) {
    // warn, then proceed on both — legitimate uses exist (D10)
    const lower = bare.toLowerCase()
    if (RAW_HTML_KEYS.has(lower)) vintWarn("E-RAW-HTML", key)
    if (URL_KEYS.has(lower)) checkUrlScheme(el, key, bare, value)
  }
  if (prefix === "prop") {
    try {
      ;(el as unknown as Record<string, unknown>)[bare] = value
    } catch (err) {
      // a getter-only property: say so instead of a raw TypeError (D6). Any
      // other failure (an enumerated property rejecting the value) is real.
      if (!(err instanceof TypeError)) throw err
      if (DEV) vintWarn("E-READONLY-PROP", key)
    }
    return
  }
  if (prefix === "attr") {
    if (isEventKey(bare)) {
      // D8: vint never writes an inline event-handler attribute
      if (DEV) vintWarn("E-EVENT-ATTR", key)
      return
    }
    setAttribute(el, bare, value)
    return
  }
  if (key === "style") {
    applyStyle(el, value)
    return
  }
  // D6: settable property wins — this is what makes Lit/vi-* elements work
  if (key in el) {
    const target = el as unknown as Record<string, unknown>
    const current = target[key]
    // D6: nullish CLEARS, whatever the platform would coerce it to — "null"
    // on a string, 0 on a number (maxLength: null must not mean "no
    // characters"), true on a boolean. A non-primitive property (a custom
    // element's object prop) takes the value as-is. `false` on a string
    // property clears too: `href: () => cond() && url` must not navigate
    // to "/false".
    if (value == null || (value === false && typeof current === "string")) {
      if (typeof current === "string") {
        try {
          if (current !== "") target[key] = ""
        } catch {
          // enumerated or getter-only string property — the attribute removal below is the clear
        }
        el.removeAttribute(attributeName(key))
        return
      }
      if (typeof current === "number") {
        el.removeAttribute(attributeName(key)) // back to the reflected default
        return
      }
      if (typeof current === "boolean") {
        if (current) target[key] = false
        return
      }
    } else if (current === value) {
      return // D6: an equal assignment is skipped (keeps the caret, L18)
    }
    try {
      target[key] = value
      return
    } catch {
      // readonly property — fall through to attribute
    }
  }
  setAttribute(el, key, value)
}

/** The reflected attribute for an IDL property name (D6): a few are not
 *  simply the lowercase of the property. */
const ATTRIBUTE_ALIASES: Record<string, string> = {
  className: "class",
  htmlFor: "for",
  httpEquiv: "http-equiv",
  acceptCharset: "accept-charset",
}
const attributeName = (key: string): string => ATTRIBUTE_ALIASES[key] ?? key.toLowerCase()

export function applyProps(el: Element, props: Props): void {
  for (const [key, value] of Object.entries(props)) {
    // Solid-prior traps get prescriptive errors, not silent misbehavior (D7)
    if (key === "ref") throw vintError("E-NO-REF") // always on
    if (key === "classList") throw vintError("E-NO-CLASSLIST") // always on
    const prefix = prefixOf(key)
    if (prefix === "attr" && isEventKey(key.slice(5))) {
      // D8: never an inline handler attribute — and never CALL the value as
      // a binding on the way there
      if (DEV) vintWarn("E-EVENT-ATTR", key)
      continue
    }
    if (prefix === "on" || (prefix === null && isEventKey(key))) {
      if (typeof value === "function") {
        // D8: attached once, lives as long as the element, never reactive.
        // "onclick" → click (lowercased); "on:vi-change" → vi-change (exact).
        const type = prefix === "on" ? key.slice(3) : key.slice(2).toLowerCase()
        el.addEventListener(type, value as EventListener)
      } else if (DEV && value != null) {
        // never fall through to a live setAttribute("onclick", ...) path (D8);
        // `onclick: cond ? handler : null` is an ordinary "no handler"
        vintWarn("E-EVENT-VALUE", key)
      }
    } else if (typeof value === "function" && prefix !== "prop") {
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

/** A props object is a plain object: not a node, not an array (D1). A node
 *  is recognised realm-safely by shape — a numeric nodeType AND a cloneNode
 *  method — so a data object that merely carries a `nodeType` field is props,
 *  not something to append. */
export function isPropsObject(value: unknown): value is Props {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false
  if (value instanceof Node) return false
  const v = value as { nodeType?: unknown; cloneNode?: unknown }
  return !(typeof v.nodeType === "number" && typeof v.cloneNode === "function")
}

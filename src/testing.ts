/**
 * vint/testing — the verification loop (contract §T). Helpers a model would
 * guess the names of, working against any DOM (happy-dom in Node, or a real
 * browser), with no runner of their own: `test`/`describe` come from
 * `vint verify` or vitest, assertions from node:assert or the runner.
 *
 * ONE RUNTIME INSTANCE: this module imports vint through a single specifier
 * (`./index`) that the build rewrites to the same import the app uses —
 * `./vint.js` in the vendored file, `vint` in the package file. A second copy
 * of the scheduler would subscribe nothing and render once, silently.
 */

import { type Child, mount } from "./index"

export interface RenderResult {
  container: Element
  dispose: () => void
}

/** Results `render` produced that are still mounted (T1). */
const live = new Set<RenderResult>()

/** T1: mount `view` (a component FUNCTION) into a fresh container appended to
 *  document.body, or into `opts.container`. `dispose` tears down every
 *  binding (D9) and removes the container only if render created it. */
export function render(view: () => Child, opts?: { container?: Element }): RenderResult {
  if (typeof view !== "function") {
    throw new Error(
      "render(): pass the component function — render(App) or render(() => App()) — not a built element; bindings must be created inside the root so dispose can clean them.",
    )
  }
  const own = !opts?.container
  const container = opts?.container ?? document.createElement("div")
  if (own) document.body.appendChild(container)
  const unmount = mount(container, view)
  const result: RenderResult = {
    container,
    dispose() {
      if (!live.delete(result)) return // T1: idempotent
      unmount()
      if (own) container.remove()
    },
  }
  live.add(result)
  return result
}

/** T1: dispose every render result still mounted; returns how many there
 *  were. `vint verify` calls it after each test (through the global below, so
 *  the runner needs no import); under vitest, `afterEach(disposeAll)`. */
export function disposeAll(): number {
  const pending = [...live]
  for (const r of pending) r.dispose()
  return pending.length
}

;(globalThis as unknown as Record<symbol, unknown>)[Symbol.for("vint.testing")] = { disposeAll }

/** T2: one macrotask. vint flushes synchronously, so writes and clicks need
 *  no await; resources complete on promise chains of unknown depth, and a
 *  macrotask boundary guarantees the whole microtask queue has drained.
 *  Timers and I/O are not awaited — use waitFor for those. */
export function settle(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

/** Synchronous native activation: after click() returns, the DOM is final. */
export function click(el: Element | null | undefined): void {
  if (!el) throw new Error(`click(): got ${el} — byText found nothing?`)
  ;(el as HTMLElement).click()
}

/** Assign through the native prototype setter, so value-tracking elements
 *  (React-style, or a custom element with its own accessor) observe it. */
function setNative(el: Element, value: string): void {
  let proto: object | null = Object.getPrototypeOf(el)
  let setter: ((v: string) => void) | undefined
  while (proto && !setter) {
    const desc = Object.getOwnPropertyDescriptor(proto, "value")
    if (desc?.set) setter = desc.set
    proto = Object.getPrototypeOf(proto)
  }
  if (setter) setter.call(el, value)
  else (el as unknown as { value: string }).value = value
}

/** T3: set a form control's value the way a user would — through the
 *  native prototype setter, then bubbling `input` and `change` events — so
 *  value-tracking elements observe it too. */
export function setValue(el: Element, value: string): void {
  setNative(el, value)
  el.dispatchEvent(new Event("input", { bubbles: true }))
  el.dispatchEvent(new Event("change", { bubbles: true }))
}

/** T4: user-perceived characters — grapheme clusters where the platform
 *  segments them, code points where it cannot. A combining sequence or an
 *  emoji family is one keystroke, never a half-typed intermediate. */
function graphemes(text: string): string[] {
  const Segmenter = (Intl as { Segmenter?: typeof Intl.Segmenter }).Segmenter
  if (!Segmenter) return [...text]
  return [...new Segmenter().segment(text)].map((g) => g.segment)
}

/** A CompositionEvent carrying `data`, defined by hand when the platform's
 *  constructor drops the init (happy-dom does). */
function compositionEvent(type: string, data: string): Event {
  const Ctor = (globalThis as { CompositionEvent?: typeof CompositionEvent }).CompositionEvent
  const event: Event = Ctor
    ? new Ctor(type, { bubbles: true, cancelable: true, data })
    : new Event(type, { bubbles: true, cancelable: true })
  if ((event as { data?: unknown }).data !== data) Object.defineProperty(event, "data", { value: data })
  return event
}

/** An `input` event as an input method fires it mid-composition. */
function compositionInput(data: string): Event {
  const Ctor = (globalThis as { InputEvent?: typeof InputEvent }).InputEvent
  if (Ctor) {
    return new Ctor("input", {
      bubbles: true,
      isComposing: true,
      inputType: "insertCompositionText",
      data,
    })
  }
  const event = new Event("input", { bubbles: true })
  Object.defineProperties(event, {
    isComposing: { value: true },
    inputType: { value: "insertCompositionText" },
    data: { value: data },
  })
  return event
}

/** T4: focus, then set one grapheme at a time — one `input` (and `change`)
 *  per keystroke, synchronously (a stated divergence from userEvent.type).
 *  `{ ime: true }` models an input-method composition in the UI Events
 *  order: `compositionstart`; per grapheme a `compositionupdate` and an
 *  `input` with `isComposing: true` and `inputType: "insertCompositionText"`;
 *  `compositionend` with the composed text; then one `change`. A handler
 *  that ignores composing `input` events must read the value on
 *  `compositionend` — that is what the option exists to test. */
export function type(el: Element, text: string, opts?: { ime?: boolean }): void {
  ;(el as HTMLElement).focus?.()
  const current = (el as unknown as { value?: unknown }).value
  const base = typeof current === "string" ? current : ""
  if (!opts?.ime) {
    let value = base
    for (const g of graphemes(text)) {
      value += g
      setValue(el, value)
    }
    return
  }
  el.dispatchEvent(compositionEvent("compositionstart", ""))
  let composed = ""
  for (const g of graphemes(text)) {
    composed += g
    el.dispatchEvent(compositionEvent("compositionupdate", composed))
    setNative(el, base + composed)
    el.dispatchEvent(compositionInput(composed))
  }
  el.dispatchEvent(compositionEvent("compositionend", composed))
  el.dispatchEvent(new Event("change", { bubbles: true }))
}

/** Dispatch a bubbling, cancelable Event (init spread in); returns
 *  dispatchEvent's result — false when a handler called preventDefault. */
export function fire(
  el: Element,
  eventType: string,
  init?: EventInit & Record<string, unknown>,
): boolean {
  const event = new Event(eventType, { bubbles: true, cancelable: true, ...init })
  if (init)
    for (const [k, v] of Object.entries(init))
      if (!(k in event)) (event as unknown as Record<string, unknown>)[k] = v
  return el.dispatchEvent(event)
}

/** keydown then keyup for `key`; no implicit form submission. */
export function pressKey(el: Element, key: string, init?: KeyboardEventInit): void {
  el.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init }))
  el.dispatchEvent(new KeyboardEvent("keyup", { key, bubbles: true, cancelable: true, ...init }))
}

/** T4: what two texts must agree on to match — NFC-normalized, every run
 *  of Unicode whitespace (no-break and narrow no-break spaces included —
 *  `Intl.NumberFormat` emits them) collapsed to one space, ends trimmed.
 *  Applied to BOTH sides, so a test can spell "1 234" with a plain space and
 *  a decomposed "é" from an API matches the precomposed one in the test. */
const norm = (s: string): string => s.normalize("NFC").replace(/\s+/g, " ").trim()

/** The innermost element under `root` (matching `selector`, default any)
 *  whose normalized textContent (T4) equals `text`. THROWS with a snapshot
 *  when nothing matches — "cannot read 'click' of undefined" is the worst
 *  diagnosis an agent can get. */
export function byText(root: ParentNode, text: string, selector = "*"): Element {
  const wanted = norm(text)
  const matches = [...root.querySelectorAll(selector)].filter(
    (e) => norm(e.textContent ?? "") === wanted,
  )
  const innermost = matches.find((e) => !matches.some((other) => other !== e && e.contains(other)))
  if (!innermost) {
    throw new Error(
      `byText(): no ${selector === "*" ? "element" : `"${selector}"`} with text ${JSON.stringify(text)}. Page text: ${JSON.stringify(snapshot(root))}`,
    )
  }
  return innermost
}

/** Is `text` visibly rendered under `root`: an element whose whole text
 *  normalizes (T4) to it, or a run of adjacent text nodes (binding markers
 *  allowed between them) that does, with no inline display:none up the
 *  chain. The element, or null. */
export function visibleText(root: Element, text: string): Element | null {
  const wanted = norm(text)
  const visible = (el: Element): boolean => {
    for (let n: Element | null = el; n && n !== root; n = n.parentElement) {
      if ((n as HTMLElement).style?.display === "none") return false
    }
    return true
  }
  for (const el of [root, ...root.querySelectorAll("*")]) {
    if (!visible(el)) continue
    if (el !== root && norm(el.textContent ?? "") === wanted) return el
    let run = ""
    for (const child of [...el.childNodes, null]) {
      if (child && child.nodeType === 3) {
        run += (child as Text).data
        continue
      }
      if (child && child.nodeType === 8) continue // a binding's marker
      if (norm(run) === wanted) return el
      run = ""
    }
  }
  return null
}

/** `root`'s textContent, normalized (T4): NFC, whitespace collapsed, trimmed. */
export function text(root: Node): string {
  return norm(root.textContent ?? "")
}

const snapshot = (root: ParentNode): string => text(root as Node).slice(0, 300)

/** Poll `fn` until it returns a truthy value without throwing — every
 *  `interval` ms (default 10), giving up after `timeout` ms (default 1000)
 *  with an error naming what it last saw and the page text. */
export async function waitFor<T>(
  fn: () => T | Promise<T>,
  opts?: { timeout?: number; interval?: number },
): Promise<T> {
  const timeout = opts?.timeout ?? 1000
  const interval = opts?.interval ?? 10
  const deadline = Date.now() + timeout
  let last: unknown
  for (;;) {
    try {
      const value = await fn()
      if (value) return value
      last = value
    } catch (err) {
      last = err
    }
    if (Date.now() >= deadline) {
      const detail = last instanceof Error ? last.message : JSON.stringify(last)
      throw new Error(
        `waitFor(): not satisfied within ${timeout}ms — last: ${detail}. Page text: ${JSON.stringify(snapshot(document.body))}`,
      )
    }
    await new Promise((r) => setTimeout(r, interval))
  }
}

/** Run `fn` and return the vint warning codes (E-…) it produced. vint warns
 *  only through console.warn; the original is restored even if `fn` throws. */
export function captureWarnings(fn: () => Promise<void>): Promise<string[]>
export function captureWarnings(fn: () => void): string[]
export function captureWarnings(fn: () => void | Promise<void>): string[] | Promise<string[]> {
  const codes: string[] = []
  const original = console.warn
  console.warn = (...args: unknown[]) => {
    const code = /^(E-[A-Z-]+)/.exec(String(args[0]))
    if (code) codes.push(code[1] as string)
    else original(...args)
  }
  let result: void | Promise<void>
  try {
    result = fn()
  } catch (err) {
    console.warn = original
    throw err
  }
  if (result && typeof (result as Promise<void>).then === "function") {
    return (result as Promise<void>).then(
      () => {
        console.warn = original
        return codes
      },
      (err) => {
        console.warn = original
        throw err
      },
    )
  }
  console.warn = original
  return codes
}

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

/** T3: set a form control's value the way a user would — through the
 *  native prototype setter, then bubbling `input` and `change` events — so
 *  value-tracking elements observe it too. */
export function setValue(el: Element, value: string): void {
  let proto: object | null = Object.getPrototypeOf(el)
  let setter: ((v: string) => void) | undefined
  while (proto && !setter) {
    const desc = Object.getOwnPropertyDescriptor(proto, "value")
    if (desc?.set) setter = desc.set
    proto = Object.getPrototypeOf(proto)
  }
  if (setter) setter.call(el, value)
  else (el as unknown as { value: string }).value = value
  el.dispatchEvent(new Event("input", { bubbles: true }))
  el.dispatchEvent(new Event("change", { bubbles: true }))
}

/** Focus, then setValue one character at a time — one `input` event per
 *  keystroke, synchronously (a stated divergence from userEvent.type). */
export function type(el: Element, text: string): void {
  ;(el as HTMLElement).focus?.()
  const current = (el as unknown as { value?: unknown }).value
  let value = typeof current === "string" ? current : ""
  for (const ch of text) {
    value += ch
    setValue(el, value)
  }
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

/** The innermost element under `root` (matching `selector`, default any)
 *  whose trimmed textContent equals `text`. THROWS with a snapshot when
 *  nothing matches — "cannot read 'click' of undefined" is the worst
 *  diagnosis an agent can get. */
export function byText(root: ParentNode, text: string, selector = "*"): Element {
  const matches = [...root.querySelectorAll(selector)].filter(
    (e) => (e.textContent ?? "").trim() === text,
  )
  const innermost = matches.find((e) => !matches.some((other) => other !== e && e.contains(other)))
  if (!innermost) {
    throw new Error(
      `byText(): no ${selector === "*" ? "element" : `"${selector}"`} with text ${JSON.stringify(text)}. Page text: ${JSON.stringify(snapshot(root))}`,
    )
  }
  return innermost
}

/** Is `text` visibly rendered under `root`: an element whose whole trimmed
 *  text is it, or a run of adjacent text nodes (binding markers allowed
 *  between them) that trims to it, with no inline display:none up the
 *  chain. The element, or null. */
export function visibleText(root: Element, text: string): Element | null {
  const visible = (el: Element): boolean => {
    for (let n: Element | null = el; n && n !== root; n = n.parentElement) {
      if ((n as HTMLElement).style?.display === "none") return false
    }
    return true
  }
  for (const el of [root, ...root.querySelectorAll("*")]) {
    if (!visible(el)) continue
    if (el !== root && (el.textContent ?? "").trim() === text) return el
    let run = ""
    for (const child of [...el.childNodes, null]) {
      if (child && child.nodeType === 3) {
        run += (child as Text).data
        continue
      }
      if (child && child.nodeType === 8) continue // a binding's marker
      if (run.trim() === text) return el
      run = ""
    }
  }
  return null
}

/** `root`'s textContent with whitespace collapsed. */
export function text(root: Node): string {
  return (root.textContent ?? "").replace(/\s+/g, " ").trim()
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

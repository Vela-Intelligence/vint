// Framework-agnostic DOM interaction helpers for acceptance tests.
// Everything here must be fair to React and to fine-grained frameworks alike.

/** Several macrotask turns — lets schedulers commit (React's batched
 *  renders, VanJS's chained setTimeout updates); a no-op for frameworks
 *  that update synchronously. */
export async function settle() {
  for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0))
  await new Promise((r) => setTimeout(r, 1))
}

/** Set a text input's value the way a user would, in a way React's value
 *  tracking also observes: native prototype setter + bubbling input event. */
export function setInputValue(input, value) {
  const desc =
    Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), "value") ??
    Object.getOwnPropertyDescriptor(globalThis.HTMLInputElement.prototype, "value")
  desc.set.call(input, value)
  input.dispatchEvent(new globalThis.Event("input", { bubbles: true }))
}

/** First element matching `selector` whose trimmed text equals `text`. */
export function byText(root, text, selector = "button") {
  return [...root.querySelectorAll(selector)].find((e) => e.textContent.trim() === text)
}

/** Is `text` visibly rendered, as either (a) an element whose entire
 *  trimmed textContent equals it, or (b) a run of adjacent text nodes
 *  (comment markers allowed between them — fine-grained frameworks render
 *  text bindings as bare, comment-anchored text nodes, not wrapped
 *  elements) that trims to it? Inline display:none anywhere up the chain
 *  hides it. Returns the matching element, or null. */
export function visibleWithText(root, text) {
  const visible = (el) => {
    for (let n = el; n && n !== root; n = n.parentElement) {
      if (n.style && n.style.display === "none") return false
    }
    return true
  }
  for (const el of [root, ...root.querySelectorAll("*")]) {
    if (!visible(el)) continue
    if (el !== root && el.textContent.trim() === text) return el
    let run = ""
    for (const child of [...el.childNodes, null]) {
      if (child && child.nodeType === 3 /* text */) {
        run += child.data
        continue
      }
      if (child && child.nodeType === 8 /* comment — binding markers */) continue
      if (run.trim() === text) return el
      run = ""
    }
  }
  return null
}

export async function click(el) {
  // settle BEFORE clicking as well: real interactions are separated by
  // event-loop turns, and batched schedulers (VanJS coalesces a state that
  // changes and reverts within one turn into "no change") must see the
  // prior interaction flushed first
  await settle()
  el.click()
  await settle()
}

export function assert(cond, message) {
  if (!cond) throw new Error(`ASSERTION FAILED: ${message}`)
}

export function snapshot(root) {
  return root.textContent.replace(/\s+/g, " ").trim().slice(0, 300)
}

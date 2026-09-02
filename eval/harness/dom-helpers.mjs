// Framework-agnostic DOM interaction helpers for acceptance tests.
// Everything here must be fair to React and to fine-grained frameworks alike.

/** Two macrotask turns — lets React commit scheduled renders; a no-op for
 *  frameworks that update synchronously. */
export async function settle() {
  await new Promise((r) => setTimeout(r, 0))
  await new Promise((r) => setTimeout(r, 0))
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

/** Deepest element whose own trimmed textContent is exactly `text` and that
 *  is not hidden by an inline display:none anywhere up the chain. */
export function visibleWithText(root, text) {
  const candidates = [...root.querySelectorAll("*")].filter(
    (e) => e.textContent.trim() === text && e.children.length === 0,
  )
  return candidates.find((e) => {
    for (let n = e; n && n !== root; n = n.parentElement) {
      if (n.style && n.style.display === "none") return false
    }
    return true
  })
}

export async function click(el) {
  el.click()
  await settle()
}

export function assert(cond, message) {
  if (!cond) throw new Error(`ASSERTION FAILED: ${message}`)
}

export function snapshot(root) {
  return root.textContent.replace(/\s+/g, " ").trim().slice(0, 300)
}

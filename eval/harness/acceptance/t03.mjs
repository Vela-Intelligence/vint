// 03-panel-focus acceptance
export async function accept({ module, container, helpers: h }) {
  module.mountApp(container)
  await h.settle()

  const toggle = h.byText(container, "toggle")
  const tick = h.byText(container, "tick")
  h.assert(toggle, `no "toggle" button (got: ${h.snapshot(container)})`)
  h.assert(tick, `no "tick" button`)

  const visibleName = () => {
    const el = container.querySelector("#name")
    if (!el) return null
    for (let n = el; n && n !== container; n = n.parentElement) {
      if (n.style && n.style.display === "none") return null
    }
    return el
  }

  h.assert(!visibleName(), "the panel (input #name) must start hidden")
  h.assert(h.visibleWithText(container, "ticks: 0"), `initial "ticks: 0" missing (got: ${h.snapshot(container)})`)

  await h.click(toggle)
  const name = visibleName()
  h.assert(name, "after toggle, input #name must be visible")

  h.setInputValue(name, "alice")
  name.focus()
  h.assert(document.activeElement === name, "input #name should be focusable")

  await h.click(tick)
  await h.click(tick)
  await h.click(tick)
  h.assert(h.visibleWithText(container, "ticks: 3"), `"ticks: 3" missing after 3 clicks (got: ${h.snapshot(container)})`)

  const nameAfter = visibleName()
  h.assert(nameAfter, "input #name must still be visible after ticks")
  h.assert(nameAfter.value === "alice", `typed value must survive unrelated updates — got "${nameAfter.value}"`)
  h.assert(document.activeElement === nameAfter, "focus must survive unrelated updates (the input was rebuilt or replaced)")
}

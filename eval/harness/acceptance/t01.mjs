// 01-counter acceptance
export async function accept({ module, container, helpers: h }) {
  module.mountApp(container)
  await h.settle()

  const plus = h.byText(container, "+")
  const minus = h.byText(container, "-")
  h.assert(plus, `no button with text "+" (got: ${h.snapshot(container)})`)
  h.assert(minus, `no button with text "-"`)
  const parity = () => container.querySelector("#parity")?.textContent.trim()

  h.assert(h.visibleWithText(container, "count: 0"), `initial "count: 0" missing (got: ${h.snapshot(container)})`)
  h.assert(h.visibleWithText(container, "doubled: 0"), `initial "doubled: 0" missing`)
  h.assert(parity() === "even", `initial #parity should be "even", got "${parity()}"`)

  await h.click(plus)
  await h.click(plus)
  await h.click(plus)
  h.assert(h.visibleWithText(container, "count: 3"), `after 3 clicks of +: "count: 3" missing (got: ${h.snapshot(container)})`)
  h.assert(h.visibleWithText(container, "doubled: 6"), `after 3 clicks of +: "doubled: 6" missing`)
  h.assert(parity() === "odd", `after 3 clicks: #parity should be "odd", got "${parity()}"`)

  await h.click(minus)
  h.assert(h.visibleWithText(container, "count: 2"), `after -: "count: 2" missing (got: ${h.snapshot(container)})`)
  h.assert(h.visibleWithText(container, "doubled: 4"), `after -: "doubled: 4" missing`)
  h.assert(parity() === "even", `after -: #parity should be "even", got "${parity()}"`)
}

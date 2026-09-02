// 02-todos acceptance
export async function accept({ module, container, helpers: h }) {
  module.mountApp(container)
  await h.settle()

  const input = container.querySelector("input")
  const add = h.byText(container, "Add")
  h.assert(input, "no text input")
  h.assert(add, `no button with text "Add" (got: ${h.snapshot(container)})`)
  const lis = () => [...container.querySelectorAll("li")]

  h.assert(h.visibleWithText(container, "0 left"), `initial "0 left" missing (got: ${h.snapshot(container)})`)
  h.assert(h.visibleWithText(container, "empty"), `initial "empty" state missing`)

  await h.click(add) // empty title must be ignored
  h.assert(lis().length === 0, "clicking Add with an empty input must not add a todo")

  h.setInputValue(input, "first")
  await h.click(add)
  h.assert(lis().length === 1 && lis()[0].textContent.includes("first"), `expected one li containing "first" (got: ${h.snapshot(container)})`)
  h.assert(input.value === "", "input must clear after Add")
  h.assert(h.visibleWithText(container, "1 left"), `"1 left" missing after first add`)
  h.assert(!h.visibleWithText(container, "empty"), `"empty" must disappear once a todo exists`)

  h.setInputValue(input, "second")
  await h.click(add)
  h.assert(lis().length === 2, "expected two todos")
  h.assert(h.visibleWithText(container, "2 left"), `"2 left" missing`)

  const removeFirst = h.byText(lis()[0], "x")
  h.assert(removeFirst, `no "x" button inside the first li`)
  await h.click(removeFirst)
  h.assert(lis().length === 1 && lis()[0].textContent.includes("second"), `removing the first todo must leave "second" (got: ${h.snapshot(container)})`)
  h.assert(h.visibleWithText(container, "1 left"), `"1 left" missing after removal`)

  await h.click(h.byText(lis()[0], "x"))
  h.assert(lis().length === 0, "list should be empty after removing the last todo")
  h.assert(h.visibleWithText(container, "0 left"), `"0 left" missing at the end`)
  h.assert(h.visibleWithText(container, "empty"), `"empty" must come back when the list empties`)
}

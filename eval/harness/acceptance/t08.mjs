// 08-table acceptance — filter × sort × edit composition with row identity
export async function accept({ module, container, helpers: h }) {
  module.mountApp(container)
  await h.settle()

  const lis = () => [...container.querySelectorAll("li")]
  const names = () => lis().map((li) => ["ada", "bob", "cyd", "dan"].find((n) => li.textContent.includes(n)))
  const liOf = (name) => lis().find((li) => li.textContent.includes(name))
  const input = container.querySelector("input")
  const sort = h.byText(container, "sort")
  h.assert(input && sort, `missing filter input or sort button (got: ${h.snapshot(container)})`)

  h.assert(names().join(",") === "ada,bob,cyd,dan", `initial order wrong: ${names().join(",")}`)
  h.assert(h.visibleWithText(container, "showing 4 of 4"), `"showing 4 of 4" missing (got: ${h.snapshot(container)})`)
  h.assert(h.visibleWithText(container, "sort: none"), `"sort: none" missing`)
  const adaLi = liOf("ada")
  const bobLi = liOf("bob")

  h.setInputValue(input, "a") // ada, dan contain "a"
  await h.settle()
  h.assert(names().join(",") === "ada,dan", `filter "a" should show ada,dan — got ${names().join(",")}`)
  h.assert(h.visibleWithText(container, "showing 2 of 4"), `"showing 2 of 4" missing`)
  h.assert(liOf("ada") === adaLi, "ada's li must survive filtering as the same element")

  h.setInputValue(input, "")
  await h.settle()
  h.assert(names().join(",") === "ada,bob,cyd,dan", "clearing the filter must restore all rows in id order")
  h.assert(liOf("ada") === adaLi, "ada stayed visible throughout — must still be the same element")
  const bobLi2 = liOf("bob") // bob left the view and may legitimately be a fresh element

  await h.click(sort) // desc: dan6 ada4 cyd2 bob1
  h.assert(h.visibleWithText(container, "sort: desc"), `"sort: desc" missing after first click`)
  h.assert(names().join(",") === "dan,ada,cyd,bob", `desc order wrong: ${names().join(",")}`)
  h.assert(liOf("ada") === adaLi, "sorting must move rows, not rebuild them")

  // bob 1 → 3: must jump above cyd (2) while sorted desc
  await h.click(h.byText(liOf("bob"), "+1"))
  await h.click(h.byText(liOf("bob"), "+1"))
  h.assert(liOf("bob").textContent.includes("bob 3"), `bob's row must show "bob 3" (got: ${liOf("bob")?.textContent.trim()})`)
  h.assert(names().join(",") === "dan,ada,bob,cyd", `after bob→3 in desc, order must be dan,ada,bob,cyd — got ${names().join(",")}`)
  h.assert(liOf("bob") === bobLi2, "bob's li must be the same element after re-sorting")

  await h.click(sort) // asc: cyd2 bob3 ada4 dan6
  h.assert(h.visibleWithText(container, "sort: asc"), `"sort: asc" missing`)
  h.assert(names().join(",") === "cyd,bob,ada,dan", `asc order wrong: ${names().join(",")}`)

  h.setInputValue(input, "b") // only bob, sorted view keeps sort
  await h.settle()
  h.assert(names().join(",") === "bob", `filter "b" while sorted should show only bob — got ${names().join(",")}`)
  h.assert(h.visibleWithText(container, "showing 1 of 4"), `"showing 1 of 4" missing`)

  h.setInputValue(input, "")
  await h.settle()
  await h.click(sort) // none: back to id order
  h.assert(h.visibleWithText(container, "sort: none"), `"sort: none" missing after full cycle`)
  h.assert(names().join(",") === "ada,bob,cyd,dan", `mode none must restore id order: ${names().join(",")}`)
}

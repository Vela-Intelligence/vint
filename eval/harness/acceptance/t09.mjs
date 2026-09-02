// 09-wizard acceptance — validation + state preserved across navigation
export async function accept({ module, container, helpers: h }) {
  module.mountApp(container)
  await h.settle()

  const wname = () => container.querySelector("#wname")
  const btn = (text) => h.byText(container, text)

  h.assert(h.visibleWithText(container, "step 1 of 3"), `must start on "step 1 of 3" (got: ${h.snapshot(container)})`)
  h.assert(wname(), "step 1 needs the #wname input")

  await h.click(btn("next")) // empty name
  h.assert(h.visibleWithText(container, "name required"), `empty name must show "name required" (got: ${h.snapshot(container)})`)
  h.assert(h.visibleWithText(container, "step 1 of 3"), "must stay on step 1 with an empty name")

  h.setInputValue(wname(), "Zed")
  await h.click(btn("next"))
  h.assert(h.visibleWithText(container, "step 2 of 3"), `must advance to step 2 (got: ${h.snapshot(container)})`)
  h.assert(!h.visibleWithText(container, "name required"), "the error must disappear after advancing")
  h.assert(h.visibleWithText(container, "selected: a"), `type must start as "selected: a"`)

  await h.click(btn("type b"))
  h.assert(h.visibleWithText(container, "selected: b"), `"type b" must select b`)

  await h.click(btn("next"))
  h.assert(h.visibleWithText(container, "step 3 of 3"), "must reach step 3")
  h.assert(h.visibleWithText(container, "summary: Zed / b"), `summary wrong (got: ${h.snapshot(container)})`)

  await h.click(btn("back"))
  h.assert(h.visibleWithText(container, "step 2 of 3"), "back must return to step 2")
  h.assert(h.visibleWithText(container, "selected: b"), "the chosen type must survive going back")

  await h.click(btn("back"))
  h.assert(h.visibleWithText(container, "step 1 of 3"), "back must return to step 1")
  h.assert(wname(), "#wname must be back")
  h.assert(wname().value === "Zed", `the name must survive navigation — got "${wname().value}"`)

  await h.click(btn("next"))
  await h.click(btn("next"))
  h.assert(h.visibleWithText(container, "summary: Zed / b"), `summary must still be "summary: Zed / b" after the round trip (got: ${h.snapshot(container)})`)
}

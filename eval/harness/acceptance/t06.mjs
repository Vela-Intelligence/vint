// 06-master-detail acceptance — live rename, modified count, li identity
export async function accept({ module, container, helpers: h }) {
  module.mountApp(container)
  await h.settle()

  const lis = () => [...container.querySelectorAll("li")]
  const liWith = (text) => lis().find((li) => li.textContent.includes(text))
  const editor = () => container.querySelector("#editor")

  h.assert(lis().length === 3, `expected 3 contact lis (got: ${h.snapshot(container)})`)
  h.assert(h.visibleWithText(container, "modified: 0"), `initial "modified: 0" missing`)
  h.assert(!editor(), "no contact selected yet — #editor must not exist")

  const adaLi = liWith("ada")
  const bobLi = liWith("bob")
  h.assert(adaLi && bobLi, "lis for ada and bob not found")

  await h.click(h.byText(adaLi, "edit"))
  h.assert(editor(), "#editor must appear after selecting")
  h.assert(editor().value === "ada", `editor should pre-fill "ada", got "${editor().value}"`)

  h.setInputValue(editor(), "adaX")
  await h.settle()
  h.assert(adaLi.textContent.includes("adaX"), `li must show the rename live (got: ${adaLi.textContent.trim()})`)
  h.assert(h.visibleWithText(container, "modified: 1"), `"modified: 1" missing after rename`)
  h.assert(liWith("adaX") === adaLi, "ada's li must be the SAME element while typing (rows were rebuilt)")

  await h.click(h.byText(bobLi, "edit"))
  h.assert(editor().value === "bob", `selecting bob must load "bob" into the editor, got "${editor().value}"`)
  h.setInputValue(editor(), "bobby")
  await h.settle()
  h.assert(bobLi.textContent.includes("bobby"), "bob's li must update live")
  h.assert(h.visibleWithText(container, "modified: 2"), `"modified: 2" missing`)

  // rename ada back to the exact original via re-selection
  await h.click(h.byText(liWith("adaX"), "edit"))
  h.assert(editor().value === "adaX", "re-selecting ada must load its CURRENT name")
  h.setInputValue(editor(), "ada")
  await h.settle()
  h.assert(h.visibleWithText(container, "modified: 1"), `renaming back to the original must drop the count to 1 (got: ${h.snapshot(container)})`)
  h.assert(liWith("ada") === adaLi, "ada's li identity must survive the whole session")
}

// 05-reorder acceptance — keyed identity: values and elements travel with rows
export async function accept({ module, container, helpers: h }) {
  module.mountApp(container)
  await h.settle()

  const labelsInOrder = () =>
    [...container.querySelectorAll("li")].map((li) =>
      ["alpha", "beta", "gamma", "delta"].find((l) => li.textContent.includes(l)),
    )
  const inputByRow = (id) => container.querySelector(`input[data-row="${id}"]`)

  h.assert(
    labelsInOrder().join(",") === "alpha,beta,gamma,delta",
    `initial order wrong: ${labelsInOrder().join(",")} (got: ${h.snapshot(container)})`,
  )
  const before = { 1: inputByRow(1), 2: inputByRow(2), 3: inputByRow(3), 4: inputByRow(4) }
  h.assert(before[1] && before[2] && before[3] && before[4], "each row needs an input with data-row=<id>")

  h.setInputValue(before[2], "typed-into-beta")

  const reverse = h.byText(container, "reverse")
  h.assert(reverse, `no "reverse" button`)
  await h.click(reverse)

  h.assert(
    labelsInOrder().join(",") === "delta,gamma,beta,alpha",
    `after reverse, order wrong: ${labelsInOrder().join(",")}`,
  )
  for (const id of [1, 2, 3, 4]) {
    h.assert(
      inputByRow(id) === before[id],
      `row ${id}'s input must be the SAME DOM element after reorder — rows were rebuilt instead of moved (key the rows by id)`,
    )
  }
  h.assert(
    inputByRow(2).value === "typed-into-beta",
    `typed value must travel with row 2 — got "${inputByRow(2).value}"`,
  )

  await h.click(reverse)
  h.assert(
    labelsInOrder().join(",") === "alpha,beta,gamma,delta",
    `reversing twice must restore the original order: ${labelsInOrder().join(",")}`,
  )
}

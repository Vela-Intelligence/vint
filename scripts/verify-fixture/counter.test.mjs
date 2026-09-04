// Fixture for the vint verify smoke: one passing test, one failing test, one
// that provokes a vint warning while passing. Imports the built bundles.
import assert from "node:assert/strict"
import { createSignal, tags } from "../../dist/vint.js"
import { byText, captureWarnings, click, render, text } from "../../dist/vint-testing.js"

const { div, button } = tags

function Counter() {
  const [n, setN] = createSignal(0)
  return div(
    button({ onclick: () => setN((v) => v + 1) }, "+1"),
    div(() => `count: ${n()}`),
  )
}

describe("counter", () => {
  test("increments", () => {
    const { container, dispose } = render(Counter)
    click(byText(container, "+1"))
    assert.equal(text(container), "+1count: 1")
    dispose()
  })

  test("a deliberate failure with the app's warning in the report", () => {
    const { container } = render(Counter)
    const [items, setItems] = createSignal([1])
    items().push(2)
    setItems(items()) // E-SAMEREF-SET — this is the diagnosis the report must carry
    assert.equal(text(container), "wrong on purpose")
  })

  test("a warning on a passing test shows up as a note", () => {
    assert.deepEqual(
      captureWarnings(() => {}),
      [],
    )
    console.warn("E-DEAD-BINDING: pretend")
  })
})

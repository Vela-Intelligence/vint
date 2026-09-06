// Fixture for the vint verify smoke: passing tests, one failing test, one that
// provokes a vint warning while passing, an `it` with describe-scoped hooks, a
// skipped test, and a pair proving the runner disposes a root a test left
// mounted (T1 disposeAll). Imports the built bundles.
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
  let inHook = 0
  beforeEach(() => {
    inHook++
  })
  afterEach(() => {
    inHook--
  })

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

  it("it is an alias of test, and the describe's hooks ran around it", () => {
    assert.equal(inHook, 1)
  })

  test.skip("a skipped test is reported and never run", () => {
    throw new Error("must not run")
  })
})

describe("runner disposes what a test left mounted", () => {
  let setN
  let runs = 0

  test("leaves a root mounted on purpose", () => {
    const [n, set] = createSignal(0)
    setN = set
    render(() => div(() => `${runs++}:${n()}`)) // no dispose()
    assert.equal(runs, 1)
  })

  test("the previous test's root was disposed before this one ran", () => {
    setN(1) // a live binding would run a second time
    assert.equal(runs, 1)
  })
})

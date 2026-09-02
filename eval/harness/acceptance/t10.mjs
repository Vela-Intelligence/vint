// 10-undo acceptance — interleaved add/increment history walks back exactly
export async function accept({ module, container, helpers: h }) {
  module.mountApp(container)
  await h.settle()

  const add = h.byText(container, "add")
  const undo = h.byText(container, "undo")
  h.assert(add && undo, `missing add/undo buttons (got: ${h.snapshot(container)})`)
  // a counter li is one with a "+" button — decorative lis (e.g. an
  // unrequested empty-state message) don't count against the state
  const counterLis = () => [...container.querySelectorAll("li")].filter((li) => h.byText(li, "+"))
  const values = () => counterLis().map((li) => li.textContent.replace(/\+/g, "").trim())
  const plusOf = (i) => h.byText(counterLis()[i], "+")
  const expectState = async (expected, label) => {
    h.assert(
      values().join(",") === expected.join(","),
      `${label}: counters should be [${expected}] — got [${values()}] (${h.snapshot(container)})`,
    )
    const total = expected.reduce((a, b) => a + Number(b), 0)
    h.assert(h.visibleWithText(container, `total: ${total}`), `${label}: "total: ${total}" missing`)
  }

  await expectState([], "initially")
  await h.click(add)
  await h.click(add)
  await expectState([0, 0], "after two adds")

  await h.click(plusOf(0))
  await h.click(plusOf(0))
  await h.click(plusOf(1))
  await expectState([2, 1], "after increments")

  await h.click(undo) // undo + on second
  await expectState([2, 0], "undo #1")
  await h.click(undo) // undo + on first
  await expectState([1, 0], "undo #2")
  await h.click(undo)
  await expectState([0, 0], "undo #3")
  await h.click(undo) // undo second add
  await expectState([0], "undo #4 removes the second counter")
  await h.click(undo) // undo first add
  await expectState([], "undo #5 removes the first counter")
  await h.click(undo) // history empty — must be a no-op
  await expectState([], "undo on empty history is a no-op")

  await h.click(add)
  await expectState([0], "still fully functional after exhausting history")
}

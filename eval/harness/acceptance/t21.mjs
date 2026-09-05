// 21-kanban acceptance — moves, counts, undo, filter-without-removal,
// edit-in-place with focus retention, timed badge, keyboard shortcut.
export async function accept({ module, container, helpers: h }) {
  let resolveBoard
  const deps = {
    loadBoard: () => new Promise((r) => (resolveBoard = r)),
  }
  module.mountApp(container, deps)
  await h.settle()
  h.assert(h.visibleWithText(container, "loading"), `"loading" must be visible before the board resolves (got: ${h.snapshot(container)})`)

  resolveBoard({
    columns: [
      { id: "todo", title: "To do" },
      { id: "doing", title: "Doing" },
      { id: "done", title: "Done" },
    ],
    cards: [
      { id: "c1", title: "Write spec", column: "todo" },
      { id: "c2", title: "Review", column: "todo" },
      { id: "c3", title: "Ship", column: "doing" },
    ],
  })
  await h.settle()

  const columns = () => [...container.querySelectorAll(".column")]
  const countOf = (i) => columns()[i].querySelector(".count").textContent.trim()
  const total = () => container.querySelector(".total").textContent.trim()
  const card = (id) => container.querySelector(`li[data-card="${id}"]`)
  const cardsIn = (i) => [...columns()[i].querySelectorAll("li[data-card]")].map((li) => li.dataset.card)
  const button = (id, label) => [...card(id).querySelectorAll("button")].find((b) => b.textContent.trim() === label)

  h.assert(columns().length === 3, `three .column elements (got ${columns().length}: ${h.snapshot(container)})`)
  h.assert(countOf(0) === "2 cards" && countOf(1) === "1 cards" && countOf(2) === "0 cards", `initial counts: ${countOf(0)} / ${countOf(1)} / ${countOf(2)}`)
  h.assert(total() === "3 cards total", `total: ${total()}`)
  h.assert(button("c1", "←").disabled === true, "← in the first column must be disabled")
  h.assert(button("c3", "→").disabled === false, "→ in a middle column must be enabled")

  // move c1 forward: counts, total, order (appended at the end), identity, badge
  await h.click(button("c1", "→"))
  h.assert(cardsIn(1).join(",") === "c3,c1", `moved card appended at the end: ${cardsIn(1).join(",")}`)
  h.assert(countOf(0) === "1 cards" && countOf(1) === "2 cards", `counts after move: ${countOf(0)} / ${countOf(1)}`)
  h.assert(total() === "3 cards total", `total unchanged: ${total()}`)
  h.assert(card("c1").classList.contains("moved"), "a moved card gets class moved")
  const undo = h.byText(container, "undo")
  h.assert(undo && undo.disabled === false, "undo enabled after a move")

  // undo returns it to the end of the previous column, without the badge logic being undoable
  await h.click(undo)
  h.assert(cardsIn(0).join(",") === "c2,c1", `undo returns the card to the END of its previous column: ${cardsIn(0).join(",")}`)
  h.assert(undo.disabled === true, "undo disabled when nothing to undo")

  // filter hides without removing; counts unaffected; identity kept
  const c1 = card("c1")
  const filter = container.querySelector("input[data-filter]")
  h.assert(filter, "an input with data-filter")
  h.setInputValue(filter, "ship")
  await h.settle()
  h.assert(card("c1").style.display === "none", "non-matching card hidden with inline display:none")
  h.assert(card("c3").style.display !== "none", "matching card stays visible")
  h.assert(card("c1") === c1, "hidden card keeps its DOM identity")
  h.assert(total() === "3 cards total", "filter does not change the total")
  h.setInputValue(filter, "")
  await h.settle()

  // edit in place: dblclick → input focused; another card moving must not close it
  const title = card("c2").querySelector(".title")
  h.assert(title, "a .title element in each card")
  title.dispatchEvent(new globalThis.MouseEvent("dblclick", { bubbles: true }))
  await h.settle()
  const edit = card("c2").querySelector("input.edit")
  h.assert(edit && edit.value === "Review", `an input.edit holding the title (got ${edit && edit.value})`)
  h.assert(document.activeElement === edit, "the edit input must be focused")
  await h.click(button("c3", "→")) // an unrelated move
  h.assert(card("c2").querySelector("input.edit") === edit, "an unrelated move must not close the editor")
  h.assert(document.activeElement === edit, "focus stays in the editor while other cards update")
  h.setInputValue(edit, "  Review PR  ")
  await h.settle() // a real user's keystrokes and Enter are frames apart; async renderers (Preact, Vue) commit in between
  edit.dispatchEvent(new globalThis.KeyboardEvent("keydown", { key: "Enter", bubbles: true }))
  await h.settle()
  h.assert(card("c2").querySelector(".title").textContent.trim() === "Review PR", `Enter commits the trimmed title: ${h.snapshot(card("c2"))}`)
  // cancel path
  card("c2").querySelector(".title").dispatchEvent(new globalThis.MouseEvent("dblclick", { bubbles: true }))
  await h.settle()
  const edit2 = card("c2").querySelector("input.edit")
  h.setInputValue(edit2, "changed")
  await h.settle()
  edit2.dispatchEvent(new globalThis.KeyboardEvent("keydown", { key: "Escape", bubbles: true }))
  await h.settle()
  h.assert(card("c2").querySelector(".title").textContent.trim() === "Review PR", "Escape cancels the edit")
  h.assert(!card("c2").querySelector("input.edit"), "the editor closes on Escape")

  // the shortcut: z on document undoes the c3 move (an input must not be focused)
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur()
  h.assert(cardsIn(2).join(",") === "c3", `c3 is in the last column before the shortcut: ${cardsIn(2).join(",")}`)
  document.dispatchEvent(new globalThis.KeyboardEvent("keydown", { key: "z", bubbles: true }))
  await h.settle()
  h.assert(cardsIn(1).join(",") === "c3", `z undoes the last move: doing=${cardsIn(1).join(",")} done=${cardsIn(2).join(",")}`)

  // the badge clears after 1500ms
  await h.click(button("c3", "→"))
  h.assert(card("c3").classList.contains("moved"), "moved badge set")
  await new Promise((r) => setTimeout(r, 1700))
  h.assert(!card("c3").classList.contains("moved"), "moved badge cleared after the timer")
}

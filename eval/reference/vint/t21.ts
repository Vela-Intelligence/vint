import { batch, createMemo, createSelector, createSignal, For, mount, onCleanup, Show, tags } from "vint"

const { div, h2, button, input, span, ul, li } = tags

type Column = { id: string; title: string }
type Card = { id: string; title: string; column: string }
type Board = { columns: Column[]; cards: Card[] }

export function mountApp(container: HTMLElement, deps: Record<string, any> = {}): void {
  const loadBoard = deps.loadBoard as () => Promise<Board>
  mount(container, () => {
    const [board, setBoard] = createSignal<Board | null>(null)
    loadBoard().then((b) => setBoard(b))
    return Show({ when: board, fallback: () => span("loading"), children: (b) => App(b()) })
  })
}

function App(board: Board) {
  const columns = board.columns
  const [cards, setCards] = createSignal<Card[]>(board.cards)
  const [filter, setFilter] = createSignal("")
  const [lastMove, setLastMove] = createSignal<{ id: string; from: string } | null>(null)
  const [movedId, setMovedId] = createSignal<string | null>(null)
  const [editing, setEditing] = createSignal<string | null>(null)
  const isMoved = createSelector(movedId)
  const isEditing = createSelector(editing)
  let movedTimer: ReturnType<typeof setTimeout> | null = null

  const indexOfColumn = (id: string) => columns.findIndex((c) => c.id === id)
  const cardsIn = (columnId: string) => createMemo(() => cards().filter((c) => c.column === columnId))

  const move = (id: string, to: string, record: boolean): void => {
    const card = cards().find((c) => c.id === id)
    if (!card) return
    batch(() => {
      // appended at the end of the new column: remove then push
      setCards((prev) => [...prev.filter((c) => c.id !== id), { ...card, column: to }])
      if (record) {
        setLastMove({ id, from: card.column })
        setMovedId(id)
        if (movedTimer) clearTimeout(movedTimer)
        movedTimer = setTimeout(() => setMovedId((m) => (m === id ? null : m)), 1500)
      }
    })
  }
  const undo = (): void => {
    const last = lastMove()
    if (!last) return
    move(last.id, last.from, false)
    setLastMove(null)
  }
  const onKey = (e: KeyboardEvent): void => {
    const active = document.activeElement
    if (e.key === "z" && !(active && active.tagName === "INPUT")) undo()
  }
  document.addEventListener("keydown", onKey)
  onCleanup(() => document.removeEventListener("keydown", onKey))

  const matches = (card: Card) => card.title.toLowerCase().includes(filter().trim().toLowerCase())

  return div(
    div({ class: "total" }, () => `${cards().length} cards total`),
    input({ "data-filter": "", oninput: (e) => setFilter((e.target as HTMLInputElement).value) }),
    button({ onclick: undo, disabled: () => lastMove() === null }, "undo"),
    columns.map((column, ci) => {
      const inColumn = cardsIn(column.id)
      return div(
        { class: "column" },
        h2(column.title),
        div({ class: "count" }, () => `${inColumn().length} cards`),
        ul(
          For({
            each: inColumn,
            key: (c) => c.id,
            children: (item) =>
              li(
                {
                  "data-card": item().id,
                  class: () => (isMoved(item().id) ? "moved" : ""),
                  style: () => (matches(item()) ? "" : "display: none"),
                },
                Show({
                  when: () => isEditing(item().id),
                  fallback: () =>
                    span({ class: "title", ondblclick: () => setEditing(item().id) }, () => item().title),
                  children: () => {
                    const box = input({
                      class: "edit",
                      value: item().title,
                      onkeydown: (e) => {
                        if (e.key === "Enter") {
                          const next = box.value.trim()
                          if (next) setCards((prev) => prev.map((c) => (c.id === item().id ? { ...c, title: next } : c)))
                          setEditing(null)
                        } else if (e.key === "Escape") setEditing(null)
                      },
                    })
                    queueMicrotask(() => box.focus())
                    return box
                  },
                }),
                button({ onclick: () => move(item().id, columns[ci - 1]!.id, true), disabled: ci === 0 }, "←"),
                button({ onclick: () => move(item().id, columns[ci + 1]!.id, true), disabled: ci === columns.length - 1 }, "→"),
              ),
          }),
        ),
      )
    }),
  )
}

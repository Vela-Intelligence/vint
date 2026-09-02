import { createMemo, createSignal, For, mount, tags } from "vint"

const { div, ul, li, button, span } = tags

type Counter = { id: number; value: number }
type Action = { kind: "add"; id: number } | { kind: "inc"; id: number }

export function mountApp(container: HTMLElement): void {
  mount(container, () => {
    const [counters, setCounters] = createSignal<Counter[]>([])
    const history: Action[] = []
    let nextId = 1
    const total = createMemo(() => counters().reduce((sum, c) => sum + c.value, 0))
    const add = () => {
      const id = nextId++
      history.push({ kind: "add", id })
      setCounters((prev) => [...prev, { id, value: 0 }])
    }
    const inc = (id: number) => {
      history.push({ kind: "inc", id })
      setCounters((prev) => prev.map((c) => (c.id === id ? { ...c, value: c.value + 1 } : c)))
    }
    const undo = () => {
      const action = history.pop()
      if (!action) return
      if (action.kind === "add") setCounters((prev) => prev.filter((c) => c.id !== action.id))
      else setCounters((prev) => prev.map((c) => (c.id === action.id ? { ...c, value: c.value - 1 } : c)))
    }
    return div(
      button({ onclick: add }, "add"),
      button({ onclick: undo }, "undo"),
      span(() => `total: ${total()}`),
      ul(
        For({
          each: counters,
          key: (c) => c.id,
          children: (item) =>
            li(
              () => String(item().value),
              button({ onclick: () => inc(item().id) }, "+"),
            ),
        }),
      ),
    )
  })
}

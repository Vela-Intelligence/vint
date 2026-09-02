// The todo app on the final API — exercises the flows the deleted prototype
// got wrong: delete, filter, reorder-by-filter, keyed row identity.
import { createMemo, createSignal, For, tags } from "../src/index"

const { div, h1, button, ul, li, input, span } = tags

type Todo = { id: number; title: string; done: boolean }
type Filter = "all" | "open" | "done"

export function TodoApp(): Element {
  const [todos, setTodos] = createSignal<Todo[]>([])
  const [title, setTitle] = createSignal("")
  const [filter, setFilter] = createSignal<Filter>("all")
  let nextId = 1

  const visible = createMemo(() => {
    const f = filter()
    return todos().filter((t) => (f === "all" ? true : f === "done" ? t.done : !t.done))
  })
  const left = createMemo(() => todos().filter((t) => !t.done).length)

  const add = (): void => {
    const t = title().trim()
    if (!t) return
    setTodos((prev) => [...prev, { id: nextId++, title: t, done: false }])
    setTitle("")
  }
  const toggle = (id: number): void => {
    setTodos((prev) => prev.map((t) => (t.id === id ? { ...t, done: !t.done } : t)))
  }
  const remove = (id: number): void => {
    setTodos((prev) => prev.filter((t) => t.id !== id))
  }

  return div(
    { class: "todo" },
    h1("vint todos"),
    div(
      { class: "row" },
      input({
        placeholder: "what needs doing",
        value: title,
        oninput: (e: Event) => setTitle((e.target as HTMLInputElement).value),
        onkeydown: (e: KeyboardEvent) => {
          if (e.key === "Enter") add()
        },
      }),
      button({ onclick: add }, "Add"),
    ),
    div(
      { class: "row" },
      (["all", "open", "done"] as Filter[]).map((f) =>
        button({ class: () => (filter() === f ? "active" : ""), onclick: () => setFilter(f) }, f),
      ),
      span(() => ` · ${left()} left`),
    ),
    ul(
      For({
        each: visible,
        key: (t) => t.id,
        fallback: () => li({ class: "empty" }, "nothing here"),
        children: (item) =>
          li(
            { class: () => (item().done ? "done" : "") },
            input({
              type: "checkbox",
              checked: () => item().done,
              onchange: () => toggle(item().id),
            }),
            span(() => item().title),
            button({ class: "x", onclick: () => remove(item().id) }, "×"),
          ),
      }),
    ),
  )
}

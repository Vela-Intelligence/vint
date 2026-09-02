import { createSignal, For, mount, tags } from "vint"

const { div, button, input, ul, li, span } = tags

type Todo = { id: number; title: string }

export function mountApp(container: HTMLElement): void {
  mount(container, () => {
    const [todos, setTodos] = createSignal<Todo[]>([])
    const [title, setTitle] = createSignal("")
    let nextId = 1
    return div(
      input({
        value: title,
        oninput: (e: Event) => setTitle((e.target as HTMLInputElement).value),
      }),
      button(
        {
          onclick: () => {
            if (!title().trim()) return
            setTodos((prev) => [...prev, { id: nextId++, title: title() }])
            setTitle("")
          },
        },
        "Add",
      ),
      span(() => `${todos().length} left`),
      ul(
        For({
          each: todos,
          key: (t) => t.id,
          fallback: () => span("empty"),
          children: (item) =>
            li(
              item.title, // value-passing For: item IS the todo
              button(
                { onclick: () => setTodos((prev) => prev.filter((t) => t.id !== item.id)) },
                "x",
              ),
            ),
        }),
      ),
    )
  })
}

import van from "vanjs-core"

const { div, button, input, ul, li, span } = van.tags

type Todo = { id: number; title: string }

export function mountApp(container: HTMLElement): void {
  const todos = van.state<Todo[]>([])
  const title = van.state("")
  let nextId = 1
  const field = input({
    value: () => title.val,
    oninput: (e: Event) => {
      title.val = (e.target as HTMLInputElement).value
    },
  })
  van.add(
    container,
    div(
      field,
      button(
        {
          onclick: () => {
            if (!title.val.trim()) return
            todos.val = [...todos.val, { id: nextId++, title: title.val }]
            title.val = ""
          },
        },
        "Add",
      ),
      span(() => `${todos.val.length} left`),
      div(() =>
        todos.val.length === 0
          ? span("empty")
          : ul(
              todos.val.map((t) =>
                li(
                  t.title,
                  button(
                    { onclick: () => (todos.val = todos.val.filter((x) => x.id !== t.id)) },
                    "x",
                  ),
                ),
              ),
            ),
      ),
    ),
  )
}

import { createSignal, For, mount, tags } from "vint"

const { div, button, ul, li, input, span } = tags

type Row = { id: number; label: string }

export function mountApp(container: HTMLElement): void {
  mount(container, () => {
    const [rows, setRows] = createSignal<Row[]>([
      { id: 1, label: "alpha" },
      { id: 2, label: "beta" },
      { id: 3, label: "gamma" },
      { id: 4, label: "delta" },
    ])
    return div(
      button({ onclick: () => setRows((prev) => [...prev].reverse()) }, "reverse"),
      ul(
        For({
          each: rows,
          key: (r) => r.id,
          children: (item) =>
            li(
              span(() => item().label),
              input({ "data-row": () => String(item().id) }),
            ),
        }),
      ),
    )
  })
}

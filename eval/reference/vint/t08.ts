import { createMemo, createSignal, For, mount, tags } from "vint"

const { div, ul, li, button, input, span } = tags

type Row = { id: number; name: string; score: number }
type SortMode = "none" | "desc" | "asc"

export function mountApp(container: HTMLElement): void {
  mount(container, () => {
    const [rows, setRows] = createSignal<Row[]>([
      { id: 1, name: "ada", score: 4 },
      { id: 2, name: "bob", score: 1 },
      { id: 3, name: "cyd", score: 2 },
      { id: 4, name: "dan", score: 6 },
    ])
    const [filter, setFilter] = createSignal("")
    const [sort, setSort] = createSignal<SortMode>("none")
    const view = createMemo(() => {
      const q = filter().toLowerCase()
      const visible = rows().filter((r) => r.name.toLowerCase().includes(q))
      if (sort() === "desc") visible.sort((a, b) => b.score - a.score)
      if (sort() === "asc") visible.sort((a, b) => a.score - b.score)
      return visible
    })
    const cycle: Record<SortMode, SortMode> = { none: "desc", desc: "asc", asc: "none" }
    return div(
      input({ oninput: (e: Event) => setFilter((e.target as HTMLInputElement).value) }),
      button({ onclick: () => setSort((s) => cycle[s]) }, "sort"),
      span(() => `sort: ${sort()}`),
      span(() => `showing ${view().length} of ${rows().length}`),
      ul(
        For({
          each: view,
          key: (r) => r.id,
          children: (item) =>
            li(
              () => `${item().name} ${item().score}`,
              button(
                {
                  onclick: () =>
                    setRows((prev) =>
                      prev.map((r) => (r.id === item().id ? { ...r, score: r.score + 1 } : r)),
                    ),
                },
                "+1",
              ),
            ),
        }),
      ),
    )
  })
}

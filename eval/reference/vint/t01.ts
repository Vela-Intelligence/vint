import { createMemo, createSignal, mount, tags } from "vint"

const { div, button, span } = tags

export function mountApp(container: HTMLElement): void {
  mount(container, () => {
    const [n, setN] = createSignal(0)
    const doubled = createMemo(() => n() * 2)
    return div(
      button({ onclick: () => setN((c) => c + 1) }, "+"),
      button({ onclick: () => setN((c) => c - 1) }, "-"),
      div(() => `count: ${n()}`),
      div(() => `doubled: ${doubled()}`),
      span({ id: "parity" }, () => (n() % 2 === 0 ? "even" : "odd")),
    )
  })
}

import van from "vanjs-core"

const { div, button, span } = van.tags

export function mountApp(container: HTMLElement): void {
  const n = van.state(0)
  van.add(
    container,
    div(
      button({ onclick: () => ++n.val }, "+"),
      button({ onclick: () => --n.val }, "-"),
      div(() => `count: ${n.val}`),
      div(() => `doubled: ${n.val * 2}`),
      span({ id: "parity" }, () => (n.val % 2 === 0 ? "even" : "odd")),
    ),
  )
}

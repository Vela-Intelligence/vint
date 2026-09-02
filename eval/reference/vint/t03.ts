import { createSignal, mount, Show, tags } from "vint"

const { div, button, input, span } = tags

export function mountApp(container: HTMLElement): void {
  mount(container, () => {
    const [open, setOpen] = createSignal(false)
    const [ticks, setTicks] = createSignal(0)
    return div(
      button({ onclick: () => setOpen((v) => !v) }, "toggle"),
      Show({
        when: open,
        children: () => div(input({ id: "name" })),
      }),
      button({ onclick: () => setTicks((t) => t + 1) }, "tick"),
      span(() => `ticks: ${ticks()}`),
    )
  })
}

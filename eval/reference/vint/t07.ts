import { createEffect, createSignal, mount, onCleanup, tags } from "vint"

const { div, button, span } = tags

export function mountApp(container: HTMLElement, deps: Record<string, any> = {}): void {
  const subscribe = deps.subscribe as (ch: "A" | "B", cb: (msg: string) => void) => () => void
  mount(container, () => {
    const [on, setOn] = createSignal(false)
    const [channel, setChannel] = createSignal<"A" | "B">("A")
    const [last, setLast] = createSignal<string | null>(null)
    createEffect(() => {
      if (!on()) return
      const unsubscribe = subscribe(channel(), (msg) => setLast(msg))
      onCleanup(unsubscribe) // O2: runs before every re-run and on toggle-off
    })
    return div(
      button({ onclick: () => setOn((v) => !v) }, "toggle"),
      button({ onclick: () => setChannel("A") }, "A"),
      button({ onclick: () => setChannel("B") }, "B"),
      span(() => (on() ? `last: ${last() ?? "none"}` : "off")),
    )
  })
}

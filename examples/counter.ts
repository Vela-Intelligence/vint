// Signals, memos, and a reusable component with props.
import type { Accessor } from "../src/index"
import { createMemo, createSignal, tags } from "../src/index"

const { div, h2, p, button, span } = tags

// A component is a plain function: props in, element out. Pass an accessor
// for anything reactive; call it in a function position to bind it.
function Stepper(props: {
  label: string
  count: Accessor<number>
  onStep: (delta: number) => void
}): Element {
  return div(
    { class: "row" },
    button({ onclick: () => props.onStep(-1) }, "−"),
    span({ class: "stat" }, props.count),
    button({ onclick: () => props.onStep(1) }, "+"),
    span({ class: "muted" }, props.label),
  )
}

export function CounterExample(): Element {
  const [count, setCount] = createSignal(0)
  const doubled = createMemo(() => count() * 2)

  return div(
    h2("Counter"),
    p({ class: "muted" }, "createSignal + createMemo + a component with props."),
    Stepper({ label: "count", count, onStep: (d) => setCount((c) => c + d) }),
    p(() => `doubled: ${doubled()} — count is ${count() % 2 === 0 ? "even" : "odd"}`),
  )
}

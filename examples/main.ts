// The gallery shell: hash routing with a signal, nav via keyed For, and one
// binding that swaps examples — switching disposes the old example entirely
// (timers, listeners, subscriptions), which is the point of ownership.
import type { Child } from "../src/index"
import { createSignal, For, mount, tags } from "../src/index"
import { ComponentsExample } from "./components"
import { CounterExample } from "./counter"
import { FetchApp } from "./fetch"
import { StopwatchExample } from "./stopwatch"
import { TodoApp } from "./todo"

const { div, header, h1, p, nav, a, main: mainEl, footer } = tags

const examples: Array<{ id: string; title: string; view: () => Child }> = [
  { id: "counter", title: "Counter", view: CounterExample },
  { id: "todos", title: "Todos", view: TodoApp },
  { id: "stopwatch", title: "Stopwatch", view: StopwatchExample },
  { id: "fetch", title: "Fetch", view: FetchApp },
  { id: "components", title: "Components", view: ComponentsExample },
]

function App(): Element {
  const readHash = (): string => location.hash.slice(1) || examples[0].id
  const [route, setRoute] = createSignal(readHash())
  window.addEventListener("hashchange", () => setRoute(readHash()))

  return div(
    { class: "gallery" },
    header(h1("vint"), p({ class: "muted" }, "Vanilla In TypeScript — example gallery")),
    nav(
      For({
        each: () => examples,
        key: (e) => e.id,
        children: (item) =>
          a(
            {
              href: () => `#${item().id}`,
              class: () => (route() === item().id ? "active" : ""),
            },
            () => item().title,
          ),
      }),
    ),
    mainEl(() => (examples.find((e) => e.id === route()) ?? examples[0]).view()),
    footer({ class: "muted" }, "Every example is plain vint + plain elements. Source: examples/*.ts"),
  )
}

mount(document.body, App)

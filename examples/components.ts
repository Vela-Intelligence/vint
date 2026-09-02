// Component patterns — everything is a plain function and a plain element.
// No classes, no registration, no JSX: composition is function calls.
import type { Accessor, Child } from "../src/index"
import { createSignal, Show, tags } from "../src/index"

const { div, h2, h3, p, button, span, label: labelEl, input } = tags

// 1. Presentational: arguments in, element out.
function Badge(text: string, kind: "ok" | "warn" = "ok"): Element {
  return span({ class: `badge ${kind}` }, text)
}

// 2. Container: accept children exactly like a tag does.
function Card(title: string, ...children: Child[]): Element {
  return div({ class: "card" }, h3(title), ...children)
}

// 3. Controlled: state lives with the caller; the component renders and
//    reports. Reactive props are accessors; events are callbacks.
function Toggle(props: {
  label: string
  on: Accessor<boolean>
  onChange: (next: boolean) => void
}): Element {
  return labelEl(
    { class: "row" },
    input({
      type: "checkbox",
      checked: props.on,
      onchange: (e: Event) => props.onChange((e.target as HTMLInputElement).checked),
    }),
    span(props.label),
  )
}

// 4. Stateful: internal signals the component owns. The content binding gets
//    a fresh subtree per tab; the old tab's bindings are disposed for free.
function Tabs(items: Array<{ label: string; content: () => Child }>): Element {
  const [active, setActive] = createSignal(0)
  return div(
    div(
      { class: "row" },
      items.map((item, i) =>
        button(
          { class: () => (active() === i ? "active" : ""), onclick: () => setActive(i) },
          item.label,
        ),
      ),
    ),
    div({ class: "tab-body" }, () => items[active()]?.content() ?? null),
  )
}

// 5. Overlay: Show tears the dialog down on close — no display:none, the
//    DOM and every listener inside it are simply gone.
function Modal(props: { open: Accessor<boolean>; onClose: () => void; children: () => Child }): Child {
  return Show({
    when: props.open,
    children: () =>
      div(
        { class: "overlay", onclick: props.onClose },
        div(
          { class: "card modal", onclick: (e: Event) => e.stopPropagation() },
          props.children(),
          div({ class: "row" }, button({ onclick: props.onClose }, "close")),
        ),
      ),
  })
}

export function ComponentsExample(): Element {
  const [notify, setNotify] = createSignal(true)
  const [open, setOpen] = createSignal(false)

  return div(
    h2("Components"),
    p({ class: "muted" }, "Five patterns: presentational, container, controlled, stateful, overlay."),
    Card(
      "Settings",
      Toggle({ label: "Notifications", on: notify, onChange: setNotify }),
      p("Status: ", () => Badge(notify() ? "enabled" : "muted", notify() ? "ok" : "warn")),
      div({ class: "row" }, button({ onclick: () => setOpen(true) }, "open modal")),
    ),
    Tabs([
      { label: "First", content: () => p("Each tab body is built lazily and disposed on switch.") },
      { label: "Second", content: () => Card("Nested", p("Components compose like function calls.")) },
      {
        label: "Third",
        content: () => p(() => `Notifications are ${notify() ? "on" : "off"} here too.`),
      },
    ]),
    Modal({
      open,
      onClose: () => setOpen(false),
      children: () => p("A modal is just Show + two divs. Closing disposes all of this."),
    }),
  )
}

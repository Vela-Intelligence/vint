import { createEffect, createMemo, createSignal, For, mount, Show, tags } from "vint"

const { div, h1, select, option, input, button, ul, li, span, p } = tags

type Messages = Record<
  string,
  {
    dir: "ltr" | "rtl"
    title: string
    add: string
    placeholder: string
    empty: string
    count: Record<string, string>
  }
>
type Item = { id: number; text: string }

export function mountApp(container: HTMLElement, deps: Record<string, any> = {}): void {
  const messages = deps.messages as Messages
  mount(container, () => App(messages))
}

function App(messages: Messages) {
  const codes = Object.keys(messages)
  const [locale, setLocale] = createSignal(codes[0]!)
  const [items, setItems] = createSignal<Item[]>([])
  let nextId = 1
  const m = () => messages[locale()]!
  const number = createMemo(() => new Intl.NumberFormat(locale()))
  const plural = createMemo(() => new Intl.PluralRules(locale()))

  createEffect(() => {
    document.documentElement.setAttribute("lang", locale())
    document.documentElement.setAttribute("dir", m().dir)
  })

  const count = () => {
    const n = items().length
    const template = m().count[plural().select(n)] ?? m().count.other ?? "{n}"
    return template.replace("{n}", number().format(n))
  }

  const box = input({
    type: "text",
    "data-new": "",
    dir: "auto",
    placeholder: () => m().placeholder,
    onkeydown: (e) => {
      if (e.key === "Enter" && !e.isComposing) add()
    },
  })
  const add = (): void => {
    const text = box.value.trim()
    if (!text) return
    setItems((prev) => [...prev, { id: nextId++, text }])
    box.value = ""
  }
  const remove = (id: number): void => setItems((prev) => prev.filter((i) => i.id !== id))

  return div(
    select(
      { "data-locale": "", onchange: (e) => setLocale((e.target as HTMLSelectElement).value) },
      codes.map((code) => option({ value: code }, code)),
    ),
    h1(() => m().title),
    box,
    button({ "data-add": "", onclick: add }, () => m().add),
    span({ "data-count": "" }, () => count()),
    Show({ when: () => items().length === 0, children: () => p({ "data-empty": "" }, () => m().empty) }),
    ul(
      { "data-items": "" },
      For({
        each: items,
        key: (i) => i.id,
        children: (item) =>
          li(
            span({ "data-text": "" }, () => item().text),
            button({ "data-remove": "", onclick: () => remove(item().id) }, "×"),
          ),
      }),
    ),
  )
}

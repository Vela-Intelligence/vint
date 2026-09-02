import { createMemo, createSignal, For, mount, Show, tags } from "vint"

const { div, ul, li, button, input, span } = tags

type Contact = { id: number; name: string }

export function mountApp(container: HTMLElement): void {
  mount(container, () => {
    const initial: Contact[] = [
      { id: 1, name: "ada" },
      { id: 2, name: "bob" },
      { id: 3, name: "cyd" },
    ]
    const originals = new Map(initial.map((c) => [c.id, c.name]))
    const [contacts, setContacts] = createSignal(initial)
    const [selectedId, setSelectedId] = createSignal<number | null>(null)
    const selected = createMemo(() => contacts().find((c) => c.id === selectedId()) ?? null)
    const modified = createMemo(
      () => contacts().filter((c) => c.name !== originals.get(c.id)).length,
    )
    return div(
      span(() => `modified: ${modified()}`),
      ul(
        For({
          each: contacts,
          key: (c) => c.id,
          children: (item) =>
            li(
              () => item().name,
              button({ onclick: () => setSelectedId(item().id) }, "edit"),
            ),
        }),
      ),
      Show({
        when: selected,
        children: () =>
          input({
            id: "editor",
            value: () => selected()?.name ?? "",
            oninput: (e: Event) => {
              const name = (e.target as HTMLInputElement).value
              setContacts((prev) => prev.map((c) => (c.id === selectedId() ? { ...c, name } : c)))
            },
          }),
      }),
    )
  })
}

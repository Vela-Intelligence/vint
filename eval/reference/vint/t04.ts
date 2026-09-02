import { createResource, createSignal, mount, Show, tags } from "vint"

const { div, button, span } = tags

export function mountApp(container: HTMLElement, deps: Record<string, any> = {}): void {
  const fetchUser = deps.fetchUser as (id: number) => Promise<{ name: string }>
  mount(container, () => {
    const [id, setId] = createSignal(1)
    const [user] = createResource(id, (v) => fetchUser(v))
    return div(
      button({ onclick: () => setId((v) => v + 1) }, "next"),
      Show({ when: () => user.loading, children: () => span("loading") }),
      span(() => (user.error ? `error: ${(user.error as Error).message}` : "")),
      span(() => (!user.loading && !user.error && user() ? user()!.name : "")),
    )
  })
}

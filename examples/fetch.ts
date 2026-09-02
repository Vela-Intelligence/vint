// Fetch-then-render with createResource — loading / error / data without
// hand-rolled sentinel signals, with stale responses discarded automatically.
import { createResource, createSignal, tags } from "../src/index"

const { div, h2, button, p, ul, li } = tags

async function fetchUsers(page: number): Promise<string[]> {
  await new Promise((r) => setTimeout(r, 600)) // fake latency
  if (page === 3) throw new Error("page 3 is broken (on purpose)")
  return Array.from({ length: 5 }, (_, i) => `user ${page * 5 + i + 1}`)
}

export function FetchApp(): Element {
  const [page, setPage] = createSignal(0)
  const [users, { refetch }] = createResource(page, fetchUsers)

  return div(
    { class: "fetch" },
    h2("Fetch"),
    p(
      { class: "muted" },
      "createResource: loading / error / data, stale responses discarded. Page 3 errors on purpose.",
    ),
    div(
      { class: "row" },
      button({ onclick: () => setPage((p) => p + 1) }, "next page"),
      button({ onclick: () => refetch() }, "refetch"),
    ),
    p(() =>
      users.loading
        ? "loading…"
        : users.error
          ? `error: ${(users.error as Error).message}`
          : `page ${page()}`,
    ),
    ul(() => (users() ?? []).map((u) => li(u))),
  )
}

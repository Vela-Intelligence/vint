import { createMemo, createSignal, For, Match, mount, Show, Switch, tags } from "vint"

const { div, h1, button, input, span, ul, li, select, option } = tags

type Person = { id: string; name: string }
type Task = { id: string; title: string; done: boolean; assignee: string | null }
type Project = { id: string; name: string; tasks: Task[] }
type Seed = { workspace: string; people: Person[]; projects: Project[] }

export function mountApp(container: HTMLElement, deps: Record<string, any> = {}): void {
  const loadSeed = deps.loadSeed as () => Promise<Seed>
  mount(container, () => {
    const [seed, setSeed] = createSignal<Seed | null>(null)
    loadSeed().then((s) => setSeed(s))
    return Show({
      when: seed,
      fallback: () => span("loading"),
      children: (loaded) => App(loaded()),
    })
  })
}

function App(seed: Seed) {
  const people = seed.people
  const [workspace, setWorkspace] = createSignal(seed.workspace)
  const [projects, setProjects] = createSignal(seed.projects)
  const [view, setView] = createSignal<"board" | "people" | "settings">("board")
  const [filter, setFilter] = createSignal("")
  const [drafts, setDrafts] = createSignal<Record<string, string>>({})
  const [newProject, setNewProject] = createSignal("")
  const [compact, setCompact] = createSignal(false)
  let nextId = 1

  const updateTask = (projectId: string, taskId: string, patch: Partial<Task>) =>
    setProjects((prev) =>
      prev.map((p) =>
        p.id === projectId
          ? { ...p, tasks: p.tasks.map((t) => (t.id === taskId ? { ...t, ...patch } : t)) }
          : p,
      ),
    )

  const openCount = (personId: string) =>
    projects()
      .flatMap((p) => p.tasks)
      .filter((t) => t.assignee === personId && !t.done).length

  const Board = () =>
    div(
      { class: () => `board${compact() ? " compact" : ""}` },
      input({
        "data-filter": "",
        value: filter,
        oninput: (e: Event) => setFilter((e.target as HTMLInputElement).value),
      }),
      input({
        "data-new-project": "",
        value: newProject,
        oninput: (e: Event) => setNewProject((e.target as HTMLInputElement).value),
      }),
      button(
        {
          onclick: () => {
            const name = newProject().trim()
            if (!name) return
            setProjects((prev) => [...prev, { id: `np${nextId++}`, name, tasks: [] }])
            setNewProject("")
          },
        },
        "add project",
      ),
      For({
        each: projects,
        key: (p) => p.id,
        children: (project) =>
          div(
            { class: "project" },
            span(() => project().name),
            span(() => {
              const tasks = project().tasks
              return `${tasks.filter((t) => t.done).length}/${tasks.length} done`
            }),
            ul(
              For({
                each: () => {
                  const q = filter().toLowerCase()
                  return project().tasks.filter((t) => t.title.toLowerCase().includes(q))
                },
                key: (t) => t.id,
                children: (task) =>
                  li(
                    input({
                      type: "checkbox",
                      checked: () => task().done,
                      onchange: (e: Event) =>
                        updateTask(project().id, task().id, {
                          done: (e.target as HTMLInputElement).checked,
                        }),
                    }),
                    span(() => task().title),
                    select(
                      {
                        value: () => task().assignee ?? "",
                        onchange: (e: Event) =>
                          updateTask(project().id, task().id, {
                            assignee: (e.target as HTMLSelectElement).value || null,
                          }),
                      },
                      option({ value: "" }, "-"),
                      people.map((p) => option({ value: p.id }, p.name)),
                    ),
                  ),
              }),
            ),
            input({
              value: () => drafts()[project().id] ?? "",
              oninput: (e: Event) => {
                const value = (e.target as HTMLInputElement).value
                setDrafts((prev) => ({ ...prev, [project().id]: value }))
              },
            }),
            button(
              {
                onclick: () => {
                  const title = (drafts()[project().id] ?? "").trim()
                  if (!title) return
                  setProjects((prev) =>
                    prev.map((p) =>
                      p.id === project().id
                        ? {
                            ...p,
                            tasks: [
                              ...p.tasks,
                              { id: `nt${nextId++}`, title, done: false, assignee: null },
                            ],
                          }
                        : p,
                    ),
                  )
                  setDrafts((prev) => ({ ...prev, [project().id]: "" }))
                },
              },
              "add task",
            ),
          ),
      }),
    )

  const People = () =>
    ul(people.map((p) => li(() => `${p.name}: ${openCount(p.id)} open`)))

  const Settings = () =>
    div(
      input({
        id: "workspace",
        value: workspace,
        oninput: (e: Event) => setWorkspace((e.target as HTMLInputElement).value),
      }),
      input({
        id: "compact",
        type: "checkbox",
        checked: compact,
        onchange: (e: Event) => setCompact((e.target as HTMLInputElement).checked),
      }),
    )

  return div(
    h1(workspace),
    button({ onclick: () => setView("board") }, "board"),
    button({ onclick: () => setView("people") }, "people"),
    button({ onclick: () => setView("settings") }, "settings"),
    span(() => `view: ${view()}`),
    Switch({
      children: [
        Match({ when: () => view() === "board", children: Board }),
        Match({ when: () => view() === "people", children: People }),
        Match({ when: () => view() === "settings", children: Settings }),
      ],
    }),
  )
}

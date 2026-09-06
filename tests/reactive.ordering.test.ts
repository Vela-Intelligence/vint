// Contract R7, invariant I4 — owners run first. F1 in
// docs/assessment-2026-09-final.md: queue order is observer-slot order, and
// detachSources permutes slots on every re-run, so after one truthy→truthy
// update a Show branch's binding could sit ahead of the Show that owns it,
// run first on the falsy write, and read the narrowed value on null. Solid's
// runTop prevents it; vint's runAncestorsFirst (plus the For `guard`) does now.
// Every plain test here threw a TypeError from the setter at v0.8.0.
import fc from "fast-check"
import { beforeEach, describe, expect, test } from "vitest"
import { createEffect, createSignal, For, Match, mount, Show, Switch, tags } from "../src/index"

const { div, span, ul, li } = tags
type User = { name: string; age: number } | null

let host: HTMLDivElement
beforeEach(() => {
  document.body.innerHTML = ""
  host = document.createElement("div")
  document.body.append(host)
})

describe("I4/R7 [F1] a branch never runs a binding in the flush that tears it down", () => {
  test("Show callback with two bindings: truthy→truthy, then null (the guide's rule-4 shape)", () => {
    const [user, setUser] = createSignal<User>({ name: "a", age: 1 })
    mount(host, () =>
      Show({
        when: user,
        children: (u) =>
          div(
            span(() => u().name),
            span(() => u().age),
          ),
      }),
    )
    setUser({ name: "b", age: 2 })
    expect(host.textContent).toBe("b2")
    expect(() => setUser(null)).not.toThrow()
    expect(host.textContent).toBe("")
    setUser({ name: "c", age: 3 })
    expect(host.textContent).toBe("c3")
  })

  test("Show thunk whose bindings read the signal directly with a non-null assertion", () => {
    const [user, setUser] = createSignal<User>({ name: "a", age: 1 })
    mount(host, () =>
      Show({
        when: user,
        children: () =>
          div(
            span(() => user()!.name),
            span(() => user()!.name.length),
          ),
      }),
    )
    setUser({ name: "bb", age: 2 })
    expect(() => setUser(null)).not.toThrow()
    expect(host.textContent).toBe("")
  })

  test("Switch/Match branch reading narrowed data across an arm change", () => {
    type State = { kind: "ok"; data: { n: number } } | { kind: "err" }
    const [state, setState] = createSignal<State>({ kind: "ok", data: { n: 1 } })
    const data = () => (state() as { data: { n: number } }).data
    mount(host, () =>
      Switch({
        children: [
          Match({
            when: () => state().kind === "ok",
            children: () =>
              div(
                span(() => data().n),
                span(() => data().n * 2),
              ),
          }),
          Match({ when: () => state().kind === "err", children: () => div("error") }),
        ],
      }),
    )
    setState({ kind: "ok", data: { n: 2 } })
    expect(host.textContent).toBe("24")
    expect(() => setState({ kind: "err" })).not.toThrow()
    expect(host.textContent).toBe("error")
  })

  test("Show inside a For row: the row's meta updated, then nulled", () => {
    type Row = { id: number; meta: { n: number } | null }
    const [rows, setRows] = createSignal<Row[]>([
      { id: 1, meta: { n: 1 } },
      { id: 2, meta: { n: 2 } },
    ])
    mount(host, () =>
      ul(
        For({
          each: rows,
          key: (r) => r.id,
          children: (item) =>
            li(
              Show({
                when: () => item().meta,
                children: (m) =>
                  div(
                    span(() => m().n),
                    span(() => m().n * 2),
                  ),
              }),
            ),
        }),
      ),
    )
    setRows((p) => p.map((r) => ({ ...r, meta: r.meta && { n: r.meta.n + 1 } })))
    expect(host.textContent).toBe("2436")
    expect(() => setRows((p) => p.map((r) => (r.id === 1 ? { ...r, meta: null } : r)))).not.toThrow()
    expect(host.textContent).toBe("36")
  })

  test("For row deriving its text from the list signal, updated then removed (needs the guard)", () => {
    type Todo = { id: number; t: string }
    const [todos, setTodos] = createSignal<Todo[]>(
      Array.from({ length: 5 }, (_, i) => ({ id: i, t: `t${i}` })),
    )
    const find = (id: number) => todos().find((x) => x.id === id) as Todo
    mount(host, () =>
      ul(
        For({
          each: todos,
          key: (x) => x.id,
          children: (item) =>
            li(
              span(() => find(item().id).t),
              span(() => find(item().id).t.length),
            ),
        }),
      ),
    )
    // three field updates scramble observer slots; then remove rows one by one
    for (let i = 0; i < 3; i++) setTodos((p) => p.map((x) => ({ ...x, t: `${x.t}!` })))
    for (const id of [2, 0, 4, 1, 3]) {
      expect(() => setTodos((p) => p.filter((x) => x.id !== id))).not.toThrow()
    }
    expect(host.querySelectorAll("li").length).toBe(0)
  })

  test("a binding about to be disposed does not run at all — zero doomed runs", () => {
    const [user, setUser] = createSignal<User>({ name: "a", age: 1 })
    let runs = 0
    mount(host, () =>
      Show({
        when: user,
        children: (u) =>
          div(
            ...Array.from({ length: 20 }, () =>
              span(() => {
                runs++
                return u()?.name ?? ""
              }),
            ),
          ),
      }),
    )
    for (let i = 0; i < 5; i++) setUser({ name: `n${i}`, age: i })
    runs = 0
    setUser(null)
    expect(runs).toBe(0)
    // user effects were never affected (they run after every render effect)
    const seen: unknown[] = []
    setUser({ name: "z", age: 9 })
    mount(document.createElement("div"), () =>
      Show({
        when: user,
        children: (u) => {
          createEffect(() => seen.push(u()?.name))
          return div()
        },
      }),
    )
    setUser(null)
    expect(seen).toEqual(["z"])
  })
})

describe("I4 property: random truthy→truthy→falsy sequences never let a child observe the retired state", () => {
  test("Show branch with k bindings reading the narrowed accessor", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 6 }),
        fc.array(fc.constantFrom("update", "update", "hide", "show"), { minLength: 1, maxLength: 16 }),
        (k, ops) => {
          const [user, setUser] = createSignal<User>({ name: "a", age: 0 })
          let observedNull = 0
          let n = 0
          const h = document.createElement("div")
          const dispose = mount(h, () =>
            Show({
              when: user,
              children: (u) =>
                div(
                  ...Array.from({ length: k }, () =>
                    span(() => {
                      const v = u()
                      if (v === null) observedNull++
                      return v?.name ?? ""
                    }),
                  ),
                ),
            }),
          )
          for (const op of ops) {
            if (op === "update") {
              if (user()) setUser({ name: `n${n++}`, age: n })
            } else if (op === "hide") setUser(null)
            else setUser({ name: `s${n++}`, age: n })
          }
          dispose()
          return observedNull === 0
        },
      ),
      { seed: 20260905, numRuns: 300 },
    )
  })

  test("For rows deriving from the list signal, under random updates and removals", () => {
    type Todo = { id: number; t: string }
    fc.assert(
      fc.property(
        fc.array(fc.constantFrom("update", "remove", "add"), { minLength: 1, maxLength: 16 }),
        fc.array(fc.nat({ max: 9 }), { minLength: 16, maxLength: 16 }),
        (ops, picks) => {
          const [todos, setTodos] = createSignal<Todo[]>(
            Array.from({ length: 4 }, (_, i) => ({ id: i, t: `t${i}` })),
          )
          let missing = 0
          let nextId = 4
          const h = document.createElement("div")
          const dispose = mount(h, () =>
            ul(
              For({
                each: todos,
                key: (x) => x.id,
                children: (item) =>
                  li(
                    span(() => {
                      const t = todos().find((x) => x.id === item().id)
                      if (!t) missing++
                      return t?.t ?? ""
                    }),
                    span(() => {
                      const t = todos().find((x) => x.id === item().id)
                      if (!t) missing++
                      return t?.t.length ?? 0
                    }),
                  ),
              }),
            ),
          )
          ops.forEach((op, i) => {
            const pick = picks[i] as number
            if (op === "update") setTodos((p) => p.map((x) => ({ ...x, t: `${x.t}!` })))
            else if (op === "remove")
              setTodos((p) => (p.length ? p.filter((_, j) => j !== pick % p.length) : p))
            else setTodos((p) => [...p, { id: nextId++, t: "new" }])
          })
          dispose()
          return missing === 0
        },
      ),
      { seed: 20260905, numRuns: 300 },
    )
  })
})

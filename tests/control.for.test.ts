// Contract group G — For (C2)
import { beforeEach, describe, expect, test, vi } from "vitest"
import { createSignal, For, mount, onCleanup, tags } from "../src/index"
import { __observerCount } from "../src/reactive"

let host: HTMLDivElement
beforeEach(() => {
  document.body.innerHTML = ""
  host = document.createElement("div")
  document.body.append(host)
})

const liTexts = () => [...host.querySelectorAll("li")].map((li) => li.textContent)

/** C2 minimality: count the DOM moves a reconcile performs. `parent` inside
 *  For's placement step is end.parentNode — the <ul> these tests mount into.
 *  Spy AFTER the initial render; that is a separate concern. */
const spyOnMoves = () => vi.spyOn(host.querySelector("ul") as HTMLElement, "insertBefore")
const movedNodes = (spy: ReturnType<typeof spyOnMoves>) => spy.mock.calls.map((c) => c[0] as Node)
const rows = (n: number) => Array.from({ length: n }, (_, i) => ({ id: i, label: `r${i}` }))

describe("For", () => {
  test("G43/C2 initial render, append, prepend", () => {
    const [items, setItems] = createSignal(["b", "c"])
    mount(host, () => tags.ul(For({ each: items, children: (item) => tags.li(() => item()) })))
    expect(liTexts()).toEqual(["b", "c"])
    setItems(["b", "c", "d"])
    expect(liTexts()).toEqual(["b", "c", "d"])
    setItems(["a", "b", "c", "d"])
    expect(liTexts()).toEqual(["a", "b", "c", "d"])
  })

  test("G44/C2 REGRESSION(vanx-holes): removing the middle item leaves no holes, neighbors keep their nodes", () => {
    const [items, setItems] = createSignal(["a", "b", "c"])
    mount(host, () => tags.ul(For({ each: items, children: (item) => tags.li(() => item()) })))
    const [liA, , liC] = [...host.querySelectorAll("li")]
    setItems(["a", "c"])
    expect(liTexts()).toEqual(["a", "c"])
    const after = [...host.querySelectorAll("li")]
    expect(after[0]).toBe(liA)
    expect(after[1]).toBe(liC)
  })

  test("G45/C2 keyed reorder moves the same DOM nodes; focus in an unmoved row survives", () => {
    type T = { id: number; label: string }
    const [items, setItems] = createSignal<T[]>([
      { id: 1, label: "a" },
      { id: 2, label: "b" },
      { id: 3, label: "c" },
    ])
    mount(host, () =>
      tags.ul(
        For({
          each: items,
          key: (t) => t.id,
          children: (item) => tags.li(tags.input({ value: () => item().label })),
        }),
      ),
    )
    const lis = [...host.querySelectorAll("li")]
    const firstInput = lis[0]!.querySelector("input")!
    firstInput.focus()
    expect(document.activeElement).toBe(firstInput)
    // swap rows 2 and 3; row 1 stays put
    setItems([
      { id: 1, label: "a" },
      { id: 3, label: "c" },
      { id: 2, label: "b" },
    ])
    const after = [...host.querySelectorAll("li")]
    expect(after[0]).toBe(lis[0])
    expect(after[1]).toBe(lis[2]) // same node, moved
    expect(after[2]).toBe(lis[1])
    expect(document.activeElement).toBe(firstInput)
  })

  test("G46/C2 same-key replacement updates the row in place via item()", () => {
    type T = { id: number; title: string }
    const [items, setItems] = createSignal<T[]>([{ id: 1, title: "old" }])
    let childCalls = 0
    mount(host, () =>
      tags.ul(
        For({
          each: items,
          key: (t) => t.id,
          children: (item) => {
            childCalls++
            return tags.li(() => item().title)
          },
        }),
      ),
    )
    const li = host.querySelector("li")
    setItems([{ id: 1, title: "new" }])
    expect(host.querySelector("li")).toBe(li) // same DOM node
    expect(li!.textContent).toBe("new")
    expect(childCalls).toBe(1) // children called once per key, not per render
  })

  test("G47/C2 index accessor updates after removal and reorder", () => {
    const [items, setItems] = createSignal(["a", "b", "c"])
    mount(host, () =>
      tags.ul(
        For({
          each: items,
          children: (item, index) => tags.li(() => `${index()}:${item()}`),
        }),
      ),
    )
    expect(liTexts()).toEqual(["0:a", "1:b", "2:c"])
    setItems(["a", "c"])
    expect(liTexts()).toEqual(["0:a", "1:c"])
    setItems(["c", "a"])
    expect(liTexts()).toEqual(["0:c", "1:a"])
  })

  test("G48/C2 clear to empty and repopulate", () => {
    const [items, setItems] = createSignal(["a"])
    mount(host, () => tags.ul(For({ each: items, children: (item) => tags.li(() => item()) })))
    setItems([])
    expect(liTexts()).toEqual([])
    setItems(["x", "y"])
    expect(liTexts()).toEqual(["x", "y"])
  })

  test("G49/C2+O5 removed rows are disposed: cleanups run, shared-signal subscriptions detach", () => {
    const [shared] = createSignal(0)
    const [items, setItems] = createSignal<string[]>([])
    const cleaned: string[] = []
    const baseline = __observerCount(shared)
    mount(host, () =>
      tags.ul(
        For({
          each: items,
          children: (item) => {
            onCleanup(() => cleaned.push("row"))
            return tags.li(() => `${item()}${shared()}`)
          },
        }),
      ),
    )
    setItems(["a", "b", "c"])
    expect(__observerCount(shared)).toBe(baseline + 3)
    setItems(["a"])
    expect(cleaned).toHaveLength(2)
    expect(__observerCount(shared)).toBe(baseline + 1)
    setItems([])
    expect(__observerCount(shared)).toBe(baseline)
  })

  test("G50/C2 prescriptive errors: duplicate keys, non-function each, same-reference mutation", () => {
    const [dup, setDup] = createSignal(["a"])
    mount(host, () => tags.ul(For({ each: dup, children: (item) => tags.li(() => item()) })))
    expect(() => setDup(["x", "x"])).toThrow(/E-FOR-DUPKEY/)

    expect(() =>
      mount(host, () => tags.ul(For({ each: [1, 2] as never, children: () => tags.li() }))),
    ).toThrow(/E-FOR-ARRAY/)

    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    const arr = ["a", "b"]
    const [items, setItems] = createSignal(arr, { equals: false })
    mount(host, () => tags.ul(For({ each: items, children: (item) => tags.li(() => item()) })))
    arr.push("c")
    setItems(arr) // same reference, mutated in place
    expect(warn.mock.calls.some((c) => String(c[0]).includes("E-FOR-SAMEREF"))).toBe(true)
    warn.mockRestore()
  })

  // --- C2 move minimality (F2/F3) ------------------------------------------

  const mountRows = (n: number) => {
    const [items, setItems] = createSignal(rows(n))
    mount(
      host,
      () =>
        tags.ul(
          For({ each: items, key: (t) => t.id, children: (item) => tags.li(() => item().label) }),
        ),
    )
    return setItems
  }

  test("G51/C2 moving one row to the end re-inserts ONLY that row", () => {
    const setItems = mountRows(10)
    const spy = spyOnMoves()
    setItems((p) => [...p.slice(1), p[0] as (typeof p)[0]])
    expect(liTexts()).toEqual(["r1", "r2", "r3", "r4", "r5", "r6", "r7", "r8", "r9", "r0"])
    // anchor + li for the one row that actually moved. Greedy placement did 18.
    expect(spy.mock.calls.length).toBe(2)
  })

  test("G52/C2 an update that changes no order performs ZERO insertions", () => {
    const setItems = mountRows(10)
    const spy = spyOnMoves()
    setItems((p) => p.map((r, i) => (i === 3 ? { ...r, label: "changed" } : r)))
    expect(liTexts()[3]).toBe("changed")
    // NOTE: this guards minimality, not F3. The greedy placement it replaced
    // also performed zero inserts here — it just walked every row's node
    // range to decide that. The walk is not observable from the DOM, so F3's
    // evidence is the browser benchmark, not this suite.
    expect(spy.mock.calls.length).toBe(0)
  })

  test("G53/C2 appending touches no existing row", () => {
    const setItems = mountRows(10)
    const before = [...host.querySelectorAll("li")]
    const spy = spyOnMoves()
    setItems((p) => [...p, { id: 99, label: "new" }])
    expect(liTexts().length).toBe(11)
    expect(movedNodes(spy).some((n) => before.includes(n as HTMLLIElement))).toBe(false)
  })

  test("G54/C2 a row that keeps its relative position is never re-inserted (focus survives)", () => {
    const [items, setItems] = createSignal(rows(5))
    mount(host, () =>
      tags.ul(
        For({
          each: items,
          key: (t) => t.id,
          children: (item) => tags.li(tags.input({ value: () => item().label })),
        }),
      ),
    )
    const watched = host.querySelectorAll("li")[3] as HTMLLIElement
    const watchedInput = watched.querySelector("input") as HTMLInputElement
    watchedInput.focus()
    const spy = spyOnMoves()
    setItems((p) => [...p.slice(1, 3), p[0] as (typeof p)[0], ...p.slice(3)]) // move row 0 to index 2
    // node identity is the real assertion: happy-dom does not model focus loss
    // on reparenting, so activeElement alone would pass against greedy too
    const moved = movedNodes(spy)
    expect(moved.includes(watched)).toBe(false)
    expect(moved.includes(watchedInput)).toBe(false)
    expect(document.activeElement).toBe(watchedInput)
  })

  test("G55/C2 reverse is correct and costs the true minimum", () => {
    const setItems = mountRows(10)
    const before = [...host.querySelectorAll("li")]
    const spy = spyOnMoves()
    setItems((p) => [...p].reverse())
    expect(liTexts()).toEqual(["r9", "r8", "r7", "r6", "r5", "r4", "r3", "r2", "r1", "r0"])
    expect([...host.querySelectorAll("li")]).toEqual([...before].reverse()) // same nodes
    expect(spy.mock.calls.length).toBe(18) // LIS length 1 → 9 rows × 2 nodes
  })

  test("G56/C2 simultaneous insert, remove and reorder keeps retained nodes", () => {
    const [items, setItems] = createSignal(["a", "b", "c", "d", "e"].map((id) => ({ id })))
    mount(host, () =>
      tags.ul(For({ each: items, key: (t) => t.id, children: (item) => tags.li(() => item().id) })),
    )
    const byId = new Map(
      [...host.querySelectorAll("li")].map((li) => [li.textContent as string, li]),
    )
    setItems(["e", "c", "x", "a", "y"].map((id) => ({ id })))
    expect(liTexts()).toEqual(["e", "c", "x", "a", "y"])
    const after = [...host.querySelectorAll("li")]
    for (const id of ["e", "c", "a"]) {
      expect(after.includes(byId.get(id) as HTMLLIElement)).toBe(true)
    }
  })

  test("G57/C2 rows whose content is empty reorder correctly", () => {
    const [items, setItems] = createSignal([
      { id: 1, on: true },
      { id: 2, on: false },
      { id: 3, on: true },
    ])
    mount(host, () =>
      tags.ul(
        For({
          each: items,
          key: (t) => t.id,
          children: (item) => () => (item().on ? tags.li(String(item().id)) : null),
        }),
      ),
    )
    expect(liTexts()).toEqual(["1", "3"])
    setItems((p) => [p[2] as (typeof p)[0], p[1] as (typeof p)[0], p[0] as (typeof p)[0]])
    expect(liTexts()).toEqual(["3", "1"])
    // the empty row's anchor and markers travelled with it: flipping it on
    // must land it between 3 and 1
    setItems((p) => p.map((r) => (r.id === 2 ? { ...r, on: true } : r)))
    expect(liTexts()).toEqual(["3", "2", "1"])
  })

  test("G58/C2 nested For inside a row survives an outer reorder", () => {
    const [groups, setGroups] = createSignal([
      { id: "a", kids: [{ id: 1 }, { id: 2 }] },
      { id: "b", kids: [{ id: 3 }] },
    ])
    mount(host, () =>
      tags.ul(
        For({
          each: groups,
          key: (g) => g.id,
          children: (g) =>
            tags.li(
              () => g().id,
              For({
                each: () => g().kids,
                key: (k) => k.id,
                children: (k) => tags.span(() => String(k().id)),
              }),
            ),
        }),
      ),
    )
    expect(host.textContent).toBe("a12b3")
    const inner = [...host.querySelectorAll("span")]
    setGroups((p) => [p[1] as (typeof p)[0], p[0] as (typeof p)[0]])
    expect(host.textContent).toBe("b3a12")
    expect([...host.querySelectorAll("span")].every((s) => inner.includes(s))).toBe(true)
  })

  test("G59/C2 a row moves with content its bindings inserted after placement", () => {
    // the li arrives via a deferred binding, i.e. AFTER the reconcile that
    // created the row placed it — a creation-time range snapshot breaks here
    const [items, setItems] = createSignal(rows(3))
    mount(host, () =>
      tags.ul(
        For({
          each: items,
          key: (t) => t.id,
          children: (item) => [tags.span("|"), () => tags.li(() => item().label)],
        }),
      ),
    )
    expect(liTexts()).toEqual(["r0", "r1", "r2"])
    setItems((p) => [p[2] as (typeof p)[0], p[0] as (typeof p)[0], p[1] as (typeof p)[0]])
    expect(liTexts()).toEqual(["r2", "r0", "r1"])
    expect(host.textContent).toBe("|r2|r0|r1") // each li stayed with its own span
  })

  test("G60/C2+R10 a duplicate-key throw moves nothing and stays recoverable", () => {
    const [items, setItems] = createSignal(rows(4))
    mount(
      host,
      () =>
        tags.ul(
          For({ each: items, key: (t) => t.id, children: (item) => tags.li(() => item().label) }),
        ),
    )
    const spy = spyOnMoves()
    expect(() => setItems([{ id: 7, label: "x" }, { id: 7, label: "y" }])).toThrow(/E-FOR-DUPKEY/)
    expect(liTexts()).toEqual(["r0", "r1", "r2", "r3"]) // intact
    expect(spy.mock.calls.length).toBe(0) // nothing was touched
    setItems([{ id: 7, label: "x" }, { id: 8, label: "y" }]) // recoverable
    expect(liTexts()).toEqual(["x", "y"])
  })

  test("G61/C2 fallback round trip leaves no node between the rows", () => {
    const [items, setItems] = createSignal(rows(2))
    mount(host, () =>
      tags.ul(
        For({
          each: items,
          key: (t) => t.id,
          fallback: () => tags.li("empty"),
          children: (item) => tags.li(() => item().label),
        }),
      ),
    )
    expect(liTexts()).toEqual(["r0", "r1"])
    setItems([])
    expect(liTexts()).toEqual(["empty"])
    setItems(rows(3))
    expect(liTexts()).toEqual(["r0", "r1", "r2"])
    setItems([])
    expect(liTexts()).toEqual(["empty"])
  })
})

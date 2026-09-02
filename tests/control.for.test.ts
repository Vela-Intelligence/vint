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
      // biome-ignore lint: deliberate misuse
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
})

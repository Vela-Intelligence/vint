// Contract clause C4 — createSelector
import { createEffect, createRoot, createSelector, createSignal, For, mount, tags } from "../src/index"
import { __observerCount } from "../src/reactive"

const { ul, li } = tags

const captureWarnings = (run: () => void): string[] => {
  const warned: string[] = []
  const orig = console.warn
  console.warn = (m: unknown) => warned.push(String(m))
  try {
    run()
  } finally {
    console.warn = orig
  }
  return warned
}

type Row = { id: number }
const rows = (n: number): Row[] => Array.from({ length: n }, (_, i) => ({ id: i }))

let host: HTMLDivElement
beforeEach(() => {
  document.body.innerHTML = ""
  host = document.createElement("div")
  document.body.append(host)
})

const selectedIds = () =>
  [...host.querySelectorAll("li.selected")].map((el) => Number(el.getAttribute("data-id")))

describe("createSelector (C4)", () => {
  test("C4 100 keyed rows: a selection change re-runs exactly two row bindings, one from null", () => {
    const [items] = createSignal(rows(100))
    const [selected, setSelected] = createSignal<number | null>(null)
    let runs = 0
    const dispose = mount(host, () => {
      const isSelected = createSelector(selected)
      return ul(
        For({
          each: items,
          key: (t) => t.id,
          children: (item) =>
            li({
              "data-id": () => String(item().id),
              class: () => {
                runs++
                return isSelected(item().id) ? "selected" : ""
              },
            }),
        }),
      )
    })
    expect(runs).toBe(100)
    expect(selectedIds()).toEqual([])
    // the rows never subscribe to `selected` itself — only the selector does
    expect(__observerCount(selected)).toBe(1)

    setSelected(5)
    expect(runs).toBe(101) // no previous key to clear
    expect(selectedIds()).toEqual([5])

    setSelected(7)
    expect(runs).toBe(103) // 5 lost, 7 gained
    expect(selectedIds()).toEqual([7])

    setSelected(99)
    expect(runs).toBe(105)
    expect(selectedIds()).toEqual([99])

    setSelected(null)
    expect(runs).toBe(106) // 99 lost, nothing gained
    expect(selectedIds()).toEqual([])

    dispose()
    expect(__observerCount(selected)).toBe(0)
  })

  test("C4 a custom fn re-evaluates every live key, but only rows whose answer changed re-run", () => {
    const [items] = createSignal(rows(10))
    const [limit, setLimit] = createSignal(-1)
    const runs = new Map<number, number>()
    mount(host, () => {
      const isSelected = createSelector(limit, (key: number, value: number) => key <= value)
      return ul(
        For({
          each: items,
          key: (t) => t.id,
          children: (item) =>
            li({
              "data-id": () => String(item().id),
              class: () => {
                runs.set(item().id, (runs.get(item().id) ?? 0) + 1)
                return isSelected(item().id) ? "selected" : ""
              },
            }),
        }),
      )
    })
    const snapshot = () => new Map(runs)
    expect(selectedIds()).toEqual([])

    let before = snapshot()
    setLimit(4)
    expect(selectedIds()).toEqual([0, 1, 2, 3, 4])
    for (let id = 0; id < 10; id++) {
      const expectedRuns = (before.get(id) ?? 0) + (id <= 4 ? 1 : 0)
      expect(runs.get(id), `row ${id} after 4`).toBe(expectedRuns)
    }

    before = snapshot()
    setLimit(6)
    expect(selectedIds()).toEqual([0, 1, 2, 3, 4, 5, 6])
    for (let id = 0; id < 10; id++) {
      const changed = id === 5 || id === 6
      expect(runs.get(id), `row ${id} after 6`).toBe((before.get(id) ?? 0) + (changed ? 1 : 0))
    }

    before = snapshot()
    setLimit(2)
    expect(selectedIds()).toEqual([0, 1, 2])
    for (let id = 0; id < 10; id++) {
      const changed = id >= 3 && id <= 6
      expect(runs.get(id), `row ${id} after 2`).toBe((before.get(id) ?? 0) + (changed ? 1 : 0))
    }
  })

  test("C4 removed rows drop their keys: selecting a gone key is inert, a re-added row reads correctly", () => {
    const [items, setItems] = createSignal(rows(3))
    const [selected, setSelected] = createSignal<number | null>(null)
    mount(host, () => {
      const isSelected = createSelector(selected)
      return ul(
        For({
          each: items,
          key: (t) => t.id,
          children: (item) =>
            li({
              "data-id": () => String(item().id),
              class: () => (isSelected(item().id) ? "selected" : ""),
            }),
        }),
      )
    })
    setSelected(1)
    expect(selectedIds()).toEqual([1])
    setItems([])
    expect(host.querySelectorAll("li")).toHaveLength(0)
    expect(() => {
      setSelected(2)
      setSelected(1)
      setSelected(null)
      setSelected(2)
    }).not.toThrow()
    setItems(rows(3))
    expect(selectedIds()).toEqual([2])
    setSelected(0)
    expect(selectedIds()).toEqual([0])
  })

  test("C4 isSelected read with no owner returns the right boolean and warns E-NO-OWNER for its cleanup", () => {
    const [selected, setSelected] = createSignal<number | null>(null)
    let isSelected!: (key: number) => boolean
    createRoot(() => {
      isSelected = createSelector(selected)
    })
    let answer: boolean | undefined
    let warned = captureWarnings(() => {
      answer = isSelected(3)
    })
    expect(answer).toBe(false)
    expect(warned.some((w) => w.startsWith("E-NO-OWNER") && w.includes("onCleanup"))).toBe(true)

    setSelected(3)
    warned = captureWarnings(() => {
      answer = isSelected(3)
    })
    expect(answer).toBe(true)
    expect(warned.some((w) => w.startsWith("E-NO-OWNER") && w.includes("onCleanup"))).toBe(true)
  })

  test("C4 createSelector outside any root warns E-NO-OWNER naming createSelector", () => {
    const [selected] = createSignal<number | null>(null)
    const warned = captureWarnings(() => {
      createSelector(selected)
    })
    expect(warned.some((w) => w.startsWith("E-NO-OWNER") && w.includes("createSelector"))).toBe(true)
  })

  test("C4 a key never read holds no state, and reads the current answer when first read", () => {
    const [selected, setSelected] = createSignal<number | null>(null)
    const seen: boolean[] = []
    let isSelected!: (key: number) => boolean
    let readLater!: () => void
    createRoot(() => {
      isSelected = createSelector(selected)
      // `read` flips to true later so the effect reads key 42 only from then on
      const [read, setRead] = createSignal(false)
      readLater = () => setRead(true)
      createEffect(() => {
        if (read()) seen.push(isSelected(42))
      })
    })
    setSelected(42) // never read: no entry exists to flip
    expect(seen).toEqual([])
    readLater() // first read creates the entry with the CURRENT answer
    expect(seen).toEqual([true])
    setSelected(7)
    expect(seen).toEqual([true, false])
    setSelected(42)
    expect(seen).toEqual([true, false, true])
  })
})

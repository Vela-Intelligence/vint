// Contract group A — signals & memos (R2–R6)
import { describe, expect, test } from "vitest"
import { createEffect, createMemo, createRoot, createSignal, untrack } from "../src/index"

describe("signals", () => {
  test("A1/R4 read-write round trip; updater form", () => {
    const [n, setN] = createSignal(1)
    expect(n()).toBe(1)
    setN(2)
    expect(n()).toBe(2)
    setN((p) => p + 1)
    expect(n()).toBe(3)
  })

  test("A2/R4 equal write is a no-op: no effect run", () => {
    const [n, setN] = createSignal(1)
    let runs = 0
    createRoot(() => {
      createEffect(() => {
        n()
        runs++
      })
    })
    expect(runs).toBe(1)
    setN(1)
    expect(runs).toBe(1)
    setN(2)
    expect(runs).toBe(2)
  })

  test("A7/R2 untracked read creates no dependency", () => {
    const [a, setA] = createSignal(1)
    const [b] = createSignal(10)
    let runs = 0
    createRoot(() => {
      createEffect(() => {
        a()
        untrack(() => b())
        runs++
      })
    })
    expect(runs).toBe(1)
    setA(2)
    expect(runs).toBe(2)
  })
})

describe("memos", () => {
  test("A3/R5 computes once at creation, caches across reads", () => {
    createRoot(() => {
      let computes = 0
      const [n] = createSignal(2)
      const sq = createMemo(() => {
        computes++
        return n() * n()
      })
      expect(computes).toBe(1)
      expect(sq()).toBe(4)
      expect(sq()).toBe(4)
      expect(computes).toBe(1)
    })
  })

  test("A4/R5 recomputes lazily, at most once per change", () => {
    let setN!: (v: number) => void
    let computes = 0
    let sq!: () => number
    createRoot(() => {
      const [n, s] = createSignal(2)
      setN = s
      sq = createMemo(() => {
        computes++
        return n() * n()
      })
    })
    expect(computes).toBe(1)
    setN(3)
    expect(computes).toBe(1) // no reader yet — lazy
    expect(sq()).toBe(9)
    expect(sq()).toBe(9)
    expect(computes).toBe(2)
  })

  test("A5/R6 diamond: effect runs once with consistent values", () => {
    let setS!: (v: number) => void
    const seen: string[] = []
    createRoot(() => {
      const [s, set] = createSignal(1)
      setS = set
      const a = createMemo(() => s() + 1)
      const b = createMemo(() => s() * 10)
      createEffect(() => seen.push(`${a()}|${b()}`))
    })
    expect(seen).toEqual(["2|10"])
    setS(2)
    expect(seen).toEqual(["2|10", "3|20"])
  })

  test("A6/R5 memo equality gate stops downstream effects", () => {
    let setN!: (v: number) => void
    let runs = 0
    createRoot(() => {
      const [n, set] = createSignal(1)
      setN = set
      const sign = createMemo(() => (n() >= 0 ? "+" : "-"))
      createEffect(() => {
        sign()
        runs++
      })
    })
    expect(runs).toBe(1)
    setN(5) // sign unchanged: "+"
    expect(runs).toBe(1)
    setN(-5)
    expect(runs).toBe(2)
  })

  test("A6b/R5 custom equals on signal", () => {
    const [v, setV] = createSignal({ id: 1 }, { equals: (a, b) => a.id === b.id })
    let runs = 0
    createRoot(() => {
      createEffect(() => {
        v()
        runs++
      })
    })
    setV({ id: 1 })
    expect(runs).toBe(1)
    setV({ id: 2 })
    expect(runs).toBe(2)
  })
})

// Contract group B — scheduler (R7–R10)
import { describe, expect, test } from "vitest"
import {
  batch,
  createEffect,
  createMemo,
  createRenderEffect,
  createRoot,
  createSignal,
} from "../src/index"

describe("scheduler", () => {
  test("B8/R7+O3 effect created in root body runs once, after the body", () => {
    const order: string[] = []
    createRoot(() => {
      createEffect(() => order.push("effect"))
      order.push("body")
    })
    expect(order).toEqual(["body", "effect"])
  })

  test("B9/R7 re-runs on dependency write, exact run count", () => {
    const [n, setN] = createSignal(0)
    let runs = 0
    createRoot(() => {
      createEffect(() => {
        n()
        runs++
      })
    })
    setN(1)
    setN(2)
    expect(runs).toBe(3)
  })

  test("B10/R3 dynamic dependencies: unread branch stops triggering", () => {
    const [useA, setUseA] = createSignal(true)
    const [a, setA] = createSignal("a")
    const [b, setB] = createSignal("b")
    const seen: string[] = []
    createRoot(() => {
      createEffect(() => seen.push(useA() ? a() : b()))
    })
    expect(seen).toEqual(["a"])
    setB("b2") // not a dependency yet
    expect(seen).toEqual(["a"])
    setUseA(false)
    expect(seen).toEqual(["a", "b2"])
    setA("a2") // no longer a dependency
    expect(seen).toEqual(["a", "b2"])
    setB("b3")
    expect(seen).toEqual(["a", "b2", "b3"])
  })

  test("B11/R8 REGRESSION(bug1): effect writing another signal during flush cascades, repeatedly", () => {
    const [a, setA] = createSignal(0)
    const [b, setB] = createSignal(0)
    const log: string[] = []
    createRoot(() => {
      createEffect(() => {
        const v = a()
        if (v > 0) setB(v * 10)
      })
      createEffect(() => log.push(`b=${b()}`))
    })
    log.length = 0
    setA(1)
    expect(log).toEqual(["b=10"])
    setA(2) // the prototype permanently wedged the b-effect here
    expect(log).toEqual(["b=10", "b=20"])
    setA(3)
    expect(log).toEqual(["b=10", "b=20", "b=30"])
  })

  test("B12/R8 chain a→b→c settles in one flush, each effect once", () => {
    const [a, setA] = createSignal(1)
    const [b, setB] = createSignal(0)
    const [c, setC] = createSignal(0)
    const runs = { ab: 0, bc: 0, c: 0 }
    createRoot(() => {
      createEffect(() => {
        runs.ab++
        setB(a() * 2)
      })
      createEffect(() => {
        runs.bc++
        setC(b() + 1)
      })
      createEffect(() => {
        runs.c++
        c()
      })
    })
    const before = { ...runs }
    setA(2)
    expect(runs.ab).toBe(before.ab + 1)
    expect(runs.bc).toBe(before.bc + 1)
    expect(runs.c).toBe(before.c + 1)
    expect(c()).toBe(5)
  })

  test("B13/R9 batch coalesces; reads inside see new values; memos fresh inside batch", () => {
    let setA!: (v: number) => void
    let setB!: (v: number) => void
    let sum!: () => number
    let runs = 0
    createRoot(() => {
      const [a, sa] = createSignal(1)
      const [b, sb] = createSignal(1)
      setA = sa
      setB = sb
      sum = createMemo(() => a() + b())
      createEffect(() => {
        sum()
        runs++
      })
    })
    expect(runs).toBe(1)
    batch(() => {
      setA(2)
      setB(3)
      expect(sum()).toBe(5) // fresh inside the batch
    })
    expect(runs).toBe(2) // one run for two writes
  })

  test("B14/R9 nested batch flushes only at outermost exit", () => {
    const [a, setA] = createSignal(0)
    let runs = 0
    createRoot(() => {
      createEffect(() => {
        a()
        runs++
      })
    })
    batch(() => {
      setA(1)
      batch(() => setA(2))
      expect(runs).toBe(1) // still only the initial run
    })
    expect(runs).toBe(2)
  })

  test("B15/R8 self-write loop throws prescriptive E-LOOP; system usable after", () => {
    const [x, setX] = createSignal(0)
    expect(() =>
      createRoot(() => {
        createEffect(() => setX(x() + 1))
      }),
    ).toThrow(/E-LOOP/)
    // unrelated reactivity still works
    const [y, setY] = createSignal(0)
    let runs = 0
    createRoot(() => {
      createEffect(() => {
        y()
        runs++
      })
    })
    setY(1)
    expect(runs).toBe(2)
  })

  test("B16/R10 REGRESSION(bug6): a throwing effect doesn't skip others; rethrown after flush; recovers", () => {
    const [x, setX] = createSignal(0)
    const log: number[] = []
    createRoot(() => {
      createEffect(() => {
        if (x() === 1) throw new Error("boom")
      })
      createEffect(() => log.push(x()))
    })
    expect(log).toEqual([0])
    expect(() => setX(1)).toThrow("boom")
    expect(log).toEqual([0, 1]) // second effect still ran
    setX(2) // no throw, everything alive
    expect(log).toEqual([0, 1, 2])
  })

  test("B17/R10 two throwing effects → AggregateError", () => {
    const [x, setX] = createSignal(0)
    createRoot(() => {
      createEffect(() => {
        if (x() === 1) throw new Error("one")
      })
      createEffect(() => {
        if (x() === 1) throw new Error("two")
      })
    })
    let caught: unknown
    try {
      setX(1)
    } catch (e) {
      caught = e
    }
    expect(caught).toBeInstanceOf(AggregateError)
    expect((caught as AggregateError).errors).toHaveLength(2)
  })

  test("B18/R7 render effects run before user effects, at creation and on update", () => {
    const [x, setX] = createSignal(0)
    const order: string[] = []
    createRoot(() => {
      createEffect(() => {
        x()
        order.push("user")
      })
      createRenderEffect(() => {
        x()
        order.push("render")
      })
    })
    expect(order).toEqual(["render", "user"])
    order.length = 0
    setX(1)
    expect(order).toEqual(["render", "user"])
  })

  test("B19/O5 dispose during flush: queued effect is skipped silently", () => {
    const [x, setX] = createSignal(0)
    let secondRuns = 0
    let disposeInner!: () => void
    createRoot(() => {
      createEffect(() => {
        if (x() === 1) disposeInner()
      })
      createRoot((d) => {
        disposeInner = d
        createEffect(() => {
          x()
          secondRuns++
        })
      })
    })
    expect(secondRuns).toBe(1)
    setX(1) // first effect disposes the second while it is queued
    expect(secondRuns).toBe(1)
    setX(2)
    expect(secondRuns).toBe(1)
  })
})

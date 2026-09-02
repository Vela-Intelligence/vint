// Contract group C — ownership & disposal (O1–O5)
import { describe, expect, test } from "vitest"
import {
  createEffect,
  createMemo,
  createRoot,
  createSignal,
  getOwner,
  onCleanup,
  onMount,
  runWithOwner,
} from "../src/index"
import { __observerCount } from "../src/reactive"

describe("ownership", () => {
  test("C20/O2 onCleanup in an effect runs before every re-run and on dispose", () => {
    const [x, setX] = createSignal(0)
    const log: string[] = []
    let dispose!: () => void
    createRoot((d) => {
      dispose = d
      createEffect(() => {
        const v = x()
        log.push(`run${v}`)
        onCleanup(() => log.push(`clean${v}`))
      })
    })
    expect(log).toEqual(["run0"])
    setX(1)
    expect(log).toEqual(["run0", "clean0", "run1"])
    dispose()
    expect(log).toEqual(["run0", "clean0", "run1", "clean1"])
  })

  test("C21/O2 cleanups run LIFO", () => {
    const log: string[] = []
    createRoot((d) => {
      onCleanup(() => log.push("first"))
      onCleanup(() => log.push("second"))
      d()
    })
    expect(log).toEqual(["second", "first"])
  })

  test("C22/O2 computation created inside an effect run is disposed on the next run", () => {
    const [x, setX] = createSignal(0)
    const [y, setY] = createSignal(0)
    const inner: number[] = []
    createRoot(() => {
      createEffect(() => {
        x()
        createEffect(() => inner.push(y()))
      })
    })
    expect(inner).toEqual([0])
    setY(1)
    expect(inner).toEqual([0, 1])
    setX(1) // outer re-run disposes previous inner effect
    expect(inner).toEqual([0, 1, 1])
    setY(2) // exactly one inner effect alive
    expect(inner).toEqual([0, 1, 1, 2])
  })

  test("C23/O1+O5 root dispose cascades; writes afterwards are no-ops", () => {
    const [x, setX] = createSignal(0)
    let runs = 0
    let dispose!: () => void
    createRoot((d) => {
      dispose = d
      createEffect(() => {
        x()
        runs++
      })
      createEffect(() => {
        x()
        runs++
      })
    })
    expect(runs).toBe(2)
    dispose()
    dispose() // idempotent
    setX(1)
    expect(runs).toBe(2)
  })

  test("C24/O4 onMount runs once, after render effects, with correct owner", () => {
    const order: string[] = []
    const [x, setX] = createSignal(0)
    let dispose!: () => void
    createRoot((d) => {
      dispose = d
      onMount(() => {
        order.push("mount")
        onCleanup(() => order.push("mount-cleanup"))
      })
      createEffect(() => {
        x()
        // user effect: runs alongside mount, but mount registered first
      })
      order.push("body")
    })
    expect(order).toEqual(["body", "mount"])
    setX(1) // onMount must not re-run
    expect(order).toEqual(["body", "mount"])
    dispose()
    expect(order).toEqual(["body", "mount", "mount-cleanup"])
  })

  test("C25/O1 runWithOwner: computation disposes with that owner", () => {
    const [x, setX] = createSignal(0)
    let runs = 0
    let dispose!: () => void
    let owner: ReturnType<typeof getOwner>
    createRoot((d) => {
      dispose = d
      owner = getOwner()
    })
    runWithOwner(owner!, () => {
      createEffect(() => {
        x()
        runs++
      })
    })
    expect(runs).toBe(1)
    setX(1)
    expect(runs).toBe(2)
    dispose()
    setX(2)
    expect(runs).toBe(2)
  })

  test("C26/O5 white-box: dispose detaches all observers from the signal", () => {
    const [x, setX] = createSignal(0)
    let dispose!: () => void
    createRoot((d) => {
      dispose = d
      createEffect(() => x())
      createEffect(() => x())
      const m = createMemo(() => x() * 2)
      createEffect(() => m())
    })
    expect(__observerCount(x)).toBeGreaterThan(0)
    dispose()
    expect(__observerCount(x)).toBe(0)
    setX(1) // must not throw or run anything
  })
})

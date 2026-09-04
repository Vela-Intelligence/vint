// Contract group H — createResource (A1–A4)
import { describe, expect, test } from "vitest"
import type { ResourceAccessor, ResourceControls } from "../src/index"
import { batch, createEffect, createResource, createRoot, createSignal } from "../src/index"

const tick = () => new Promise<void>((r) => setTimeout(r, 0))

type Deferred<T> = { promise: Promise<T>; resolve: (v: T) => void; reject: (e: unknown) => void }
function deferred<T>(): Deferred<T> {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

describe("createResource", () => {
  test("H51/A1 loading → data; error path", async () => {
    const d1 = deferred<string>()
    let data!: ResourceAccessor<string>
    createRoot(() => {
      ;[data] = createResource(() => d1.promise)
    })
    expect(data.loading).toBe(true)
    expect(data()).toBeUndefined()
    d1.resolve("hello")
    await tick()
    expect(data.loading).toBe(false)
    expect(data()).toBe("hello")
    expect(data.error).toBeUndefined()
  })

  test("H51b/A1+A3 error lands in .error, data() does not throw", async () => {
    const d1 = deferred<string>()
    let data!: ResourceAccessor<string>
    createRoot(() => {
      ;[data] = createResource(() => d1.promise)
    })
    d1.reject(new Error("nope"))
    await tick()
    expect(data.loading).toBe(false)
    expect(() => data()).not.toThrow()
    expect((data.error as Error).message).toBe("nope")
  })

  test("H52/A1 source change refetches; falsy source skips", async () => {
    const fetched: number[] = []
    const [id, setId] = createSignal<number | null>(null)
    let data!: ResourceAccessor<string>
    createRoot(() => {
      ;[data] = createResource(id, async (v) => {
        fetched.push(v)
        return `user-${v}`
      })
    })
    expect(fetched).toEqual([]) // null source: no fetch
    expect(data.loading).toBe(false)
    setId(1)
    await tick()
    expect(fetched).toEqual([1])
    expect(data()).toBe("user-1")
    setId(2)
    await tick()
    expect(fetched).toEqual([1, 2])
    expect(data()).toBe("user-2")
  })

  test("H53/A2 race: older response resolving after newer fetch is discarded", async () => {
    const pending: Array<Deferred<string> & { id: number }> = []
    const [id, setId] = createSignal(1)
    let data!: ResourceAccessor<string>
    createRoot(() => {
      ;[data] = createResource(id, (v) => {
        const d = { ...deferred<string>(), id: v }
        pending.push(d)
        return d.promise
      })
    })
    setId(2)
    expect(pending).toHaveLength(2)
    pending[1]!.resolve("new")
    await tick()
    expect(data()).toBe("new")
    pending[0]!.resolve("stale") // v1 arrives late
    await tick()
    expect(data()).toBe("new") // not clobbered
    expect(data.loading).toBe(false)
  })

  test("H53b/A2 response after owner disposal writes nothing", async () => {
    const d1 = deferred<string>()
    let data!: ResourceAccessor<string>
    let dispose!: () => void
    let dataRuns = 0
    createRoot((d) => {
      dispose = d
      ;[data] = createResource(() => d1.promise)
      createEffect(() => {
        data()
        dataRuns++
      })
    })
    dispose()
    d1.resolve("late")
    await tick()
    expect(data()).toBeUndefined()
    expect(dataRuns).toBe(1)
  })

  test("H55/A2 REGRESSION: source change in the creating root body still refetches", async () => {
    const fetched: number[] = []
    const [id, setId] = createSignal(1)
    let data!: ResourceAccessor<string>
    createRoot(() => {
      ;[data] = createResource(id, async (v) => {
        fetched.push(v)
        return `u${v}`
      })
      setId(2) // changed before the resource's effect ever ran
    })
    await tick()
    expect(fetched).toEqual([1, 2]) // creation fetch, then the change — not swallowed
    expect(data()).toBe("u2")
  })

  test("H56/A2 dispose resets loading; refetch after dispose is a no-op; a late response writes nothing", async () => {
    let calls = 0
    const d1 = deferred<string>()
    let data!: ResourceAccessor<string>
    let ctl!: ResourceControls<string>
    let dispose!: () => void
    createRoot((d) => {
      dispose = d
      ;[data, ctl] = createResource(() => {
        calls++
        return d1.promise
      })
    })
    expect(data.loading).toBe(true)
    expect(calls).toBe(1)
    await tick() // past the dedupe window (A4): the refetches below are not deduplicated
    dispose()
    expect(data.loading).toBe(false) // not stuck true (unlike Solid)
    expect(await ctl.refetch()).toBeUndefined()
    expect(await ctl.refetch(false)).toBeUndefined() // the dedupe bypass is a no-op too
    expect(await ctl.refetch("info")).toBeUndefined()
    expect(calls).toBe(1) // fetcher never called after dispose
    d1.resolve("late")
    await tick()
    expect(data()).toBeUndefined() // the in-flight response wrote nothing
    expect(data.loading).toBe(false)
    expect(data.error).toBeUndefined()
  })

  test("H54/A1 refetch and mutate", async () => {
    let count = 0
    let data!: ResourceAccessor<number>
    let ctl!: ResourceControls<number>
    createRoot(() => {
      ;[data, ctl] = createResource(async () => ++count)
    })
    await tick()
    expect(data()).toBe(1)
    ctl.refetch()
    await tick()
    expect(data()).toBe(2)
    ctl.mutate(99)
    expect(data()).toBe(99)
  })

  // --- Phase 4 parity (the plan's table, one regression per row) ---

  test("H57/A4 mutate: value and updater forms return the value; mutate(() => fn) stores fn (R4)", async () => {
    const d1 = deferred<string>()
    let data!: ResourceAccessor<string>
    let ctl!: ResourceControls<string>
    let effectRuns = 0
    createRoot(() => {
      ;[data, ctl] = createResource(() => d1.promise)
      createEffect(() => {
        data()
        effectRuns++
      })
    })
    d1.resolve("a")
    await tick()
    expect(effectRuns).toBe(2)
    expect(ctl.mutate((prev) => `${prev}!`)).toBe("a!")
    expect(data()).toBe("a!")
    expect(effectRuns).toBe(3)
    expect(ctl.mutate("b")).toBe("b")
    expect(data()).toBe("b")
    expect(data.loading).toBe(false) // nothing else changes
    expect(data.error).toBeUndefined()

    const fn = () => 1
    let stored!: ResourceAccessor<unknown>
    let storedCtl!: ResourceControls<unknown>
    createRoot(() => {
      ;[stored, storedCtl] = createResource<unknown>(() => Promise.resolve(0))
    })
    expect(storedCtl.mutate(() => fn)).toBe(fn)
    expect(stored()).toBe(fn) // the updater form is how a function is stored, as R4
  })

  test("H58/A1 initialValue seeds data(); the value is kept while a load is in flight, and through an error", async () => {
    const loads: Array<Deferred<string>> = []
    let data!: ResourceAccessor<string>
    let ctl!: Pick<ResourceControls<string>, "refetch"> // initialValue narrows mutate to Setter<T>
    let loadingInBody: boolean | null = null
    let valueInBody: string | undefined
    createRoot(() => {
      ;[data, ctl] = createResource(
        () => {
          const d = deferred<string>()
          loads.push(d)
          return d.promise
        },
        { initialValue: "init", name: "seeded" },
      )
      loadingInBody = data.loading
      valueInBody = data()
    })
    expect(loadingInBody).toBe(true) // the first fetch still starts at creation
    expect(valueInBody).toBe("init")
    loads[0]!.resolve("one")
    await tick()
    expect(data()).toBe("one")
    void ctl.refetch()
    expect(data.loading).toBe(true)
    expect(data()).toBe("one") // retained while loading
    loads[1]!.reject(new Error("boom"))
    await tick()
    expect(data()).toBe("one") // retained through an error
    expect((data.error as Error).message).toBe("boom")
  })

  test("H59/A1 a fetcher returning a plain value completes synchronously; refetch() still returns a promise", async () => {
    const [src, setSrc] = createSignal(1)
    let data!: ResourceAccessor<string>
    let ctl!: ResourceControls<string>
    let loadingInBody: boolean | null = null
    let loadingSeen = false
    createRoot(() => {
      ;[data, ctl] = createResource(src, (n) => `v${n}`)
      loadingInBody = data.loading
      createEffect(() => {
        if (data.loading) loadingSeen = true
      })
    })
    expect(loadingInBody).toBe(false)
    expect(data()).toBe("v1")
    setSrc(2)
    expect(data()).toBe("v2") // synchronous on a source change too
    expect(data.loading).toBe(false)
    const p = ctl.refetch()
    expect(p).toBeInstanceOf(Promise) // A1: a promise, never the raw value (unlike Solid)
    expect(data()).toBe("v2") // already complete before the promise is awaited
    expect(await p).toBe("v2")
    expect(loadingSeen).toBe(false) // loading was never true at any observable point
  })

  test("H60/A4 error is written only at completion: it persists through the next in-flight load and clears on success", async () => {
    const loads: Array<Deferred<string>> = []
    let data!: ResourceAccessor<string>
    let ctl!: ResourceControls<string>
    createRoot(() => {
      ;[data, ctl] = createResource(() => {
        const d = deferred<string>()
        loads.push(d)
        return d.promise
      })
    })
    loads[0]!.reject(new Error("boom"))
    await tick()
    expect((data.error as Error).message).toBe("boom")
    void ctl.refetch()
    expect(data.loading).toBe(true)
    expect((data.error as Error).message).toBe("boom") // not cleared at load start
    loads[1]!.resolve("ok")
    await tick()
    expect(data.error).toBeUndefined() // cleared on success
    expect(data()).toBe("ok")
    void ctl.refetch()
    loads[2]!.reject(new Error("again"))
    await tick()
    expect((data.error as Error).message).toBe("again") // replaced on the next failure
    expect(data()).toBe("ok") // the value survives a failure
  })

  test("H61/A2 a stale refetch() promise resolves to ITS fetch's value; the signals keep the newest", async () => {
    const loads: Array<Deferred<string>> = []
    let data!: ResourceAccessor<string>
    let ctl!: ResourceControls<string>
    createRoot(() => {
      ;[data, ctl] = createResource(() => {
        const d = deferred<string>()
        loads.push(d)
        return d.promise
      })
    })
    loads[0]!.resolve("zero")
    await tick()
    const a = ctl.refetch()
    const b = ctl.refetch(false)
    loads[2]!.resolve("b")
    loads[1]!.resolve("a") // superseded: arrives after b completed
    expect(await a).toBe("a")
    expect(await b).toBe("b")
    expect(data()).toBe("b") // last fetch wins in the signals
    expect(data.loading).toBe(false)
  })

  test("H62/A4 dedupe returns the SAME in-flight promise; refetch(false) bypasses; a source change is never deduplicated", async () => {
    let calls = 0
    const [src, setSrc] = createSignal(1)
    let ctl!: ResourceControls<string>
    createRoot(() => {
      ;[, ctl] = createResource(src, () => {
        calls++
        return new Promise<string>(() => {}) // never settles: only the call count matters
      })
    })
    expect(calls).toBe(1)
    void ctl.refetch() // same microtask as the creation fetch
    expect(calls).toBe(1)
    await tick()
    const p1 = ctl.refetch()
    const p2 = ctl.refetch()
    const p3 = ctl.refetch("info")
    expect(calls).toBe(2)
    expect(p2).toBe(p1) // the in-flight promise itself, not a new one (Solid returns undefined)
    expect(p3).toBe(p1)
    const bypass = ctl.refetch(false)
    expect(calls).toBe(3)
    expect(bypass).not.toBe(p1)
    await Promise.resolve() // one microtask closes the window
    const p4 = ctl.refetch()
    expect(calls).toBe(4)
    expect(p4).not.toBe(bypass)
    setSrc(2) // same microtask as p4's start: a source change always fetches
    expect(calls).toBe(5)
  })

  test("H63/A4 refetch(info): null, 0 and false pass through as `refetching`; only an omitted argument becomes true", async () => {
    const seen: unknown[] = []
    let ctl!: ResourceControls<number>
    createRoot(() => {
      ;[, ctl] = createResource<number>(async (_s, { refetching }) => {
        seen.push(refetching)
        return 1
      })
    })
    await tick()
    seen.length = 0
    await ctl.refetch()
    await ctl.refetch(undefined)
    await ctl.refetch(null)
    await ctl.refetch(0)
    await ctl.refetch(false)
    await ctl.refetch("why")
    expect(seen).toEqual([true, true, null, 0, false, "why"])
  })

  test("H64/A2 refetch() while the source is falsy cancels: in-flight discarded, loading false, error cleared, resolves undefined", async () => {
    let current: number | null = 1
    const source = () => current // a plain accessor: the resource sees the change only when asked
    const loads: Array<Deferred<string>> = []
    let data!: ResourceAccessor<string>
    let ctl!: ResourceControls<string>
    createRoot(() => {
      ;[data, ctl] = createResource(source, () => {
        const d = deferred<string>()
        loads.push(d)
        return d.promise
      })
    })
    loads[0]!.reject(new Error("boom"))
    await tick()
    expect((data.error as Error).message).toBe("boom")
    const inFlight = ctl.refetch()
    expect(data.loading).toBe(true)
    await Promise.resolve() // leave the dedupe window (A4) — the cancel below must be a real call
    current = null
    await expect(ctl.refetch()).resolves.toBeUndefined()
    expect(loads).toHaveLength(2) // the fetcher was not called for the falsy source
    expect(data.loading).toBe(false)
    expect(data.error).toBeUndefined() // a cancel clears the error
    loads[1]!.resolve("stale")
    await tick()
    expect(data()).toBeUndefined() // the in-flight response was discarded
    expect(await inFlight).toBe("stale") // ...but its own promise still reports its value (A2)

    // the same through a batch: the source signal changed before the resource's effect observed it
    const [sig, setSig] = createSignal<number | null>(1)
    let data2!: ResourceAccessor<string>
    let ctl2!: ResourceControls<string>
    createRoot(() => {
      ;[data2, ctl2] = createResource(sig, () => new Promise<string>(() => {}))
    })
    expect(data2.loading).toBe(true)
    await tick() // past the creation fetch's dedupe window
    let result: Promise<string | undefined> | undefined
    batch(() => {
      setSig(null)
      result = ctl2.refetch()
    })
    expect(data2.loading).toBe(false)
    await expect(result).resolves.toBeUndefined()
  })

  test("H65/A3 a non-Error failure becomes an Error with the raw value as `cause`; an Error passes through unchanged", async () => {
    const d1 = deferred<string>()
    let data!: ResourceAccessor<string>
    let ctl!: ResourceControls<string>
    createRoot(() => {
      ;[data, ctl] = createResource(() => d1.promise)
    })
    const raw = { code: 42 }
    d1.reject(raw)
    await tick()
    expect(data.error).toBeInstanceOf(Error)
    expect((data.error as Error).cause).toBe(raw)
    expect((data.error as Error).message).toBe(String(raw)) // A3: new Error(String(it), { cause: it })

    let thrown!: ResourceAccessor<string>
    createRoot(() => {
      ;[thrown] = createResource((): string => {
        throw 7
      })
    })
    expect(thrown.error).toBeInstanceOf(Error)
    expect((thrown.error as Error).cause).toBe(7)
    expect((thrown.error as Error).message).toBe("7")

    const real = new TypeError("real")
    void ctl
    let passed!: ResourceAccessor<string>
    createRoot(() => {
      ;[passed] = createResource(() => Promise.reject(real))
    })
    await tick()
    expect(passed.error).toBe(real) // not re-wrapped
  })

  test("H66/A2+R7 a source-change fetch runs in the render phase, before a user effect created earlier", async () => {
    const order: string[] = []
    const [n, setN] = createSignal(1)
    createRoot(() => {
      createEffect(() => order.push(`effect:${n()}`))
      createResource(n, async (v) => {
        order.push(`fetch:${v}`)
        return v
      })
    })
    expect(order).toEqual(["fetch:1", "effect:1"])
    setN(2)
    expect(order).toEqual(["fetch:1", "effect:1", "fetch:2", "effect:2"])
  })
})

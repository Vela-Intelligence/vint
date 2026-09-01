// Contract group H — createResource (A1–A3)
import { describe, expect, test } from "vitest"
import { createEffect, createResource, createRoot, createSignal } from "../src/index"

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
    let data!: ReturnType<typeof createResource<string, true>>[0]
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
    let data!: ReturnType<typeof createResource<string, true>>[0]
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
    let data!: ReturnType<typeof createResource<string, number>>[0]
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
    let data!: ReturnType<typeof createResource<string, number>>[0]
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
    let data!: ReturnType<typeof createResource<string, true>>[0]
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

  test("H54/A1 refetch and mutate", async () => {
    let count = 0
    let data!: ReturnType<typeof createResource<number, true>>[0]
    let ctl!: ReturnType<typeof createResource<number, true>>[1]
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
})

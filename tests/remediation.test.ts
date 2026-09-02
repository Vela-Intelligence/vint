// Review remediation regressions (2026-09-02 review). Each test cites the
// review finding number and the contract clause it enforces.
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import {
  createEffect,
  createMemo,
  createResource,
  createRoot,
  createSignal,
  For,
  Match,
  mount,
  on,
  onCleanup,
  Show,
  Switch,
  tags,
} from "../src/index"
import { __observerCount } from "../src/reactive"

let host: HTMLDivElement
let warn: ReturnType<typeof vi.spyOn>
beforeEach(() => {
  document.body.innerHTML = ""
  host = document.createElement("div")
  document.body.append(host)
  warn = vi.spyOn(console, "warn").mockImplementation(() => {})
})
afterEach(() => warn.mockRestore())

const warned = (code: string) => warn.mock.calls.some((c) => String(c[0]).includes(code))
const tick = () => new Promise<void>((r) => setTimeout(r, 0))

describe("A. reactive core", () => {
  test("rev#1/R10 throwing memo retries on next read — never silently stale", () => {
    let setN!: (v: number) => void
    let doubled!: () => number
    let shouldThrow = false
    createRoot(() => {
      const [n, s] = createSignal(5)
      setN = s
      doubled = createMemo(() => {
        const v = n()
        if (shouldThrow) throw new Error("memo boom")
        return v * 2
      })
    })
    expect(doubled()).toBe(10)
    shouldThrow = true
    setN(6) // no reader yet — invalidates only (memos are lazy, R5)
    expect(() => doubled()).toThrow("memo boom") // read runs and throws
    expect(() => doubled()).toThrow("memo boom") // still retrying — NOT stale-cached
    shouldThrow = false
    expect(doubled()).toBe(12) // NOT the stale 10
  })

  test("rev#1/R10 memo throwing BEFORE reading any dep on recompute still retries", () => {
    let gate = false
    let setN!: (v: number) => void
    let m!: () => number
    createRoot(() => {
      const [n, s] = createSignal(7)
      setN = s
      m = createMemo(() => {
        if (gate) throw new Error("early boom") // throws before n() is read
        return n()
      })
    })
    expect(m()).toBe(7)
    gate = true
    setN(8) // invalidate
    expect(() => m()).toThrow("early boom") // recompute threw with zero deps tracked
    gate = false
    expect(m()).toBe(8) // still retries — not wedged, not stale
  })

  test("rev#1/R10 effect keeps deps read before a throw (documented partial-deps)", () => {
    const [n, setN] = createSignal(0)
    let runs = 0
    createRoot(() => {
      createEffect(() => {
        n() // dep read first
        runs++
        if (n() === 1) throw new Error("boom")
      })
    })
    expect(() => setN(1)).toThrow("boom")
    setN(2) // dep was read before the throw → effect recovers
    expect(runs).toBe(3)
  })

  test("rev#5,#10/R7 render effects settle before the NEXT user effect, mid-flush", () => {
    const seen: string[] = []
    const [n, setN] = createSignal(0)
    const [go, setGo] = createSignal(0)
    mount(host, () => {
      createEffect(() => {
        if (go()) setN(1) // user effect writes a DOM-bound signal
      })
      createEffect(() => {
        go()
        seen.push(host.textContent ?? "")
      })
      return tags.div(n)
    })
    seen.length = 0
    setGo(1)
    expect(seen).toEqual(["1"]) // later user effect observes UPDATED DOM
  })

  test("rev#14/H2 on() tuple types flow through (the llms.txt example)", () => {
    const [a, setA] = createSignal(1)
    const [b] = createSignal("xy")
    const out: number[] = []
    createRoot(() => {
      createEffect(
        on([a, b], ([av, bv]) => {
          // av: number, bv: string — compiles without casts
          out.push(av + bv.length)
        }),
      )
    })
    expect(out).toEqual([3])
    setA(2)
    expect(out).toEqual([3, 4])
  })

  test("rev#7/A4 E-SAMEREF-SET warns on the push-then-set footgun; object rows don't warn", () => {
    const arr = ["a"]
    const [items, setItems] = createSignal(arr)
    arr.push("b")
    setItems(arr) // same reference: no-op
    expect(items()).toHaveLength(2) // (same array, mutated)
    expect(warned("E-SAMEREF-SET")).toBe(true)

    warn.mockClear()
    // For rows re-set identical OBJECT references every reconcile — no warning
    type T = { id: number }
    const [objs, setObjs] = createSignal<T[]>([{ id: 1 }])
    mount(host, () =>
      tags.ul(
        For({ each: objs, key: (t) => t.id, children: (item) => tags.li(() => String(item().id)) }),
      ),
    )
    setObjs((prev) => [...prev, { id: 2 }])
    expect(warned("E-SAMEREF-SET")).toBe(false)
  })
})

describe("B. resource", () => {
  test("rev#2/A3 synchronously-throwing fetcher lands in .error; nothing escapes; loading false", async () => {
    let data!: ReturnType<typeof createResource<string, true>>[0]
    let ctl!: ReturnType<typeof createResource<string, true>>[1]
    expect(() =>
      createRoot(() => {
        ;[data, ctl] = createResource<string, true>(() => {
          throw new Error("sync boom")
        })
      }),
    ).not.toThrow()
    expect(data.loading).toBe(false)
    expect((data.error as Error).message).toBe("sync boom")
    expect(() => ctl.refetch()).not.toThrow() // refetch path too
    await tick()
    expect(data.loading).toBe(false)
    expect((data.error as Error).message).toBe("sync boom")
  })

  test("rev#4,#7/A2 source→null cancels: loading false immediately, in-flight response discarded", async () => {
    let resolve!: (v: string) => void
    const [src, setSrc] = createSignal<number | null>(1)
    let data!: ReturnType<typeof createResource<string, number | null>>[0]
    createRoot(() => {
      ;[data] = createResource(src, () => new Promise<string>((r) => (resolve = r)))
    })
    expect(data.loading).toBe(true)
    setSrc(null)
    expect(data.loading).toBe(false) // cancelled interest
    resolve("stale")
    await tick()
    expect(data()).toBeUndefined() // discarded
    expect(data.loading).toBe(false)
  })

  test("rev#13/A1 loading is true in the component body; refetch returns a promise", async () => {
    let loadingInBody: boolean | null = null
    let data!: ReturnType<typeof createResource<number, true>>[0]
    let ctl!: ReturnType<typeof createResource<number, true>>[1]
    let count = 0
    createRoot(() => {
      ;[data, ctl] = createResource(async () => ++count)
      loadingInBody = data.loading // Solid parity: fetch already started
    })
    expect(loadingInBody).toBe(true)
    await tick()
    expect(data()).toBe(1)
    const result = await ctl.refetch()
    expect(result).toBe(2)
    expect(data()).toBe(2)
  })

  test("rev#18/E createResource outside an owner warns naming createResource", () => {
    createResource(async () => 1)
    expect(warn.mock.calls.some((c) => String(c[0]).includes("createResource"))).toBe(true)
  })
})

describe("C. control flow", () => {
  const liTexts = () => [...host.querySelectorAll("li")].map((li) => li.textContent)

  test("rev#3,#5/C2+R10 duplicate keys throw WITHOUT corrupting the For; corrected data recovers", () => {
    const [shared] = createSignal(0)
    const [items, setItems] = createSignal(["a", "b"])
    const baseline = __observerCount(shared)
    mount(host, () =>
      tags.ul(
        For({
          each: items,
          children: (item) =>
            tags.li(() => {
              shared()
              return item()
            }),
        }),
      ),
    )
    expect(liTexts()).toEqual(["a", "b"])
    expect(() => setItems(["x", "x"])).toThrow(/E-FOR-DUPKEY/)
    expect(liTexts()).toEqual(["a", "b"]) // untouched — no half-reconciled state
    setItems(["a", "c"]) // recovery
    expect(liTexts()).toEqual(["a", "c"])
    expect(__observerCount(shared)).toBe(baseline + 2) // no leaked row scopes
  })

  test("rev#9/C2 each() returning undefined fires E-FOR-EACH-RESULT with the right prescription", () => {
    const [items, setItems] = createSignal<string[] | undefined>(["a"])
    mount(host, () =>
      tags.ul(For({ each: items as () => string[], children: (item) => tags.li(() => item()) })),
    )
    expect(() => setItems(undefined)).toThrow(/E-FOR-EACH-RESULT.*\?\? \[\]/s)
  })

  test("rev#6/C2 property access on the item accessor warns E-FOR-ITEM-ACCESS", () => {
    type T = { title: string }
    const [items] = createSignal<T[]>([{ title: "x" }])
    mount(host, () =>
      tags.ul(
        For({
          each: items,
          // biome-ignore lint/suspicious/noExplicitAny: deliberate Solid-prior mistake
          children: (item) => tags.li(String((item as any).title)),
        }),
      ),
    )
    expect(warned("E-FOR-ITEM-ACCESS")).toBe(true)
    expect(warn.mock.calls.some((c) => String(c[0]).includes("item().title"))).toBe(true)
  })

  test("rev#8b/C2 For fallback shows while empty, swaps to rows, cleans up", () => {
    const [items, setItems] = createSignal<string[]>([])
    let cleanups = 0
    mount(host, () =>
      tags.ul(
        For({
          each: items,
          fallback: () => {
            onCleanup(() => cleanups++)
            return tags.li({ class: "empty" }, "nothing here")
          },
          children: (item) => tags.li(() => item()),
        }),
      ),
    )
    expect(host.querySelector("li.empty")?.textContent).toBe("nothing here")
    setItems(["a"])
    expect(host.querySelector("li.empty")).toBeNull()
    expect(cleanups).toBe(1)
    expect(liTexts()).toEqual(["a"])
    setItems([])
    expect(host.querySelector("li.empty")?.textContent).toBe("nothing here")
  })

  test("rev#8/C1 Show callback-children receive the narrowed value as an accessor", () => {
    const [user, setUser] = createSignal<{ name: string } | null>(null)
    let builds = 0
    mount(host, () =>
      tags.div(
        Show({
          when: user,
          children: (u) => {
            builds++
            return tags.b(() => u().name)
          },
        }),
      ),
    )
    expect(host.querySelector("b")).toBeNull()
    setUser({ name: "ada" })
    expect(host.querySelector("b")!.textContent).toBe("ada")
    setUser({ name: "grace" }) // truthy→truthy: no rebuild, accessor updates
    expect(builds).toBe(1)
    expect(host.querySelector("b")!.textContent).toBe("grace")
  })

  test("rev#12/C3 Switch with non-array children throws E-SWITCH-ARRAY", () => {
    const [on_] = createSignal(true)
    expect(() =>
      mount(host, () =>
        tags.div(
          Switch({
            children: Match({ when: on_, children: () => tags.p("A") }) as never,
          }),
        ),
      ),
    ).toThrow(/E-SWITCH-ARRAY/)
  })

  test("rev#17/C2 For whose markers were removed by an outer binding warns E-FOR-DETACHED", () => {
    const [cond, setCond] = createSignal(true)
    const [items, setItems] = createSignal(["a"])
    mount(host, () => {
      // For created in the component root, but its nodes hoisted into a
      // binding range — the documented anti-pattern
      const list = For({ each: items, children: (item) => tags.li(() => item()) })
      return tags.ul(() => (cond() ? list : null))
    })
    expect([...host.querySelectorAll("li")]).toHaveLength(1)
    setCond(false) // binding removes the For's marker nodes; For stays alive
    setItems(["a", "b"])
    expect(warned("E-FOR-DETACHED")).toBe(true)
  })
})

describe("D. DOM guards", () => {
  test("rev#8c/D7 ref and classList throw prescriptive errors", () => {
    expect(() => tags.div({ ref: (el: Element) => el } as never)).toThrow(
      /E-NO-REF.*returns the element/s,
    )
    expect(() => tags.div({ classList: { on: true } } as never)).toThrow(/E-NO-CLASSLIST.*class:/s)
  })

  test("rev#15/D9 mount with a node instead of a function throws E-MOUNT-VIEW", () => {
    const el = tags.div("hi")
    expect(() => mount(host, el as never)).toThrow(/E-MOUNT-VIEW.*App\(\)/s)
  })

  test("rev#12sec/D6 __proto__ prop key is ignored and the element survives", () => {
    const el = tags.div({ ["__proto__"]: { hacked: true } } as Record<string, unknown>)
    expect(warned("E-PROTO-KEY")).toBe(true)
    expect(Object.getPrototypeOf(el)).toBe(HTMLDivElement.prototype)
    el.append("still works") // methods intact
    expect(el.textContent).toBe("still works")
  })

  test("rev#10sec/D10 innerHTML prop warns E-RAW-HTML (but still assigns)", () => {
    const el = tags.div({ innerHTML: "<b>x</b>" })
    expect(warned("E-RAW-HTML")).toBe(true)
    expect(el.querySelector("b")).not.toBeNull()
  })

  test("rev#4sec/D8 non-function under an on* key is skipped, never an attribute", () => {
    const el = tags.div({ onclick: "alert(1)" } as Record<string, unknown>)
    expect(warned("E-EVENT-VALUE")).toBe(true)
    expect(el.getAttribute("onclick")).toBeNull()
    expect((el as HTMLElement).onclick).toBeNull()
  })
})

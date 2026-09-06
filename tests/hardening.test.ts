// Hardening regressions: error paths, prior-fidelity guards, and security
// guards. Each test cites the contract clause it enforces (docs/contract.md).
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import type { ResourceAccessor, ResourceControls } from "../src/index"
import {
  batch,
  createEffect,
  createMemo,
  createRenderEffect,
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
  test("R10 throwing memo retries on next read — never silently stale", () => {
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

  test("R10 memo throwing BEFORE reading any dep on recompute still retries", () => {
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

  test("R10 a memo error reaches a queued effect from the flush, not at the read site", () => {
    // The memo is recomputed while the effect's dependencies are validated —
    // BEFORE its body runs — so a try/catch written inside the effect can
    // never see it. Documented in R10 so nobody guards the wrong place.
    const seen: unknown[] = []
    let setN!: (v: number) => void
    createRoot(() => {
      const [n, set] = createSignal(0)
      setN = set
      const doubled = createMemo(() => {
        if (n() === 1) throw new Error("memo boom")
        return n() * 2
      })
      createEffect(() => {
        try {
          seen.push(doubled())
        } catch {
          seen.push("caught-inside")
        }
      })
    })
    expect(seen).toEqual([0])
    expect(() => setN(1)).toThrow(/memo boom/) // surfaced by the flush
    expect(seen).toEqual([0]) // the body never ran; the inner catch saw nothing
    setN(2) // and the effect recovers on the next dependency write
    expect(seen).toEqual([0, 4])
  })

  test("R10 effect keeps deps read before a throw (documented partial-deps)", () => {
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

  test("R7 render effects settle before the NEXT user effect, mid-flush", () => {
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

  test("H2 on() tuple types flow through (the guide's example)", () => {
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

  test("A4 E-SAMEREF-SET warns on the push-then-set footgun; object rows don't warn", () => {
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
  test("A3 synchronously-throwing fetcher lands in .error; nothing escapes; loading false", async () => {
    let data!: ResourceAccessor<string>
    let ctl!: ResourceControls<string>
    expect(() =>
      createRoot(() => {
        ;[data, ctl] = createResource<string, true>(() => {
          throw new Error("sync boom")
        })
      }),
    ).not.toThrow()
    expect(data.loading).toBe(false)
    expect((data.error as Error).message).toBe("sync boom")
    let result!: Promise<string | undefined>
    expect(() => {
      result = ctl.refetch() // refetch path too
    }).not.toThrow()
    expect(data.loading).toBe(false) // A1: errored synchronously, never loading
    await expect(result).resolves.toBeUndefined() // A1: still a promise
    expect(data.loading).toBe(false)
    expect((data.error as Error).message).toBe("sync boom")
  })

  test("A2 source→null cancels: loading false immediately, in-flight response discarded", async () => {
    let resolve!: (v: string) => void
    const [src, setSrc] = createSignal<number | null>(1)
    let data!: ResourceAccessor<string>
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

  test("A1 loading is true in the component body; refetch returns a promise", async () => {
    let loadingInBody: boolean | null = null
    let data!: ResourceAccessor<number>
    let ctl!: ResourceControls<number>
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

  test("E createResource outside an owner warns naming createResource", () => {
    createResource(async () => 1)
    expect(warn.mock.calls.some((c) => String(c[0]).includes("createResource"))).toBe(true)
  })
})

describe("C. control flow", () => {
  const liTexts = () => [...host.querySelectorAll("li")].map((li) => li.textContent)

  test("C2+R10 duplicate keys throw WITHOUT corrupting the For; corrected data recovers", () => {
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

  test("C2 each() returning undefined fires E-FOR-EACH-RESULT with the right prescription", () => {
    const [items, setItems] = createSignal<string[] | undefined>(["a"])
    mount(host, () =>
      tags.ul(For({ each: items as () => string[], children: (item) => tags.li(() => item()) })),
    )
    expect(() => setItems(undefined)).toThrow(/E-FOR-EACH-RESULT.*\?\? \[\]/s)
  })

  test("C2 property access on the item accessor warns E-FOR-ITEM-ACCESS", () => {
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

  test("C2 For fallback shows while empty, swaps to rows, cleans up", () => {
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

  test("C1 Show callback-children receive the narrowed value as an accessor", () => {
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

  test("C3 Switch with non-array children throws E-SWITCH-ARRAY", () => {
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

  test("C2+D2 a hoisted For survives a run that drops it; only DOM emptied OUTSIDE vint is E-FOR-DETACHED", () => {
    const [cond, setCond] = createSignal(true)
    const [items, setItems] = createSignal(["a"])
    mount(host, () => {
      // For created in the component root, its nodes hoisted into a binding
      // range: when the binding drops it, the run goes back into the For's
      // own fragment (D2), so the For keeps reconciling there
      const list = For({ each: items, children: (item) => tags.li(() => item()) })
      return tags.ul(() => (cond() ? list : null))
    })
    expect([...host.querySelectorAll("li")]).toHaveLength(1)
    setCond(false)
    setItems(["a", "b"]) // reconciles inside the fragment — no warning
    expect(warned("E-FOR-DETACHED")).toBe(false)
    setCond(true)
    expect([...host.querySelectorAll("li")].map((li) => li.textContent)).toEqual(["a", "b"])
    // emptied by something that is not vint: the markers are gone for good
    ;(host.querySelector("ul") as HTMLUListElement).replaceChildren()
    setItems(["a", "b", "c"])
    expect(warned("E-FOR-DETACHED")).toBe(true)
  })
})

describe("D. DOM guards", () => {
  test("D7 ref and classList throw prescriptive errors", () => {
    expect(() => tags.div({ ref: (el: Element) => el } as never)).toThrow(
      /E-NO-REF.*returns the element/s,
    )
    expect(() => tags.div({ classList: { on: true } } as never)).toThrow(/E-NO-CLASSLIST.*class:/s)
  })

  test("D9 mount with a node instead of a function throws E-MOUNT-VIEW", () => {
    const el = tags.div("hi")
    expect(() => mount(host, el as never)).toThrow(/E-MOUNT-VIEW.*App\(\)/s)
  })

  test("D6 __proto__ prop key is ignored and the element survives", () => {
    const el = tags.div({ ["__proto__"]: { hacked: true } } as never)
    expect(warned("E-PROTO-KEY")).toBe(true)
    expect(Object.getPrototypeOf(el)).toBe(HTMLDivElement.prototype)
    el.append("still works") // methods intact
    expect(el.textContent).toBe("still works")
  })

  test("D10 innerHTML prop warns E-RAW-HTML (but still assigns)", () => {
    const el = tags.div({ innerHTML: "<b>x</b>" })
    expect(warned("E-RAW-HTML")).toBe(true)
    expect(el.querySelector("b")).not.toBeNull()
  })

  test("D8 non-function under an on* key is skipped, never an attribute", () => {
    const el = tags.div({ onclick: "alert(1)" } as never)
    expect(warned("E-EVENT-VALUE")).toBe(true)
    expect(el.getAttribute("onclick")).toBeNull()
    expect((el as HTMLElement).onclick).toBeNull()
  })

  test("D7 a prop binding that tracks nothing warns E-DEAD-BINDING", () => {
    // R3 collects dependencies per run, so a first run that reads no signals
    // can never be re-triggered — the binding is provably dead. This is the
    // general form of the zero-arity callback mistake.
    tags.div({ id: () => "static" })
    expect(warned("E-DEAD-BINDING")).toBe(true)

    warn.mockClear()
    tags["vi-list"]({ renderer: () => "<b>row</b>" })
    expect(warned("E-DEAD-BINDING")).toBe(true)
  })

  test("D7 E-DEAD-BINDING does NOT fire on a real reactive binding", () => {
    const [n] = createSignal(1)
    const doubled = createMemo(() => n() * 2)
    tags["vi-badge"]({ count: () => n() }) // the pattern a naive guard breaks
    tags.div({ class: () => (n() > 0 ? "on" : "") })
    tags.div({ tabIndex: n }) // accessor passed directly
    tags.div({ id: () => String(doubled()) }) // via a memo
    expect(warned("E-DEAD-BINDING")).toBe(false)
    expect(warned("E-CALLBACK-PROP")).toBe(false)
  })

  test("D7 E-DEAD-BINDING skips prop: and event keys", () => {
    tags["vi-list"]({ "prop:renderer": () => "x" }) // the prescribed fix
    tags.div({ onclick: () => "x" })
    expect(warned("E-DEAD-BINDING")).toBe(false)
  })

  test("D7 overwriting a function-valued property warns E-CALLBACK-PROP", () => {
    // The element ships a default renderer; a binding returning a non-function
    // has destroyed it. This is what catches the zero-arity callback that DOES
    // read a signal, which the dead-binding check cannot see.
    class ViGrid extends HTMLElement {
      renderer: unknown = () => "default"
    }
    if (!customElements.get("vi-grid")) customElements.define("vi-grid", ViGrid)
    const [title] = createSignal("hello")
    const el = tags["vi-grid"]({ renderer: () => `<b>${title()}</b>` })
    expect(warned("E-CALLBACK-PROP")).toBe(true)
    expect(warned("E-DEAD-BINDING")).toBe(false) // it reads a signal, so not dead
    expect((el as unknown as { renderer: unknown }).renderer).toBe("<b>hello</b>")
  })

  test("D7 the undetectable case is documented, not caught", () => {
    // A zero-argument callback that reads signals on an element with NO
    // default is shaped identically to a correct binding. Contract D7 says
    // this is accepted; the test pins that so nobody "fixes" it with a
    // heuristic that fires on correct code.
    const [title] = createSignal("hello")
    tags["vi-plain"]({ renderer: () => `<b>${title()}</b>` })
    expect(warned("E-DEAD-BINDING")).toBe(false)
    expect(warned("E-CALLBACK-PROP")).toBe(false)
  })

  test("D9 mount with a non-element container throws E-MOUNT-CONTAINER", () => {
    expect(() => mount(null as never, () => tags.div("x"))).toThrow(/E-MOUNT-CONTAINER/)
    expect(() => mount(document as never, () => tags.div("x"))).toThrow(/E-MOUNT-CONTAINER/)
    expect(() => mount("#app" as never, () => tags.div("x"))).toThrow(
      /E-MOUNT-CONTAINER.*querySelector/s,
    )
  })

  test("D10 [F6] javascript:/vbscript: URLs warn E-URL-SCHEME and are NEVER assigned; data:text/html warns and assigns", () => {
    const link = tags.a({ href: "javascript:alert(1)" }, "x")
    expect(warned("E-URL-SCHEME")).toBe(true)
    expect(link.hasAttribute("href")).toBe(false) // always on: never a live javascript: URL

    warn.mockClear()
    const vb = tags.a({ href: "vbscript:msgbox(1)" })
    expect(warned("E-URL-SCHEME")).toBe(true)
    expect(vb.hasAttribute("href")).toBe(false)

    warn.mockClear()
    const frame = tags.iframe({ src: "data:text/html,<script>alert(1)</script>" })
    expect(warned("E-URL-SCHEME")).toBe(true)
    expect(frame.getAttribute("src")).toContain("data:text/html") // a document: warn, still assigned

    // browsers strip control characters before matching the scheme; so do we
    warn.mockClear()
    const obfuscated = tags.a({ href: "java\tscript:alert(1)" })
    expect(warned("E-URL-SCHEME")).toBe(true)
    expect(obfuscated.hasAttribute("href")).toBe(false)

    // through attr:/reactive prop paths, and a URL object
    warn.mockClear()
    const viaAttr = tags.a({ "attr:href": () => "javascript:void 0" })
    expect(warned("E-URL-SCHEME")).toBe(true)
    expect(viaAttr.hasAttribute("href")).toBe(false)
    expect(tags.a({ "prop:href": new URL("javascript:1") }).hasAttribute("href")).toBe(false)

    // a reactive binding that turns hostile clears the good value it replaced
    warn.mockClear()
    const [href, setHref] = createSignal("/ok")
    let live!: HTMLAnchorElement
    createRoot(() => {
      live = tags.a({ href })
    })
    expect(live.getAttribute("href")).toBe("/ok")
    setHref("javascript:alert(1)")
    expect(live.hasAttribute("href")).toBe(false)
    expect(warned("E-URL-SCHEME")).toBe(true)
    setHref("/back")
    expect(live.getAttribute("href")).toBe("/back")
  })

  test("D10 ordinary URLs and data: images do not warn E-URL-SCHEME", () => {
    tags.a({ href: "https://example.com/x?a=1" })
    tags.a({ href: "/relative/path" })
    tags.a({ href: "mailto:a@b.c" })
    tags.img({ src: "data:image/png;base64,iVBORw0KGgo=" })
    expect(warned("E-URL-SCHEME")).toBe(false)
  })
})

describe("C. Control-flow argument guards", () => {
  test("C1 Show with a value `when` throws E-SHOW-WHEN naming the Solid divergence", () => {
    expect(() => Show({ when: true as never, children: () => tags.div("x") })).toThrow(
      /E-SHOW-WHEN.*Solid/s,
    )
  })

  test("C3 Match with a value `when` throws E-MATCH-WHEN", () => {
    expect(() => Match({ when: 1 as never, children: () => tags.div("x") })).toThrow(/E-MATCH-WHEN/)
  })

  test("C1/C2/C3 a built element where a thunk belongs throws E-CHILDREN-FN", () => {
    expect(() => Show({ when: () => true, children: tags.div("x") as never })).toThrow(
      /E-CHILDREN-FN.*Show's children/s,
    )
    expect(() =>
      Show({ when: () => true, children: () => tags.div("x"), fallback: tags.p("f") as never }),
    ).toThrow(/E-CHILDREN-FN.*Show's fallback/s)
    expect(() => For({ each: () => [1], children: tags.li("x") as never })).toThrow(
      /E-CHILDREN-FN.*For's children/s,
    )
    expect(() => Match({ when: () => true, children: tags.div("x") as never })).toThrow(
      /E-CHILDREN-FN.*Match's children/s,
    )
    expect(() => Switch({ children: [], fallback: tags.div("x") as never })).toThrow(
      /E-CHILDREN-FN.*Switch's fallback/s,
    )
  })

  test("C1/C2 the guards do not fire on correct usage", () => {
    const [n] = createSignal(1)
    const dispose = mount(host, () =>
      tags.div(
        Show({ when: n, children: () => tags.span("a"), fallback: () => tags.span("b") }),
        For({ each: () => [1, 2], children: (i) => tags.li(() => String(i())) }),
        Switch({
          fallback: () => tags.em("none"),
          children: [Match({ when: n, children: () => tags.b("m") })],
        }),
      ),
    )
    expect(host.textContent).toBe("a12m")
    dispose()
  })
})

// F10 in docs/assessment-2026-09-final.md, found by the repaired property
// oracle (F4): an effect whose body threw was later re-notified through a
// memo that recomputed to an EQUAL value, so R5's gate skipped it and its
// last completed run — with an old signal value — stood forever, silently.
describe("R10 [F10] a run that threw never completed: the next notification re-runs the effect", () => {
  test("re-notified through an equal memo recompute, the effect still re-runs", () => {
    const [s, setS] = createSignal(8)
    const [gate, setGate] = createSignal(false)
    const seen: string[] = []
    createRoot(() => {
      const m = createMemo(() => {
        const v = (s() + 7) % 4
        if (gate() && v === 3) throw new Error("boom")
        return v
      })
      createEffect(() => {
        seen.push(`${s()}:${m()}`)
      })
    })
    expect(seen).toEqual(["8:3"])
    expect(() => setGate(true)).toThrow(/boom/) // validation throws
    expect(() => setS(0)).toThrow(/boom/) // the body reads s = 0, then m throws
    setGate(false) // m recomputes to 3 — equal to the value it still held
    expect(seen).toEqual(["8:3", "0:3"]) // Solid would leave it at ["8:3"]
    setS(1)
    expect(seen).toEqual(["8:3", "0:3", "1:0"])
  })

  test("an effect whose own body throws re-runs on the next notification, however it arrives", () => {
    const [s, setS] = createSignal(1)
    const [k, setK] = createSignal(0)
    let runs = 0
    createRoot(() => {
      const parity = createMemo(() => k() % 2)
      createEffect(() => {
        runs++
        parity()
        if (s() === 2) throw new Error("bad state")
      })
    })
    expect(runs).toBe(1)
    expect(() => setS(2)).toThrow(/bad state/)
    expect(() => setK(2)).toThrow(/bad state/) // parity 0 → 0: equal, yet the aborted run re-runs and throws again
    expect(runs).toBe(3)
  })
})

// F11 in docs/assessment-2026-09-final.md (found by the repaired property
// oracle, F4): a memo that rethrew its cached error to a reader in the same
// flush had lost `aborted` to the CHECK mark that preceded the read, so a
// later DIRTY mark in that flush found it "at state, not aborted" and never
// re-walked to the reader it had just failed — a stranded effect (I3).
describe("R10/I3 [F11] a memo rethrowing its cached error stays aborted", () => {
  test("a DIRTY reader's body gets the cached rethrow; a later DIRTY mark in the flush still reaches it", () => {
    const [x, setX] = createSignal(0)
    const [y, setY] = createSignal(0)
    const [z, setZ] = createSignal(0)
    const [t, setT] = createSignal(0)
    const seen: number[] = []
    createRoot(() => {
      const parity = createMemo(() => x() % 2)
      const m = createMemo(() => {
        const v = y() + parity()
        if (v === 1) throw new Error("m")
        return v
      })
      // the reader takes a direct signal (z) so its re-run is a DIRTY body run,
      // whose read gets the cached rethrow — the path that lost `aborted`
      createRenderEffect(() => {
        z()
        seen.push(m())
      })
      // u1: a CHECK mark on m through `parity` (which recomputes EQUAL, so
      // F12 finds nothing to retry) and a DIRTY mark on the reader through z
      createEffect(() => {
        if (t() === 1) {
          setX(2)
          setZ(1)
        }
      })
      // u2: a DIRTY mark on m — it recomputes (2 + 0 = 2) and the reader MUST run
      createEffect(() => {
        if (t() === 1) setY(2)
      })
    })
    expect(seen).toEqual([0])
    expect(() =>
      batch(() => {
        setY(1) // m throws on the reader's first run this flush
        setT(1) // then u1, then u2
      }),
    ).toThrow(/^m$/)
    expect(seen).toEqual([0, 2]) // before the fix: [0], the reader stranded for good
    setY(3)
    expect(seen).toEqual([0, 2, 3])
  })
})

// F12 in docs/assessment-2026-09-final.md (found by the repaired property
// oracle, F4): a memo that threw this flush rethrew its cached error to every
// further read even after an UPSTREAM MEMO had changed through a cascade —
// only a direct write cleared the cache — so the reader stood in a false
// error state until some later, unrelated write.
describe("R10 [F12] a cached memo error clears on a real dependency change at any depth", () => {
  test("an upstream memo changed by a same-flush cascade makes the errored memo recompute, not rethrow", () => {
    const [a, setA] = createSignal(2)
    const [t, setT] = createSignal(0)
    const seen: number[] = []
    createRoot(() => {
      const m1 = createMemo(() => a())
      const m2 = createMemo(() => {
        const v = m1()
        if (v === 1) throw new Error("m2")
        return v
      })
      createRenderEffect(() => {
        seen.push(t() + m2())
      })
      createEffect(() => {
        if (t() === 1) setA(2) // the cascade that repairs m2's input
      })
    })
    expect(seen).toEqual([2])
    expect(() =>
      batch(() => {
        setA(1) // m2 will throw on the reader's first run
        setT(1) // the reader is DIRTY; then the user effect cascades a = 2
      }),
    ).toThrow(/^m2$/) // one error for the one failure
    expect(seen).toEqual([2, 3]) // before the fix: [2] — the cached error was rethrown, the reader stranded
  })
})

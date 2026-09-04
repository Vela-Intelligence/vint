/**
 * Regressions from docs/assessment-2026-09.md §6, one per finding, written
 * BEFORE the fixes (Phase 1 of the rebuild). A case starts as `test.fails`
 * (vitest passes it only while it throws) and is promoted to a plain `test`
 * the moment its fix lands — the suite can never silently forget a finding.
 * Reactive findings were promoted in Phase 2; DOM findings in Phase 3. Each
 * name cites the finding and clause.
 */
import {
  createEffect,
  createMemo,
  createRoot,
  createSignal,
  For,
  mount,
  on,
  onCleanup,
  Show,
  tags,
} from "../src/index"
import { __observerCount } from "../src/reactive"

const { div, ul, li, a, input } = tags

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

describe("H — reactive core", () => {
  test("H1/R8 E-LOOP through a memo resumes on the next dependency write", () => {
    const [x, setX] = createSignal(0)
    let runs = 0
    expect(() =>
      createRoot(() => {
        const m = createMemo(() => x())
        createEffect(() => {
          runs++
          if (m() < 5000) setX(m() + 1)
        })
      }),
    ).toThrow(/E-LOOP/)
    const after = runs
    setX(9999)
    expect(runs).toBe(after + 1)
  })

  test("H2/R10 a memo error behind an intermediate memo re-notifies the effect", () => {
    const [s, setS] = createSignal(1)
    const seen: number[] = []
    createRoot(() => {
      const a = createMemo(() => {
        const v = s()
        if (v === 2) throw new Error("a boom")
        return v * 10
      })
      const m = createMemo(() => a() + 1)
      createEffect(() => {
        seen.push(m())
      })
    })
    expect(() => setS(2)).toThrow("a boom")
    setS(3)
    expect(seen).toEqual([11, 31])
  })

  test("H2b/R10 the same through a diamond", () => {
    const [s, setS] = createSignal(1)
    const seen: number[] = []
    createRoot(() => {
      const a = createMemo(() => {
        const v = s()
        if (v === 2) throw new Error("a boom")
        return v
      })
      const b = createMemo(() => s() * 100)
      const m = createMemo(() => a() + b())
      createEffect(() => {
        seen.push(m())
      })
    })
    expect(() => setS(2)).toThrow("a boom")
    setS(3)
    expect(seen).toEqual([101, 303])
  })
})

describe("M — reactive core", () => {
  test("M2/O5 a throwing onCleanup does not abort disposal of siblings", () => {
    const [x, setX] = createSignal(0)
    let runsA = 0
    let dispose!: () => void
    createRoot((d) => {
      dispose = d
      createEffect(() => {
        x()
        runsA++
      })
      createEffect(() => {
        x()
        onCleanup(() => {
          throw new Error("cleanup boom")
        })
      })
    })
    expect(() => dispose()).toThrow("cleanup boom")
    setX(1)
    expect(runsA).toBe(1)
    expect(__observerCount(x)).toBe(0)
  })

  test("M2b/O2 an effect whose cleanup throws on re-run still re-runs afterwards", () => {
    const [x, setX] = createSignal(0)
    let runs = 0
    let boom = true
    createRoot(() => {
      createEffect(() => {
        x()
        runs++
        onCleanup(() => {
          if (boom) {
            boom = false
            throw new Error("c")
          }
        })
      })
    })
    expect(() => setX(1)).toThrow("c")
    setX(2)
    expect(runs).toBe(3)
  })

  test("M3/R7 an effect created in a memo body runs after the memo returns (top-level pull)", () => {
    const [s, setS] = createSignal(0)
    const log: string[] = []
    let m!: () => number
    createRoot(() => {
      m = createMemo(() => {
        const v = s()
        createEffect(() => {
          log.push(`effect${v}`)
        })
        log.push(`memo-end${v}`)
        return v
      })
    })
    log.length = 0
    setS(1)
    m()
    expect(log).toEqual(["memo-end1", "effect1"])
  })

  test("M4/R11 on(..., { defer: true }) returns prevValue on the deferred run", () => {
    const [dep, setDep] = createSignal(1)
    let m!: () => number | undefined
    const seen: unknown[] = []
    createRoot(() => {
      m = createMemo<number | undefined>(
        on(dep, (v) => v * 10, { defer: true }),
        42,
      )
      createEffect(
        on(
          dep,
          (v, p, pv) => {
            seen.push([v, p, pv])
            return 99
          },
          { defer: true },
        ),
        99,
      )
    })
    expect(m()).toBe(42)
    setDep(2)
    expect(seen).toEqual([[2, undefined, 99]])
  })
})

describe("L — reactive core", () => {
  test("L1/R5 the first memo compute assigns unconditionally under a custom equals", () => {
    let m!: () => { id: number; x: number }
    createRoot(() => {
      m = createMemo(() => ({ id: 1, x: 5 }), { id: 1, x: 0 }, { equals: (p, n) => p.id === n.id })
    })
    expect(m().x).toBe(5)
  })

  test("L2/O5 a computation created under a disposed owner never runs", () => {
    const [x, setX] = createSignal(0)
    const [y, setY] = createSignal(0)
    let inner = 0
    let dispose!: () => void
    createRoot((d) => {
      dispose = d
      createEffect(() => {
        if (x() === 1) dispose()
        createEffect(() => {
          y()
          inner++
        })
      })
    })
    expect(() => setX(1)).toThrow(/E-DISPOSED-OWNER/)
    const after = inner
    setY(1)
    expect(inner).toBe(after)
    expect(__observerCount(y)).toBe(0)
  })

  test("L3/R10 a memo throw is reported once, not as a duplicate AggregateError", () => {
    const [s, setS] = createSignal(1)
    createRoot(() => {
      const n = createMemo(() => s() * 10)
      const m = createMemo(() => {
        const v = n()
        if (v === 20) throw new Error("boom")
        return v
      })
      createEffect(() => {
        m()
      })
    })
    let caught: unknown
    try {
      setS(2)
    } catch (e) {
      caught = e
    }
    expect(caught).toBeInstanceOf(Error)
    expect(caught).not.toBeInstanceOf(AggregateError)
  })

  // L4 needed no code change: R10 was amended to state this behaviour, and the
  // current code already conforms — so this one is a plain test, not test.fails.
  test("L4/R10 a top-level memo read surfaces a re-activated effect's throw, then yields the value", () => {
    const [s, setS] = createSignal(1)
    let broken = true
    let m!: () => number
    createRoot(() => {
      m = createMemo(() => {
        const v = s()
        if (broken && v === 2) throw new Error("memo boom")
        return v * 10
      })
      createEffect(() => {
        if (m() === 20) throw new Error("effect boom")
      })
    })
    expect(() => setS(2)).toThrow("memo boom")
    broken = false
    // R10 (amended): the read runs the stranded effect; its error surfaces from
    // the read, and the value is available on the NEXT read
    expect(() => m()).toThrow("effect boom")
    expect(m()).toBe(20)
  })
})

describe("H/M/L — DOM and control flow", () => {
  test.fails("H3/C2 a For fallback containing a Show is removed when rows appear", () => {
    const host = div()
    const [items, setItems] = createSignal<string[]>([])
    const [loading] = createSignal(false)
    mount(host, () =>
      ul(
        For({
          each: items,
          fallback: () =>
            Show({ when: loading, children: () => li("spinner"), fallback: () => li("nothing") }),
          children: (i) => li(() => i()),
        }),
      ),
    )
    setItems(["a"])
    expect(host.textContent).toBe("a")
  })

  test.fails("H3b/D9 the orphaned fallback would also survive mount's disposer", () => {
    const host = div()
    const [items, setItems] = createSignal<string[]>([])
    const dispose = mount(host, () =>
      For({ each: items, fallback: () => () => "none", children: (i) => li(() => i()) }),
    )
    setItems(["a"])
    setItems([])
    setItems(["b"])
    dispose()
    expect(host.innerHTML).toBe("")
  })

  test.fails("H4/D8 a case-variant on* key with a string value is skipped, never an attribute", () => {
    for (const key of ["OnClick", "ONCLICK", "Onclick"]) {
      const warned = captureWarnings(() => {
        const el = div({ [key]: "globalThis.__pwned=1" })
        expect(el.getAttributeNames()).not.toContain("onclick")
      })
      expect(warned.some((w) => w.startsWith("E-EVENT-VALUE"))).toBe(true)
    }
  })

  test.fails("H4b/D8 attr:onclick is skipped with E-EVENT-ATTR", () => {
    const warned = captureWarnings(() => {
      const el = div({ "attr:onclick": "alert(1)" })
      expect(el.getAttributeNames()).not.toContain("onclick")
    })
    expect(warned.some((w) => w.startsWith("E-EVENT-ATTR"))).toBe(true)
  })

  test.fails("M1/D9 a view that throws leaves nothing subscribed and nothing appended", () => {
    const host = div()
    const [n] = createSignal(0)
    expect(() =>
      mount(host, () =>
        div(
          {
            id: () => {
              n()
              throw new Error("prop boom")
            },
          },
          tags.span(() => String(n())),
        ),
      ),
    ).toThrow("prop boom")
    expect(__observerCount(n)).toBe(0)
    expect(host.childNodes.length).toBe(0)
  })

  test.fails("M5/D6 undefined on the property path clears the property and removes the attribute", () => {
    const el = div({ id: undefined, title: null })
    expect(el.hasAttribute("id")).toBe(false)
    expect(el.hasAttribute("title")).toBe(false)
    const [user, setUser] = createSignal<{ name: string } | null>({ name: "x" })
    let link!: HTMLAnchorElement
    createRoot(() => {
      link = a({ title: () => user()?.name }) as HTMLAnchorElement
    })
    setUser(null)
    expect(link.getAttribute("title")).toBeNull()
    expect(input({ value: undefined }).value).toBe("")
  })

  test.fails("L6/D7 the first object-valued style run keeps inline styles set in the body", () => {
    const host = div()
    const [c] = createSignal("red")
    mount(host, () => {
      const el = div({ style: () => ({ color: c() }) }) as HTMLElement
      el.style.width = "100px"
      return el
    })
    expect((host.firstChild as HTMLElement).style.width).toBe("100px")
  })

  test.fails("L7/C2 E-FOR-SAMEREF does not fire when each() re-runs on an unrelated dependency", () => {
    const list = [{ id: 1 }, { id: 2 }]
    const [tick, setTick] = createSignal(0)
    createRoot(() => {
      ul(
        For({
          each: () => {
            tick()
            return list
          },
          key: (t) => t.id,
          children: (it) => li(String(it().id)),
        }),
      )
    })
    const warned = captureWarnings(() => setTick(1))
    expect(warned.some((w) => w.startsWith("E-FOR-SAMEREF"))).toBe(false)
  })

  test.fails("L8/D2 a fragment created outside a binding survives the binding's second run", () => {
    const host = div()
    const [items] = createSignal(["a"])
    const [theme, setTheme] = createSignal("light")
    const list = For({ each: items, children: (i) => li(() => i()) })
    mount(host, () => ul(() => [li({ class: theme() }), list]))
    setTheme("dark")
    expect(host.textContent).toBe("a")
  })

  test.fails("L11/D10 the URL check sees non-string values and xlink:href", () => {
    const warned = captureWarnings(() => {
      a({ href: new URL("javascript:alert(1)") })
      a({ href: { toString: () => "javascript:alert(1)" } })
      tags.a({ "xlink:href": "javascript:alert(1)" })
    })
    expect(warned.filter((w) => w.startsWith("E-URL-SCHEME")).length).toBe(3)
  })

  test.fails("L12/D1 an invalid tag name is E-TAG-NAME, never a raw DOMException", () => {
    expect(() => tags["<img onerror=alert(1)>"]("x")).toThrow(/E-TAG-NAME/)
    expect(() => tags[""]("x")).toThrow(/E-TAG-NAME/)
  })

  test.fails("L12b/D6 prop: on a getter-only property warns E-READONLY-PROP instead of throwing", () => {
    const warned = captureWarnings(() => {
      div({ "prop:tagName": "x" })
    })
    expect(warned.some((w) => w.startsWith("E-READONLY-PROP"))).toBe(true)
  })
})

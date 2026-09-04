/**
 * Regressions from docs/assessment-2026-09.md §6, one per finding, written
 * BEFORE the fixes (Phase 1 of the rebuild). A case starts as `test.fails`
 * (vitest passes it only while it throws) and is promoted to a plain `test`
 * the moment its fix lands — the suite can never silently forget a finding.
 * Reactive findings were promoted in Phase 2; DOM findings in Phase 3. Each
 * name cites the finding and clause.
 */
import {
  batch,
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
  untrack,
} from "../src/index"
import { __observerCount } from "../src/reactive"

// data-shaped tag names must be rejected at runtime; the typed `tags` rejects them at compile time already
const anyTag = tags as unknown as Record<string, (...args: unknown[]) => Element>

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
  test("H3/C2 a For fallback containing a Show is removed when rows appear", () => {
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

  test("H3b/D9 the orphaned fallback would also survive mount's disposer", () => {
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

  test("H4/D8 a case-variant on* key with a string value is skipped, never an attribute", () => {
    for (const key of ["OnClick", "ONCLICK", "Onclick"]) {
      const warned = captureWarnings(() => {
        const el = div({ [key]: "globalThis.__pwned=1" } as never)
        expect(el.getAttributeNames()).not.toContain("onclick")
      })
      expect(warned.some((w) => w.startsWith("E-EVENT-VALUE"))).toBe(true)
    }
  })

  test("H4b/D8 attr:onclick is skipped with E-EVENT-ATTR", () => {
    const warned = captureWarnings(() => {
      const el = div({ "attr:onclick": "alert(1)" })
      expect(el.getAttributeNames()).not.toContain("onclick")
    })
    expect(warned.some((w) => w.startsWith("E-EVENT-ATTR"))).toBe(true)
  })

  test("M1/D9 a view that throws leaves nothing subscribed and nothing appended", () => {
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

  test("M5/D6 undefined on the property path clears the property and removes the attribute", () => {
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

  test("L6/D7 the first object-valued style run keeps inline styles set in the body", () => {
    const host = div()
    const [c] = createSignal("red")
    mount(host, () => {
      const el = div({ style: () => ({ color: c() }) }) as HTMLElement
      el.style.width = "100px"
      return el
    })
    expect((host.firstChild as HTMLElement).style.width).toBe("100px")
  })

  test("L7/C2 E-FOR-SAMEREF does not fire when each() re-runs on an unrelated dependency", () => {
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

  test("L8/D2 a fragment created outside a binding survives the binding's second run", () => {
    const host = div()
    const [items] = createSignal(["a"])
    const [theme, setTheme] = createSignal("light")
    const list = For({ each: items, children: (i) => li(() => i()) })
    mount(host, () => ul(() => [li({ class: theme() }), list]))
    setTheme("dark")
    expect(host.textContent).toBe("a")
  })

  test("L11/D10 the URL check sees non-string values and xlink:href", () => {
    const warned = captureWarnings(() => {
      a({ href: new URL("javascript:alert(1)") } as never)
      a({ href: { toString: () => "javascript:alert(1)" } } as never)
      tags.a({ "xlink:href": "javascript:alert(1)" } as never)
    })
    expect(warned.filter((w) => w.startsWith("E-URL-SCHEME")).length).toBe(3)
  })

  test("L12/D1 an invalid tag name is E-TAG-NAME, never a raw DOMException", () => {
    expect(() => anyTag["<img onerror=alert(1)>"]!("x")).toThrow(/E-TAG-NAME/)
    expect(() => anyTag[""]!("x")).toThrow(/E-TAG-NAME/)
  })

  test("L12b/D6 prop: on a getter-only property warns E-READONLY-PROP instead of throwing", () => {
    const warned = captureWarnings(() => {
      div({ "prop:tagName": "x" })
    })
    expect(warned.some((w) => w.startsWith("E-READONLY-PROP"))).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Re-assessment after the rebuild (v0.8.0): findings of the second
// adversarial pass over the REBUILT code. Same rule — one plain test per fix.
// ---------------------------------------------------------------------------

describe("re-assessment — reactive core", () => {
  test("RA1/R10 a memo throw plus a same-flush cascade write does not strand the observer", () => {
    const [s, setS] = createSignal(0)
    const seen: number[] = []
    createRoot(() => {
      const m = createMemo(() => {
        const v = s()
        if (v === 1) throw new Error("m@1")
        return v
      })
      createEffect(() => {
        seen.push(m())
      })
      createEffect(() => {
        if (s() === 1) setS(2)
      })
    })
    expect(() => setS(1)).toThrow("m@1")
    // the cascade's write marked the effect again in the same flush, so it
    // ran again and saw 2 (R10: a new mark is a new run, never a strand)
    setS(3)
    expect(seen).toEqual([0, 2, 3])
  })

  test("RA2/R10 an effect-body throw plus a same-flush cascade write does not strand it", () => {
    const [s, setS] = createSignal(0)
    const seen: number[] = []
    createRoot(() => {
      const m = createMemo(() => s())
      createEffect(() => {
        const v = m()
        seen.push(v)
        if (v === 1) throw new Error("e@1")
      })
      createEffect(() => {
        if (s() === 1) setS(2)
      })
    })
    expect(() => setS(1)).toThrow("e@1")
    setS(3)
    expect(seen).toEqual([0, 1, 2, 3]) // re-ran on the cascade's mark, then on the write
  })

  test("RA3/R10 a memo whose recompute throws while reading another memo keeps the edge to it", () => {
    const [s, setS] = createSignal(0)
    const [t, setT] = createSignal(0)
    const seen: number[] = []
    createRoot(() => {
      const m1 = createMemo(() => {
        const v = s()
        if (v === 1) throw new Error("m1@1")
        return v
      })
      const m2 = createMemo(() => m1() + t())
      createEffect(() => {
        seen.push(m2())
      })
    })
    expect(() =>
      batch(() => {
        setS(1)
        setT(1)
      }),
    ).toThrow("m1@1")
    setS(2)
    expect(seen).toEqual([0, 3])
    setT(2)
    expect(seen).toEqual([0, 3, 4])
  })

  test("RA4/R10 a memo's cached error is not rethrown after its dependency changed in the same flush", () => {
    const [s, setS] = createSignal(0)
    const [u, setU] = createSignal(0)
    let observed: unknown = null
    createRoot(() => {
      const m = createMemo(() => {
        const v = s()
        if (v === 1) throw new Error("m@1")
        return v
      })
      createEffect(() => {
        if (s() === 1) {
          setS(2)
          setU(1)
        }
      })
      createEffect(() => {
        if (u() === 1) {
          try {
            observed = untrack(m)
          } catch (e) {
            observed = e
          }
        }
      })
    })
    setS(1)
    expect(observed).toBe(2)
  })

  test("RA5/R8 a memo whose cleanup throws and whose value changes leaves its observer re-queueable", () => {
    const [s, setS] = createSignal(0)
    const seen: number[] = []
    let boom = false
    createRoot(() => {
      const m = createMemo(() => {
        const v = s()
        onCleanup(() => {
          if (boom) {
            boom = false
            throw new Error("cleanup")
          }
        })
        return v
      })
      createEffect(() => {
        seen.push(m())
      })
    })
    boom = true
    expect(() => setS(1)).toThrow("cleanup")
    setS(2)
    expect(seen[seen.length - 1]).toBe(2)
  })

  test("RA6/R10 an upstream throw strands the effect's OTHER pending memos too, so a write to them recovers it", () => {
    const [s, setS] = createSignal(0)
    const [t, setT] = createSignal(0)
    const seen: string[] = []
    createRoot(() => {
      const a = createMemo(() => {
        const v = s()
        if (v === 1) throw new Error("A@1")
        return `a${v}`
      })
      const b = createMemo(() => `b${t()}`)
      createEffect(() => {
        seen.push(a() + b())
      })
    })
    expect(() =>
      batch(() => {
        setS(1)
        setT(1)
      }),
    ).toThrow("A@1")
    // t changed, but a still throws: the write must reach the effect and re-surface a's error
    expect(() => setT(2)).toThrow("A@1")
    setS(2)
    expect(seen[seen.length - 1]).toBe("a2b2")
  })

  test("RA7/O5 a cleanup that disposes the node stops its body from running", () => {
    const [s, setS] = createSignal(0)
    let runs = 0
    let dispose!: () => void
    createRoot((d) => {
      dispose = d
      createEffect(() => {
        s()
        runs++
        onCleanup(() => dispose())
      })
    })
    setS(1)
    expect(runs).toBe(1)
    expect(__observerCount(s)).toBe(0)
  })

  test("RA8/§E E-WRITE-IN-MEMO is not bypassed by untrack()", () => {
    const [s, setS] = createSignal(0)
    expect(() =>
      createRoot(() => {
        createMemo(() => {
          untrack(() => setS(s() + 1))
          return s()
        })
      }),
    ).toThrow(/E-WRITE-IN-MEMO/)
  })
})

describe("re-assessment — DOM and control flow", () => {
  test("RB1/C2+O5 a row builder that throws leaves no partial scope subscribed", () => {
    const [items, setItems] = createSignal([1, 3])
    const [text] = createSignal("x")
    const host = div()
    mount(host, () =>
      ul(
        For({
          each: items,
          children: (it) => {
            const node = li(() => `${it()}${text()}`)
            if (it() === 2) throw new Error("row 2")
            return node
          },
        }),
      ),
    )
    const base = __observerCount(text)
    expect(() => setItems([1, 3, 2, 4])).toThrow("row 2")
    setItems([1, 3, 4])
    expect(__observerCount(text)).toBe(base + 1)
  })

  test("RB2/D6 nullish on a number-typed property removes the attribute instead of coercing to 0", () => {
    const [lim, setLim] = createSignal<number | null>(5)
    let el!: HTMLInputElement
    createRoot(() => {
      el = input({ maxLength: lim, tabIndex: lim }) as HTMLInputElement
    })
    expect(el.getAttribute("maxlength")).toBe("5")
    setLim(null)
    expect(el.hasAttribute("maxlength")).toBe(false)
    expect(el.hasAttribute("tabindex")).toBe(false)
  })

  test("RB3/D8 attr:onclick with a FUNCTION is skipped without ever being called", () => {
    let called = 0
    const warned = captureWarnings(() => {
      div({
        "attr:onclick": () => {
          called++
        },
      } as never)
    })
    expect(called).toBe(0)
    expect(warned.some((w) => w.startsWith("E-EVENT-ATTR"))).toBe(true)
  })

  test("RB4/D2 a re-expanded fragment must reach its recorded last node, or expands to nothing", () => {
    const host = div()
    const [tick, setTick] = createSignal(0)
    const frag = document.createDocumentFragment()
    const a1 = tags.span("a")
    const b1 = tags.span("b")
    frag.append(a1, b1)
    mount(host, () =>
      div(() => {
        tick()
        return frag
      }, tags.span("X")),
    )
    // the user swaps a and b in place: the walk from `first` no longer reaches `last`
    ;(a1.parentNode as Node).insertBefore(b1, a1)
    setTick(1)
    expect(host.textContent).toBe("X")
  })

  test("RB5/D8 a nullish event handler is an ordinary 'no handler', not E-EVENT-VALUE", () => {
    const warned = captureWarnings(() => {
      div({ onclick: null, onkeydown: undefined })
    })
    expect(warned.some((w) => w.startsWith("E-EVENT-VALUE"))).toBe(false)
  })

  test("RB6/D1 a data object with a numeric nodeType is props, not a node to append", () => {
    const el = div({ nodeType: 1, id: "x" } as never)
    expect(el.id).toBe("x")
  })

  test("RB7/D6 false on a string-typed property clears it instead of writing 'false'", () => {
    const [on, setOn] = createSignal(true)
    let link!: HTMLAnchorElement
    createRoot(() => {
      link = a({ href: () => on() && "/x" } as never) as HTMLAnchorElement
    })
    expect(link.getAttribute("href")).toBe("/x")
    setOn(false)
    expect(link.hasAttribute("href")).toBe(false)
  })
})

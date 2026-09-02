// Contract group E — DOM bindings (D1–D9)
import { beforeEach, describe, expect, test, vi } from "vitest"
import type { Child } from "../src/index"
import { createSignal, For, mount, tags, tagsNS } from "../src/index"

let host: HTMLDivElement
beforeEach(() => {
  document.body.innerHTML = ""
  host = document.createElement("div")
  document.body.append(host)
})

describe("dom", () => {
  test("E30/D2 function child renders and live-updates text in place", () => {
    const [n, setN] = createSignal(1)
    mount(host, () => tags.p("count: ", n))
    const p = host.querySelector("p")!
    expect(p.textContent).toBe("count: 1")
    const textNode = p.lastChild
    setN(2)
    expect(p.textContent).toBe("count: 2")
    expect(p.lastChild).toBe(textNode) // D5: text updated in place
  })

  test("E31/D3 REGRESSION(vanjs-trap): null-first child recovers, in correct position", () => {
    const [show, setShow] = createSignal(false)
    mount(host, () => tags.div(tags.span("a"), () => (show() ? tags.b("x") : null), tags.span("z")))
    const div = host.querySelector("div")!
    expect([...div.children].map((c) => c.tagName)).toEqual(["SPAN", "SPAN"])
    setShow(true)
    expect([...div.children].map((c) => c.tagName)).toEqual(["SPAN", "B", "SPAN"])
    setShow(false)
    expect([...div.children].map((c) => c.tagName)).toEqual(["SPAN", "SPAN"])
    setShow(true)
    expect([...div.children].map((c) => c.tagName)).toEqual(["SPAN", "B", "SPAN"])
  })

  test("E32/D4 array from a reactive child stays live", () => {
    const [items, setItems] = createSignal(["a", "b"])
    mount(host, () => tags.ul(() => items().map((s) => tags.li(s))))
    expect(host.querySelectorAll("li")).toHaveLength(2)
    setItems(["a", "b", "c"])
    expect(host.querySelectorAll("li")).toHaveLength(3)
    expect(host.querySelector("ul")!.textContent).toBe("abc")
    setItems([])
    expect(host.querySelectorAll("li")).toHaveLength(0)
    setItems(["z"])
    expect(host.querySelector("ul")!.textContent).toBe("z")
  })

  test("E33/D2 nested arrays flatten; null/boolean children render nothing", () => {
    mount(host, () => tags.div(["a", null, ["b", false, 1, undefined, true]]))
    expect(host.querySelector("div")!.textContent).toBe("ab1")
  })

  test("E34/D6 settable property wins; attr fallback; prop:/attr: force routing", () => {
    const input = tags.input({ value: "hi", "data-x": "1" }) as HTMLInputElement
    expect(input.value).toBe("hi")
    expect(input.getAttribute("data-x")).toBe("1")

    class VintTestEl extends HTMLElement {
      inner = ""
      set label(v: string) {
        this.inner = v
      }
      get label() {
        return this.inner
      }
    }
    if (!customElements.get("vint-test-el")) customElements.define("vint-test-el", VintTestEl)
    const el = tags["vint-test-el"]({ label: "yo" }) as VintTestEl
    expect(el.inner).toBe("yo")
    expect(el.hasAttribute("label")).toBe(false)

    const forced = tags.div({ "attr:title": "t" })
    expect(forced.getAttribute("title")).toBe("t")

    const btn = tags.button({ disabled: true }) as HTMLButtonElement
    expect(btn.disabled).toBe(true)
  })

  test("E35/D7 reactive class and style props", () => {
    const [active, setActive] = createSignal(false)
    mount(host, () =>
      tags.div({
        id: "t",
        class: () => (active() ? "on" : "off"),
        style: () => ({ color: active() ? "red" : "blue" }),
      }),
    )
    const div = host.querySelector<HTMLDivElement>("#t")!
    expect(div.getAttribute("class")).toBe("off")
    expect(div.style.color).toBe("blue")
    setActive(true)
    expect(div.getAttribute("class")).toBe("on")
    expect(div.style.color).toBe("red")
  })

  test("E36/D5 identity fast-path: unchanged node is not detached (focus survives)", () => {
    const [tick, setTick] = createSignal(0)
    const input = tags.input() as HTMLInputElement
    mount(host, () =>
      tags.div(() => {
        tick()
        return input
      }),
    )
    input.focus()
    expect(document.activeElement).toBe(input)
    setTick(1)
    expect(document.activeElement).toBe(input)
    expect(host.contains(input)).toBe(true)
  })

  test("E37/D9 mount dispose removes DOM and detaches all bindings", () => {
    const [n, setN] = createSignal(0)
    let runs = 0
    const dispose = mount(host, () =>
      tags.p(() => {
        runs++
        return n()
      }),
    )
    expect(host.querySelector("p")).not.toBeNull()
    expect(runs).toBe(1)
    dispose()
    expect(host.querySelector("p")).toBeNull()
    expect(host.childNodes.length).toBe(0)
    setN(1)
    expect(runs).toBe(1)
  })

  test("E34b/D8 events attach once, not reactive", () => {
    let clicks = 0
    const btn = tags.button({ onclick: () => clicks++ }, "go") as HTMLButtonElement
    document.body.append(btn)
    btn.click()
    btn.click()
    expect(clicks).toBe(2)
  })

  test("E38/D3 REGRESSION: nodes a nested For inserts into a binding's range are not orphaned", () => {
    const [list, setList] = createSignal([1])
    const [flag, setFlag] = createSignal(true)
    mount(host, () => {
      const frag = For({ each: list, children: (item) => tags.span(() => String(item())) })
      return tags.div(() => (flag() ? frag : "off"))
    })
    const div = host.querySelector("div")!
    expect(div.textContent).toBe("1")
    setList([1, 2]) // row 2's nodes are inserted AFTER the binding's run
    expect(div.textContent).toBe("12")
    setFlag(false) // the binding must remove the late-inserted row too
    expect(div.textContent).toBe("off")
    expect(div.querySelectorAll("span")).toHaveLength(0)
  })

  test("E39/D5 a user-created Text node is replaced, never mutated in place", () => {
    const mine = document.createTextNode("mine")
    const [v, setV] = createSignal<Child>(mine)
    mount(host, () => tags.p(() => v()))
    expect(host.querySelector("p")!.textContent).toBe("mine")
    setV("replaced")
    expect(host.querySelector("p")!.textContent).toBe("replaced")
    expect(mine.data).toBe("mine") // the user's node was not hijacked
  })

  test("E40/D3 binding whose markers left the DOM warns E-BIND-DETACHED", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    try {
      const [n, setN] = createSignal(0)
      mount(host, () => tags.div(() => n()))
      host.querySelector("div")!.replaceChildren() // external code wipes the markers
      setN(1)
      expect(warn.mock.calls.some((c) => String(c[0]).includes("E-BIND-DETACHED"))).toBe(true)
    } finally {
      warn.mockRestore()
    }
  })

  test("E41/D8 prop:-prefixed function is assigned as-is, not treated as a binding", () => {
    const handler = () => "called"
    const el = tags.div({ "prop:myFn": handler }) as HTMLDivElement & { myFn: unknown }
    expect(el.myFn).toBe(handler)
  })

  test("E43/D7 argument-taking function under a plain prop key warns E-CALLBACK-PROP", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    try {
      // a Lit-style callback property written without prop: — the classic seam
      mount(host, () => tags.div({ formatter: (x: number) => `#${x}` }))
      expect(warn.mock.calls.some((c) => String(c[0]).includes("E-CALLBACK-PROP"))).toBe(true)

      warn.mockClear()
      // zero-arg thunks are legitimate reactive bindings — no warning
      const [n] = createSignal(0)
      mount(host, () => tags.div({ class: () => (n() ? "on" : "off") }))
      expect(warn.mock.calls.some((c) => String(c[0]).includes("E-CALLBACK-PROP"))).toBe(false)

      warn.mockClear()
      // event handlers take arguments by design — no warning
      mount(host, () => tags.button({ onclick: (e: Event) => e.preventDefault() }, "go"))
      expect(warn.mock.calls.some((c) => String(c[0]).includes("E-CALLBACK-PROP"))).toBe(false)
    } finally {
      warn.mockRestore()
    }
  })

  test("E42/D7 reactive style objects are diffed: external styles survive, stale keys removed", () => {
    const [obj, setObj] = createSignal<Record<string, string>>({ color: "red", fontSize: "10px" })
    mount(host, () => tags.div({ id: "s", style: () => obj() }))
    const div = host.querySelector<HTMLDivElement>("#s")!
    expect(div.style.color).toBe("red")
    expect(div.style.fontSize).toBe("10px")
    div.style.setProperty("width", "100px") // set outside the binding
    setObj({ color: "blue" })
    expect(div.style.color).toBe("blue")
    expect(div.style.width).toBe("100px") // survived the re-run
    expect(div.style.fontSize).toBe("") // stale key removed
  })

  test("E30b/D1 tagsNS creates namespaced elements", () => {
    const svg = tagsNS("http://www.w3.org/2000/svg")
    const circle = svg.circle({ "attr:r": "5" })
    expect(circle.namespaceURI).toBe("http://www.w3.org/2000/svg")
    expect(circle.getAttribute("r")).toBe("5")
  })
})

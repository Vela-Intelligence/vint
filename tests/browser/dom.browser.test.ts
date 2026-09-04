/**
 * Browser-only checks (vitest browser mode, real DOM). Everything here is
 * something happy-dom does not model, so the unit suite cannot prove it.
 * Clause numbers refer to docs/contract.md.
 */
import { createRoot, createSignal, For, mount, tags, tagsNS } from "../../src/index"

// data-shaped tag names must be rejected at runtime; the typed `tags` rejects them at compile time already
const anyTag = tags as unknown as Record<string, (...args: unknown[]) => Element>

const { div, ul, li, input, a, span } = tags

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

describe("browser: For and focus (C2, D5)", () => {
  test("focus and selection survive in a row that keeps its relative position", () => {
    const host = div()
    document.body.appendChild(host)
    const [rows, setRows] = createSignal([1, 2, 3, 4])
    const dispose = mount(host, () =>
      ul(For({ each: rows, children: (r) => li(input({ "data-id": () => String(r()) })) })),
    )
    const second = host.querySelector('input[data-id="2"]') as HTMLInputElement
    second.value = "typed"
    second.focus()
    second.setSelectionRange(1, 3)
    expect(document.activeElement).toBe(second)
    // move the FIRST row to the end: rows 2,3,4 keep their relative order
    setRows([2, 3, 4, 1])
    expect(document.activeElement).toBe(second)
    expect(second.selectionStart).toBe(1)
    expect(second.selectionEnd).toBe(3)
    expect([...host.querySelectorAll("input")].map((i) => i.dataset.id)).toEqual(["2", "3", "4", "1"])
    dispose()
    host.remove()
  })

  test("a moved row is re-inserted and loses focus (documented cost of a move)", () => {
    const host = div()
    document.body.appendChild(host)
    const [rows, setRows] = createSignal([1, 2, 3])
    const dispose = mount(host, () =>
      ul(For({ each: rows, children: (r) => li(input({ "data-id": () => String(r()) })) })),
    )
    const first = host.querySelector('input[data-id="1"]') as HTMLInputElement
    first.focus()
    setRows([2, 3, 1])
    expect(document.activeElement).not.toBe(first)
    dispose()
    host.remove()
  })
})

describe("browser: props (D6, D7, L18)", () => {
  test("an input value binding re-run with an equal value keeps the caret", () => {
    const host = div()
    document.body.appendChild(host)
    const [v] = createSignal("hello")
    const [tick, setTick] = createSignal(0)
    let el!: HTMLInputElement
    const dispose = mount(host, () => {
      el = input({
        value: () => {
          tick()
          return v()
        },
      }) as HTMLInputElement
      return el
    })
    el.focus()
    el.setSelectionRange(2, 2)
    setTick(1)
    expect(el.selectionStart).toBe(2)
    dispose()
    host.remove()
  })

  test("a style object diff leaves an unrelated inline property and a transition in place", () => {
    const host = div()
    document.body.appendChild(host)
    const [c, setC] = createSignal("rgb(255, 0, 0)")
    let el!: HTMLElement
    const dispose = mount(host, () => {
      el = div({ style: () => ({ color: c(), transition: "color 1s" }) }) as HTMLElement
      return el
    })
    el.style.width = "100px"
    setC("rgb(0, 0, 255)")
    expect(el.style.width).toBe("100px")
    expect(el.style.transition).toBe("color 1s")
    expect(getComputedStyle(el).color).toBe("rgb(0, 0, 255)")
    dispose()
    host.remove()
  })

  test("SVG via tagsNS: class, viewBox and href land as attributes", () => {
    const svg = tagsNS("http://www.w3.org/2000/svg")
    const el = svg.svg(
      { viewBox: "0 0 10 10", class: "chart" },
      svg.use({ href: "#x" }),
    ) as SVGSVGElement
    expect(el.getAttribute("viewBox")).toBe("0 0 10 10")
    expect(el.getAttribute("class")).toBe("chart")
    expect(el.querySelector("use")?.getAttribute("href")).toBe("#x")
    expect(el.namespaceURI).toBe("http://www.w3.org/2000/svg")
  })
})

describe("browser: untrusted data (D10)", () => {
  test("the children path never executes script", async () => {
    const host = div()
    document.body.appendChild(host)
    ;(globalThis as { __xss?: number }).__xss = 0
    mount(host, () =>
      div('<img src=x onerror="globalThis.__xss=1">', span("<script>globalThis.__xss=2</script>")),
    )
    await new Promise((r) => setTimeout(r, 20))
    expect((globalThis as { __xss?: number }).__xss).toBe(0)
    expect(host.querySelector("img")).toBeNull()
    host.remove()
  })

  test("a javascript: href warns E-URL-SCHEME and is visible as such on the element", () => {
    let el!: HTMLAnchorElement
    const warned = captureWarnings(() => {
      el = a({ href: "javascript:alert(1)" }, "x") as HTMLAnchorElement
    })
    expect(warned.some((w) => w.startsWith("E-URL-SCHEME"))).toBe(true)
    expect(el.protocol).toBe("javascript:") // never clicked here — it would run
  })

  // L12: the platform rejects the name; vint turns that into E-TAG-NAME
  test("L12/D1 an invalid tag name is E-TAG-NAME, not a raw DOMException", () => {
    expect(() => anyTag["<img onerror=alert(1)>"]!("x")).toThrow(/E-TAG-NAME/)
  })

  test("createElement really does reject the name (what happy-dom cannot show)", () => {
    expect(() => anyTag["<img onerror=alert(1)>"]!("x")).toThrow()
  })
})

describe("browser: root body deferral (O3)", () => {
  test("bindings render only once the root body returns", () => {
    const [n] = createSignal(1)
    let el!: HTMLElement
    createRoot(() => {
      el = div(() => String(n())) as HTMLElement
      expect(el.textContent).toBe("")
    })
    expect(el.textContent).toBe("1")
  })
})

describe("browser: phase 4 deferred items (D6, D10)", () => {
  const { select, option, img } = tags

  test("RB9/D6 a static select value is applied after its options exist in a real engine", () => {
    const host = div()
    document.body.appendChild(host)
    const byValue = select(
      { value: "b" },
      option({ value: "a" }, "A"),
      option({ value: "b" }, "B"),
    ) as HTMLSelectElement
    const byIndex = select(
      { selectedIndex: 1 },
      option({ value: "a" }, "A"),
      option({ value: "b" }, "B"),
    ) as HTMLSelectElement
    host.append(byValue, byIndex)
    expect(byValue.value).toBe("b")
    expect(byValue.selectedIndex).toBe(1)
    expect(byIndex.value).toBe("b")
    expect(byIndex.selectedIndex).toBe(1)
    host.remove()
  })

  test("RB10/D10 an SVG data URL warns E-URL-SCHEME on a[href] and not on img[src]", () => {
    const svgUrl = "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg'/>"
    let link!: HTMLAnchorElement
    const onAnchor = captureWarnings(() => {
      link = a({ href: svgUrl }, "x") as HTMLAnchorElement
    })
    expect(onAnchor.some((w) => w.startsWith("E-URL-SCHEME"))).toBe(true)
    expect(link.protocol).toBe("data:") // still assigned (D10) — never clicked here
    let image!: HTMLImageElement
    const onImage = captureWarnings(() => {
      image = img({ src: svgUrl }) as HTMLImageElement
    })
    expect(onImage.some((w) => w.startsWith("E-URL-SCHEME"))).toBe(false)
    expect(image.getAttribute("src")).toBe(svgUrl)
  })

  test("RB12/D6 a leading-space attribute name is E-ATTR-NAME, not the engine's InvalidCharacterError", () => {
    // the engine really does reject it (what happy-dom cannot show)
    expect(() => document.createElement("div").setAttribute(" onclick", "x")).toThrow()
    let el!: Element
    let warned: string[] = []
    expect(() => {
      warned = captureWarnings(() => {
        el = div({ " onclick": "x" } as never)
      })
    }).not.toThrow()
    expect(warned.some((w) => w.startsWith("E-ATTR-NAME"))).toBe(true)
    expect(el.attributes).toHaveLength(0)
    expect((el as HTMLElement).onclick).toBeNull()
  })
})

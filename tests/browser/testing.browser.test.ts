/**
 * Browser-only checks for vint/testing (vitest browser mode, real DOM).
 * Everything here is platform behaviour happy-dom does not model faithfully:
 * native activation honouring `disabled`, real focus, the native value
 * setter on a select, and implicit form submission (which synthetic key
 * events must never trigger). Clause numbers refer to docs/contract.md §T.
 */
import { tags } from "../../src/index"
import * as t from "../../src/testing"

const { div, button, input, select, option, form, span } = tags

let disposers: (() => void)[] = []
beforeEach(() => {
  disposers = []
})
afterEach(() => {
  for (const d of disposers) d()
})
const render = (view: () => Element) => {
  const result = t.render(view)
  disposers.push(result.dispose)
  return result
}

describe("browser: vint/testing interactions (T3)", () => {
  test("T3 click on a disabled button does not fire its handler (native activation)", () => {
    let fired = 0
    const { container } = render(() =>
      div(
        button({ disabled: true, onclick: () => fired++ }, "off"),
        button({ onclick: () => fired++ }, "on"),
      ),
    )
    t.click(t.byText(container, "off"))
    expect(fired).toBe(0)
    t.click(t.byText(container, "on"))
    expect(fired).toBe(1)
  })

  test("T3 type focuses a real input and its value updates through the native setter", () => {
    const values: string[] = []
    const { container } = render(() =>
      div(input({ oninput: (e: Event) => values.push((e.target as HTMLInputElement).value) })),
    )
    const inp = container.querySelector("input") as HTMLInputElement
    expect(document.activeElement).not.toBe(inp)
    t.type(inp, "hi")
    expect(document.activeElement).toBe(inp)
    expect(inp.value).toBe("hi")
    expect(inp.getAttribute("value")).toBeNull() // the property, not the attribute
    expect(values).toEqual(["h", "hi"])
  })

  test("T3 setValue on a select changes selectedIndex and the handler sees the new value", () => {
    const seen: string[] = []
    const { container } = render(() =>
      div(
        select(
          { onchange: (e: Event) => seen.push((e.target as HTMLSelectElement).value) },
          option({ value: "a" }, "A"),
          option({ value: "b" }, "B"),
          option({ value: "c" }, "C"),
        ),
      ),
    )
    const sel = container.querySelector("select") as HTMLSelectElement
    expect(sel.selectedIndex).toBe(0)
    t.setValue(sel, "c")
    expect(sel.selectedIndex).toBe(2)
    expect(sel.value).toBe("c")
    expect(seen).toEqual(["c"])
  })

  test("T3 pressKey Enter inside a form runs the handler and does not submit (no navigation)", () => {
    const href = location.href
    let submitted = 0
    let enters = 0
    const { container } = render(() =>
      form(
        {
          action: "?submitted=1",
          onsubmit: (e: Event) => {
            submitted++
            e.preventDefault()
          },
        },
        input({
          onkeydown: (e: KeyboardEvent) => {
            if (e.key === "Enter") enters++
          },
        }),
        button({ type: "submit" }, "Go"),
      ),
    )
    const inp = container.querySelector("input") as HTMLInputElement
    t.pressKey(inp, "Enter")
    expect(enters).toBe(1)
    expect(submitted).toBe(0)
    expect(location.href).toBe(href)
  })
})

describe("browser: vint/testing Unicode (T4)", () => {
  test("T4 type puts CJK and an emoji family into a real input one grapheme at a time", () => {
    const values: string[] = []
    const { container } = render(() =>
      div(input({ oninput: (e: Event) => values.push((e.target as HTMLInputElement).value) })),
    )
    const inp = container.querySelector("input") as HTMLInputElement
    t.type(inp, "日本👩‍👩‍👧")
    expect(values).toEqual(["日", "日本", "日本👩‍👩‍👧"])
    expect(inp.value).toBe("日本👩‍👩‍👧")
    expect(document.activeElement).toBe(inp)
  })

  test("T4 type({ ime: true }) produces real CompositionEvents and InputEvents the platform constructs", () => {
    const seen: string[] = []
    const { container } = render(() =>
      div(
        input({
          oncompositionstart: (e: CompositionEvent) =>
            seen.push(`start:${e.data}:${e instanceof CompositionEvent}`),
          oncompositionend: (e: CompositionEvent) => seen.push(`end:${e.data}`),
          oninput: (e: Event) =>
            seen.push(`input:${(e as InputEvent).isComposing}:${(e as InputEvent).data}`),
          onchange: (e: Event) => seen.push(`change:${(e.target as HTMLInputElement).value}`),
        }),
      ),
    )
    const inp = container.querySelector("input") as HTMLInputElement
    t.type(inp, "한글", { ime: true })
    expect(seen).toEqual(["start::true", "input:true:한", "input:true:한글", "end:한글", "change:한글"])
    expect(inp.value).toBe("한글")
  })

  test("T4 byText finds decomposed text through a real browser's textContent", () => {
    const { container } = render(() =>
      div(button("café"), span(new Intl.NumberFormat("fr").format(9876))),
    )
    expect(t.byText(container, "café").tagName).toBe("BUTTON")
    expect(t.byText(container, "9 876").tagName).toBe("SPAN")
  })
})

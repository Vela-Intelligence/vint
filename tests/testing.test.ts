// Contract group T — vint/testing (T1 render/dispose, T2 settle/waitFor, T3 interactions)
import { beforeEach, describe, expect, test } from "vitest"
import type { Child } from "../src/index"
import { createResource, createSignal, For, tags } from "../src/index"
import * as t from "../src/testing"

const { div, span, p, pre, button, input, textarea, select, option, ul, li } = tags

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

// ---- three small apps, built inline; bindings live inside render(() => App()) ----

function Counter() {
  const [count, setCount] = createSignal(0)
  return div(
    button({ onclick: () => setCount((c) => c + 1) }, "+1"),
    p("count: ", () => count()),
  )
}

type Todo = { id: number; text: string }
function TodoApp() {
  const [todos, setTodos] = createSignal<Todo[]>([])
  const [draft, setDraft] = createSignal("")
  let nextId = 1
  const add = () => {
    const text = draft().trim()
    if (!text) return
    setTodos((prev) => [...prev, { id: nextId++, text }])
    setDraft("")
  }
  return div(
    input({
      value: draft,
      oninput: (e: Event) => setDraft((e.target as HTMLInputElement).value),
      onkeydown: (e: KeyboardEvent) => {
        if (e.key === "Enter") add()
      },
    }),
    button({ onclick: add }, "Add"),
    ul(For({ each: todos, key: (todo) => todo.id, children: (item) => li(() => item().text) })),
    span(() => `${todos().length} left`),
  )
}

function ResourceApp(fetch: () => Promise<string>) {
  const [data] = createResource(fetch)
  return div(() => (data.loading ? "loading" : (data() ?? "")))
}

let host: HTMLDivElement
beforeEach(() => {
  document.body.innerHTML = ""
  host = document.createElement("div")
  document.body.append(host)
})

describe("testing: T1 render/dispose", () => {
  test("T1 render appends a fresh container to document.body; dispose removes it", () => {
    const { container, dispose } = t.render(Counter)
    expect(container.parentNode).toBe(document.body)
    expect(t.text(container)).toBe("+1count: 0")
    dispose()
    expect(container.isConnected).toBe(false)
    expect(document.body.contains(container)).toBe(false)
  })

  test("T1 a supplied container is used and left in place after dispose; only its content is removed", () => {
    const { container, dispose } = t.render(Counter, { container: host })
    expect(container).toBe(host)
    expect(host.querySelector("button")).not.toBeNull()
    dispose()
    expect(host.parentNode).toBe(document.body)
    expect(host.childNodes).toHaveLength(0)
  })

  test("T1 render rejects a built element with a prescriptive message naming render(App)", () => {
    const built = div("static") as unknown as () => Child
    expect(() => t.render(built)).toThrow(/render\(App\)/)
    expect(document.body.querySelectorAll("div")).toHaveLength(1) // only `host`; nothing was appended
  })
})

describe("testing: T3 interactions", () => {
  test("T3 click is synchronous: the DOM is final when it returns", () => {
    const { container } = t.render(Counter)
    t.click(t.byText(container, "+1"))
    expect(t.text(container)).toBe("+1count: 1")
    t.click(t.byText(container, "+1"))
    expect(t.text(container)).toBe("+1count: 2")
  })

  test("T3 click(undefined) throws, pointing at byText", () => {
    expect(() => t.click(undefined)).toThrow(/byText/)
    expect(() => t.click(null)).toThrow(/byText/)
  })

  test("T3 setValue on input, textarea and select: handler sees e.target.value; input and change both fire once", () => {
    const seen: Record<string, { type: string; value: string }[]> = {
      input: [],
      textarea: [],
      select: [],
    }
    const handler = (tag: string) => (e: Event) => {
      seen[tag]?.push({ type: e.type, value: (e.target as HTMLInputElement).value })
    }
    const { container } = t.render(() =>
      div(
        input({ oninput: handler("input"), onchange: handler("input") }),
        textarea({ oninput: handler("textarea"), onchange: handler("textarea") }),
        select(
          { oninput: handler("select"), onchange: handler("select") },
          option({ value: "a" }, "A"),
          option({ value: "b" }, "B"),
        ),
      ),
    )
    const inp = container.querySelector("input") as HTMLInputElement
    const ta = container.querySelector("textarea") as HTMLTextAreaElement
    const sel = container.querySelector("select") as HTMLSelectElement
    t.setValue(inp, "hello")
    t.setValue(ta, "multi\nline")
    t.setValue(sel, "b")
    expect(inp.value).toBe("hello")
    expect(ta.value).toBe("multi\nline")
    expect(sel.value).toBe("b")
    expect(seen.input).toEqual([
      { type: "input", value: "hello" },
      { type: "change", value: "hello" },
    ])
    expect(seen.textarea).toEqual([
      { type: "input", value: "multi\nline" },
      { type: "change", value: "multi\nline" },
    ])
    expect(seen.select).toEqual([
      { type: "input", value: "b" },
      { type: "change", value: "b" },
    ])
  })

  test("T3 type fires one input event per character, ends with the full value, and focuses the element", () => {
    const values: string[] = []
    const { container } = t.render(() =>
      div(input({ oninput: (e: Event) => values.push((e.target as HTMLInputElement).value) })),
    )
    const inp = container.querySelector("input") as HTMLInputElement
    expect(document.activeElement).not.toBe(inp)
    t.type(inp, "abc")
    expect(values).toEqual(["a", "ab", "abc"])
    expect(inp.value).toBe("abc")
    expect(document.activeElement).toBe(inp)
  })

  test("T3 byText returns the innermost match, narrows by selector, and throws with the page text when absent", () => {
    const { container } = t.render(() => div(div(span("Add")), p("count: 0")))
    const inner = t.byText(container, "Add")
    expect(inner.tagName).toBe("SPAN")
    const outer = t.byText(container, "Add", "div")
    expect(outer.tagName).toBe("DIV")
    expect(outer.contains(inner)).toBe(true)
    expect(() => t.byText(container, "Remove")).toThrow(/byText\(\).*"Remove".*Page text:.*Addcount: 0/)
    expect(() => t.byText(container, "Add", "button")).toThrow(/"button".*"Add"/)
  })

  test("T3 visibleText finds a comment-anchored text run and returns null under inline display:none", () => {
    const { container } = t.render(() =>
      div(Counter(), div({ style: { display: "none" } }, span("hidden thing"))),
    )
    // "count: " is a static text node and `() => count()` a live binding —
    // adjacent text nodes with a binding marker between them, no single element
    const found = t.visibleText(container, "count: 0")
    expect(found).not.toBeNull()
    expect(found?.tagName).toBe("P")
    expect(t.visibleText(container, "+1")?.tagName).toBe("BUTTON")
    expect(t.visibleText(container, "hidden thing")).toBeNull()
    expect(t.visibleText(container, "count: 99")).toBeNull()
  })

  test("T3 text collapses whitespace", () => {
    const { container } = t.render(() => div(pre("  a \n\n  b\t c  "), span(" d ")))
    expect(t.text(container)).toBe("a b c d")
    expect(t.text(container.querySelector("pre") as Element)).toBe("a b c")
  })

  test("T3 pressKey(input, 'Enter') adds a todo", () => {
    const { container } = t.render(TodoApp)
    const inp = container.querySelector("input") as HTMLInputElement
    expect(t.text(container)).toBe("Add0 left")
    t.setValue(inp, "milk")
    t.pressKey(inp, "Enter")
    expect([...container.querySelectorAll("li")].map((l) => l.textContent)).toEqual(["milk"])
    expect(t.visibleText(container, "1 left")).not.toBeNull()
    expect(inp.value).toBe("") // draft cleared through the reactive `value` prop
    t.pressKey(inp, "a") // a non-Enter key adds nothing
    expect(container.querySelectorAll("li")).toHaveLength(1)
  })

  test("T3 fire spreads init onto the event and returns false when a handler calls preventDefault", () => {
    let clientX: unknown = null
    let prevented = 0
    const { container } = t.render(() =>
      div(
        div({ id: "plain", onmousedown: (e: MouseEvent) => (clientX = e.clientX) }),
        div({
          id: "prevent",
          onmousedown: (e: Event) => {
            prevented++
            e.preventDefault()
          },
        }),
      ),
    )
    const plain = container.querySelector("#plain") as Element
    const prevent = container.querySelector("#prevent") as Element
    expect(t.fire(plain, "mousedown", { clientX: 5 })).toBe(true)
    expect(clientX).toBe(5)
    expect(t.fire(prevent, "mousedown", { clientX: 5 })).toBe(false)
    expect(prevented).toBe(1)
  })
})

describe("testing: T2 settle/waitFor", () => {
  test("T2 settle completes a resource whose fetcher has resolved", async () => {
    const d = deferred<string>()
    const { container } = t.render(() => ResourceApp(() => d.promise))
    expect(t.text(container)).toBe("loading")
    d.resolve("hello")
    expect(t.text(container)).toBe("loading") // nothing until the microtask queue drains
    await t.settle()
    expect(t.text(container)).toBe("hello")
  })

  test("T2 waitFor resolves when a later timer sets a signal", async () => {
    const [status, setStatus] = createSignal("pending")
    const { container } = t.render(() => div(() => status()))
    setTimeout(() => setStatus("done"), 30)
    const el = await t.waitFor(() => t.visibleText(container, "done"))
    expect(el).not.toBeNull()
    expect(t.text(container)).toBe("done")
  })

  test("T2 waitFor's timeout error names waitFor and includes the page text", async () => {
    t.render(Counter)
    await expect(t.waitFor(() => false, { timeout: 30, interval: 5 })).rejects.toThrow(
      /waitFor\(\).*30ms.*last: false.*Page text:.*count: 0/,
    )
    const err = await t
      .waitFor(() => Promise.reject(new Error("still loading")), {
        timeout: 20,
        interval: 5,
      })
      .catch((e: Error) => e)
    expect(err).toBeInstanceOf(Error)
    expect((err as Error).message).toMatch(/last: still loading/)
  })
})

describe("testing: captureWarnings", () => {
  test("captureWarnings returns ['E-SAMEREF-SET'] for the push-then-set footgun and [] for a clean run", () => {
    const arr = ["a"]
    const [items, setItems] = createSignal(arr)
    const footgun = t.captureWarnings(() => {
      arr.push("b")
      setItems(arr) // same reference: a no-op, and vint says so
    })
    expect(footgun).toEqual(["E-SAMEREF-SET"])
    const clean = t.captureWarnings(() => {
      setItems((prev) => [...prev, "c"])
    })
    expect(clean).toEqual([])
    expect(items()).toHaveLength(3)
  })

  test("captureWarnings restores console.warn after a throwing callback, and the throw propagates", () => {
    const original = console.warn
    expect(() =>
      t.captureWarnings(() => {
        throw new Error("boom")
      }),
    ).toThrow("boom")
    expect(console.warn).toBe(original)
  })

  test("captureWarnings works with an async callback", async () => {
    const original = console.warn
    const arr = [1]
    const [, setItems] = createSignal(arr)
    const codes = await t.captureWarnings(async () => {
      await t.settle()
      expect(console.warn).not.toBe(original) // still capturing across the await
      arr.push(2)
      setItems(arr)
    })
    expect(codes).toEqual(["E-SAMEREF-SET"])
    expect(console.warn).toBe(original)
    await expect(
      t.captureWarnings(async () => {
        await t.settle()
        throw new Error("async boom")
      }),
    ).rejects.toThrow("async boom")
    expect(console.warn).toBe(original)
  })

  test("the three apps render without any vint warning (no E-NO-OWNER noise)", async () => {
    const d = deferred<string>()
    const codes = await t.captureWarnings(async () => {
      const a = t.render(Counter)
      const b = t.render(TodoApp)
      const c = t.render(() => ResourceApp(() => d.promise))
      t.click(t.byText(a.container, "+1"))
      t.setValue(b.container.querySelector("input") as Element, "x")
      t.click(t.byText(b.container, "Add"))
      d.resolve("v")
      await t.settle()
      expect(t.text(c.container)).toBe("v")
      a.dispose()
      b.dispose()
      c.dispose()
    })
    expect(codes).toEqual([])
  })
})

describe("testing: T4 Unicode-aware matching and typing", () => {
  const nfd = "café" // "café" with a decomposed é: 5 code points
  const nfc = "café" // 4 code points

  test("T4 byText and visibleText match across NFC/NFD in either direction", () => {
    const { container } = t.render(() => div(button(nfd), span(nfc)))
    expect(t.byText(container, nfc, "button").tagName).toBe("BUTTON")
    expect(t.byText(container, nfd, "span").tagName).toBe("SPAN")
    expect(t.visibleText(container, nfc)).not.toBeNull()
    expect(t.text(container)).toBe(nfc + nfc)
  })

  test("T4 a formatted number with a narrow no-break space matches a plain-space spelling, and vice versa", () => {
    const formatted = new Intl.NumberFormat("fr").format(1234) // "1 234" with U+202F
    expect(formatted).not.toBe("1 234")
    const { container } = t.render(() =>
      div(
        span(formatted),
        p("total: ", () => formatted),
      ),
    )
    expect(t.byText(container, "1 234", "span").tagName).toBe("SPAN")
    expect(t.byText(container, formatted, "span").tagName).toBe("SPAN")
    expect(t.visibleText(container, "total: 1 234")?.tagName).toBe("P") // binding-marker run, NBSP + narrow NBSP
    expect(t.text(container.querySelector("span") as Element)).toBe("1 234")
  })

  test("T4 internal whitespace collapses on both sides, so a wrapped label matches its one-line spelling", () => {
    const { container } = t.render(() =>
      div(button("Save\n   changes"), span("  日本語  "), span("مرحبا بالعالم")),
    )
    expect(t.byText(container, "Save changes").tagName).toBe("BUTTON")
    expect(t.byText(container, "日本語").tagName).toBe("SPAN")
    expect(t.byText(container, "مرحبا  بالعالم").tagName).toBe("SPAN")
    expect(() => t.byText(container, "Savechanges")).toThrow(/byText\(\)/)
  })

  test("T4 type sets one grapheme cluster per keystroke: an emoji family and a combining sequence never appear half-typed", () => {
    const values: string[] = []
    const { container } = t.render(() =>
      div(input({ oninput: (e: Event) => values.push((e.target as HTMLInputElement).value) })),
    )
    const inp = container.querySelector("input") as HTMLInputElement
    const family = "👩‍👩‍👧" // three code points joined by ZWJ
    t.type(inp, `${family}é`)
    expect(values).toEqual([family, `${family}é`])
    expect(inp.value).toBe(`${family}é`) // vint never normalizes what goes in
  })

  test("T4 type({ ime: true }) fires the composition sequence in UI Events order and ends with one change", () => {
    const seen: string[] = []
    const { container } = t.render(() =>
      div(
        input({
          value: "x",
          oncompositionstart: (e: CompositionEvent) => seen.push(`start:${e.data}`),
          oncompositionupdate: (e: CompositionEvent) => seen.push(`update:${e.data}`),
          oncompositionend: (e: CompositionEvent) => seen.push(`end:${e.data}`),
          oninput: (e: Event) => {
            const ev = e as InputEvent
            seen.push(`input:${(e.target as HTMLInputElement).value}:${ev.isComposing}:${ev.inputType}`)
          },
          onchange: (e: Event) => seen.push(`change:${(e.target as HTMLInputElement).value}`),
        }),
      ),
    )
    const inp = container.querySelector("input") as HTMLInputElement
    t.type(inp, "日本", { ime: true })
    expect(seen).toEqual([
      "start:",
      "update:日",
      "input:x日:true:insertCompositionText",
      "update:日本",
      "input:x日本:true:insertCompositionText",
      "end:日本",
      "change:x日本",
    ])
    expect(inp.value).toBe("x日本")
    expect(document.activeElement).toBe(inp)
  })

  test("T4 an app that guards Enter with isComposing and reads on compositionend is testable", () => {
    const [items, setItems] = createSignal<string[]>([])
    const { container } = t.render(() => {
      const box = input({
        onkeydown: (e: KeyboardEvent) => {
          if (e.key !== "Enter" || e.isComposing) return
          setItems((prev) => [...prev, box.value])
          box.value = ""
        },
      })
      return div(box, ul(For({ each: items, key: (s) => s, children: (item) => li(() => item()) })))
    })
    const inp = container.querySelector("input") as HTMLInputElement
    t.type(inp, "東京", { ime: true })
    t.pressKey(inp, "Enter", { isComposing: true }) // the IME's commit keystroke: must not add
    expect(container.querySelectorAll("li")).toHaveLength(0)
    t.pressKey(inp, "Enter")
    expect([...container.querySelectorAll("li")].map((l) => l.textContent)).toEqual(["東京"])
  })
})

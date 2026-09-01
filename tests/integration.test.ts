// Contract group I — integration
import { beforeEach, describe, expect, test } from "vitest"
import { createSignal, For, mount, onCleanup, Show, tags } from "../src/index"

let host: HTMLDivElement
beforeEach(() => {
  document.body.innerHTML = ""
  host = document.createElement("div")
  document.body.append(host)
})

describe("integration", () => {
  test("I55/D8+O2 one live listener after repeated parent re-renders", () => {
    const [n, setN] = createSignal(0)
    const [theme, setTheme] = createSignal("light")
    mount(host, () =>
      tags.div(() =>
        tags.section(
          { class: theme() },
          tags.button({ onclick: () => setN((p) => p + 1) }, "inc"),
          tags.span(() => String(n())),
        ),
      ),
    )
    setTheme("dark")
    setTheme("light")
    setTheme("dark") // three full rebuilds of the section
    const btn = host.querySelector("button")!
    btn.click()
    expect(n()).toBe(1) // exactly one increment — no duplicated listeners
    expect(host.querySelector("span")!.textContent).toBe("1")
  })

  test("I56/C1+C2 For inside Show: toggle twice, list intact, row cleanups ran", () => {
    const [visible, setVisible] = createSignal(true)
    const [items, setItems] = createSignal(["a", "b"])
    let cleanups = 0
    mount(host, () =>
      tags.div(
        Show({
          when: visible,
          children: () =>
            tags.ul(
              For({
                each: items,
                children: (item) => {
                  onCleanup(() => cleanups++)
                  return tags.li(() => item())
                },
              }),
            ),
        }),
      ),
    )
    expect([...host.querySelectorAll("li")].map((l) => l.textContent)).toEqual(["a", "b"])
    setVisible(false)
    expect(host.querySelectorAll("li")).toHaveLength(0)
    expect(cleanups).toBe(2)
    setVisible(true)
    expect([...host.querySelectorAll("li")].map((l) => l.textContent)).toEqual(["a", "b"])
    setItems(["a", "b", "c"])
    expect([...host.querySelectorAll("li")].map((l) => l.textContent)).toEqual(["a", "b", "c"])
    setVisible(false)
    expect(host.querySelectorAll("li")).toHaveLength(0)
    expect(cleanups).toBe(2 + 3)
  })
})

// Contract group F — Show / Switch (C1, C3)
import { beforeEach, describe, expect, test } from "vitest"
import { createSignal, Match, mount, onCleanup, Show, Switch, tags } from "../src/index"

let host: HTMLDivElement
beforeEach(() => {
  document.body.innerHTML = ""
  host = document.createElement("div")
  document.body.append(host)
})

describe("Show", () => {
  test("F38/C1 truthy→truthy never rebuilds; only boolean flips do", () => {
    const [n, setN] = createSignal(3)
    let builds = 0
    mount(host, () =>
      tags.div(
        Show({
          when: n,
          children: () => {
            builds++
            return tags.span("content")
          },
        }),
      ),
    )
    expect(builds).toBe(1)
    const span = host.querySelector("span")
    setN(5) // truthy → truthy: same nodes, no rebuild
    expect(builds).toBe(1)
    expect(host.querySelector("span")).toBe(span)
    setN(0)
    expect(host.querySelector("span")).toBeNull()
    setN(3)
    expect(builds).toBe(2)
  })

  test("F38c/C1 callback with a default parameter still receives the accessor", () => {
    const [user] = createSignal<{ name: string } | null>({ name: "Ada" })
    mount(host, () =>
      tags.div(
        Show({
          when: user,
          // Function.length is 0 here — arity sniffing would break this form
          children: (u = () => ({ name: "?" })) => tags.span(() => u().name),
        }),
      ),
    )
    expect(host.textContent).toBe("Ada")
  })

  test("F38b/C1 fallback shows when falsy", () => {
    const [on, setOn] = createSignal(true)
    mount(host, () =>
      tags.div(
        Show({
          when: on,
          children: () => tags.span("yes"),
          fallback: () => tags.i("no"),
        }),
      ),
    )
    expect(host.querySelector("span")).not.toBeNull()
    expect(host.querySelector("i")).toBeNull()
    setOn(false)
    expect(host.querySelector("span")).toBeNull()
    expect(host.querySelector("i")).not.toBeNull()
  })

  test("F39/C1 branch flip runs the branch's cleanups", () => {
    const [on, setOn] = createSignal(true)
    const log: string[] = []
    mount(host, () =>
      tags.div(
        Show({
          when: on,
          children: () => {
            onCleanup(() => log.push("branch-cleanup"))
            return tags.span("on")
          },
        }),
      ),
    )
    expect(log).toEqual([])
    setOn(false)
    expect(log).toEqual(["branch-cleanup"])
  })

  test("F40/C1+D3 when null on first render, truthy later → content appears", () => {
    const [user, setUser] = createSignal<{ name: string } | null>(null)
    mount(host, () =>
      tags.div(
        Show({
          when: user,
          children: () => tags.b(() => user()?.name ?? ""),
        }),
      ),
    )
    expect(host.querySelector("b")).toBeNull()
    setUser({ name: "ada" })
    expect(host.querySelector("b")!.textContent).toBe("ada")
  })
})

describe("Switch", () => {
  test("F41/C3 first truthy Match wins; untracked later Matches don't rebuild the winner", () => {
    const [aOn, setAOn] = createSignal(true)
    const [bOn, setBOn] = createSignal(false)
    let buildsA = 0
    mount(host, () =>
      tags.div(
        Switch({
          fallback: () => tags.i("none"),
          children: [
            Match({
              when: aOn,
              children: () => {
                buildsA++
                return tags.p("A")
              },
            }),
            Match({ when: bOn, children: () => tags.p("B") }),
          ],
        }),
      ),
    )
    expect(host.querySelector("p")!.textContent).toBe("A")
    setBOn(true) // A still wins; B's when isn't even tracked
    expect(host.querySelector("p")!.textContent).toBe("A")
    expect(buildsA).toBe(1)
    setAOn(false)
    expect(host.querySelector("p")!.textContent).toBe("B")
  })

  test("F42/C3 fallback when nothing matches", () => {
    const [aOn, setAOn] = createSignal(false)
    mount(host, () =>
      tags.div(
        Switch({
          fallback: () => tags.i("none"),
          children: [Match({ when: aOn, children: () => tags.p("A") })],
        }),
      ),
    )
    expect(host.querySelector("i")!.textContent).toBe("none")
    setAOn(true)
    expect(host.querySelector("p")!.textContent).toBe("A")
  })
})

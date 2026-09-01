// Contract group D — on() (R11)
import { describe, expect, test } from "vitest"
import { createEffect, createRoot, createSignal, on } from "../src/index"

describe("on", () => {
  test("D27/R11 passes (input, prevInput, prevValue); body untracked", () => {
    const [dep, setDep] = createSignal(1)
    const [other, setOther] = createSignal("x")
    const calls: Array<[number, number | undefined]> = []
    createRoot(() => {
      createEffect(
        on(dep, (input, prevInput) => {
          other() // read inside body — must NOT become a dependency
          calls.push([input, prevInput])
        }),
      )
    })
    expect(calls).toEqual([[1, undefined]])
    setOther("y") // untracked — no run
    expect(calls).toEqual([[1, undefined]])
    setDep(2)
    expect(calls).toEqual([
      [1, undefined],
      [2, 1],
    ])
  })

  test("D28/R11 defer:true skips the first run", () => {
    const [dep, setDep] = createSignal(1)
    const calls: number[] = []
    createRoot(() => {
      createEffect(on(dep, (v) => calls.push(v), { defer: true }))
    })
    expect(calls).toEqual([])
    setDep(2)
    expect(calls).toEqual([2])
  })

  test("D29/R11 array deps form", () => {
    const [a, setA] = createSignal(1)
    const [b, setB] = createSignal(10)
    const calls: number[][] = []
    createRoot(() => {
      createEffect(on([a, b], (input) => calls.push(input as number[])))
    })
    expect(calls).toEqual([[1, 10]])
    setA(2)
    expect(calls).toEqual([
      [1, 10],
      [2, 10],
    ])
    setB(20)
    expect(calls.at(-1)).toEqual([2, 20])
  })
})

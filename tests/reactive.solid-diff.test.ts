// Contract group S — differential tests against Solid 1.x (assessment §9 Phase 1, item 2).
//
// Principle 1 as a test: the same scenario, written once against a tiny
// adapter interface, runs through vint and through solid-js (the BROWSER
// build — vitest.config.ts aliases it, since Solid's server build makes
// effects no-ops) and the observable traces must be identical. Traces
// contain only values and our own labels, never engine internals, and they
// never record WHEN a memo computes — Solid's memos are eager, vint's are
// lazy (R5), and that timing is the one difference the contract owns.
//
// Feature flags: with VINT_FULL unset, the scenarios that pin known Solid
// divergences are `test.fails`, each naming its finding (M3, M4, L1). L13 is
// a permanent, documented divergence (R10) and is asserted as such.
import fc from "fast-check"
import * as solid from "solid-js"
import { describe, expect, test } from "vitest"
import * as vint from "../src/index"
import { FULL } from "./helpers/flags"

/** Flagged scenarios reproduce known divergences until Phase 2 lands. */
const flagged = FULL ? test : test.fails
const SEED = 20260904

// ---------------------------------------------------------------------------
// Adapter: the shared surface, typed loosely enough for both engines
// ---------------------------------------------------------------------------

type Equals<T> = false | ((a: T, b: T) => boolean)
type Getter<T> = () => T
type Setter<T> = (v: T | ((prev: T) => T)) => T
interface Api {
  createSignal<T>(value: T, options?: { equals?: Equals<T> }): [Getter<T>, Setter<T>]
  createMemo<T>(fn: (prev: T | undefined) => T, initial?: T, options?: { equals?: Equals<T> }): Getter<T>
  createEffect<T>(fn: (prev: T | undefined) => T, initial?: T): void
  createRoot<T>(fn: (dispose: () => void) => T): T
  batch<T>(fn: () => T): T
  untrack<T>(fn: () => T): T
  on<T, U>(
    deps: Getter<T> | ReadonlyArray<Getter<unknown>>,
    fn: (input: T, prevInput: T | undefined, prevValue: U | undefined) => U,
    options?: { defer?: boolean },
  ): (prev: U | undefined) => U
  onCleanup(fn: () => void): void
  getOwner(): unknown
  runWithOwner<T>(owner: unknown, fn: () => T): T | undefined
}

const vintApi = vint as unknown as Api
const solidApi = solid as unknown as Api

type Trace = (line: string) => void
type Scenario = (api: Api, t: Trace) => void

function traceOf(api: Api, scenario: Scenario): string[] {
  const trace: string[] = []
  scenario(api, (line) => trace.push(line))
  return trace
}

/** Declares a scenario whose traces must be identical in both engines. */
type Declare = (name: string, fn: () => void) => void
function same(name: string, scenario: Scenario, declare: Declare = test): void {
  declare(name, () => {
    expect(traceOf(vintApi, scenario)).toEqual(traceOf(solidApi, scenario))
  })
}

const fmt = (e: unknown) => (e instanceof Error ? e.message : String(e))

// ---------------------------------------------------------------------------
// Scripted scenarios
// ---------------------------------------------------------------------------

describe("solid-diff: scripted", () => {
  same(
    "R7 simple signal → effect: runs after the root body, on each change, not on equal writes",
    (api, t) => {
      const [n, setN] = api.createSignal(0)
      const dispose = api.createRoot((d) => {
        api.createEffect(() => t(`e:run:${n()}`))
        t("body")
        return d
      })
      setN(1)
      setN(2)
      setN(2)
      dispose()
      setN(3)
    },
  )

  same(
    "R5+R6 memo chain a → b → c → effect: computes in order, once per change, gated by equality",
    (api, t) => {
      const [a, setA] = api.createSignal(1)
      const dispose = api.createRoot((d) => {
        const b = api.createMemo(() => {
          const v = a() * 2
          t(`b:compute:${v}`)
          return v
        })
        const c = api.createMemo(() => {
          const v = b() % 3
          t(`c:compute:${v}`)
          return v
        })
        api.createEffect(() => t(`e:run:${c()}`))
        return d
      })
      setA(2) // b=4, c=1 (changed)
      setA(5) // b=10, c=1 (equal: effect gated)
      setA(1) // b=2, c=2
      dispose()
    },
  )

  same("R6 diamond with equality gating: one effect run per write, consistent A and B", (api, t) => {
    const [s, setS] = api.createSignal(0)
    const dispose = api.createRoot((d) => {
      const A = api.createMemo(() => s() % 2)
      const B = api.createMemo(() => s())
      api.createEffect(() => t(`e:run:${A()},${B()}`))
      return d
    })
    setS(1)
    setS(3) // A equal, B changed
    setS(3) // no-op
    setS(4)
    dispose()
  })

  same("R9 batch: effects run once after the outermost batch; reads inside see new values", (api, t) => {
    const [a, setA] = api.createSignal(1)
    const [b, setB] = api.createSignal(1)
    const dispose = api.createRoot((d) => {
      const sum = api.createMemo(() => a() + b())
      api.createEffect(() => t(`e:run:${sum()}`))
      return d
    })
    api.batch(() => {
      setA(2)
      api.batch(() => setB(3))
      t(`inside:${a()},${b()}`)
    })
    dispose()
  })

  same("R3 dynamic dependencies: the unread branch stops triggering", (api, t) => {
    const [useA, setUseA] = api.createSignal(true)
    const [a, setA] = api.createSignal("a")
    const [b, setB] = api.createSignal("b")
    const dispose = api.createRoot((d) => {
      api.createEffect(() => t(`e:run:${useA() ? a() : b()}`))
      return d
    })
    setB("b2")
    setUseA(false)
    setA("a2")
    setB("b3")
    dispose()
  })

  same("R11 on() with array deps: only deps are tracked, the body is untracked", (api, t) => {
    const [a, setA] = api.createSignal(1)
    const [b, setB] = api.createSignal(10)
    const [c, setC] = api.createSignal(100)
    const dispose = api.createRoot((d) => {
      api.createEffect(
        api.on<[number, number], void>([a, b], ([av, bv], prev) => {
          t(`on:${av},${bv}:${String(prev)}:${c()}`)
        }),
      )
      return d
    })
    setC(200) // read in the body: untracked
    setA(2)
    setB(20)
    dispose()
  })

  same("R2 untrack inside an effect suppresses tracking", (api, t) => {
    const [a, setA] = api.createSignal(1)
    const [b, setB] = api.createSignal(1)
    const dispose = api.createRoot((d) => {
      api.createEffect(() => t(`e:run:${a()},${api.untrack(() => b())}`))
      return d
    })
    setB(2)
    setA(2)
    dispose()
  })

  same("R4 signal and memo with equals: false re-notify on identical values", (api, t) => {
    const [a, setA] = api.createSignal(1, { equals: false })
    const dispose = api.createRoot((d) => {
      const m = api.createMemo(() => a() * 0, undefined, { equals: false })
      api.createEffect(() => t(`e:run:${m()}`))
      return d
    })
    setA(1)
    setA(1)
    dispose()
  })

  same("O2 onCleanup runs LIFO before a re-run and on disposal", (api, t) => {
    const [n, setN] = api.createSignal(0)
    const dispose = api.createRoot((d) => {
      api.createEffect(() => {
        const v = n()
        api.onCleanup(() => t(`c:a:${v}`))
        api.onCleanup(() => t(`c:b:${v}`))
        t(`e:run:${v}`)
      })
      return d
    })
    setN(1)
    dispose()
  })

  same(
    "O1+O2 a child effect is disposed (cleanup runs) before its parent re-runs, then recreated",
    (api, t) => {
      const [n, setN] = api.createSignal(0)
      const [m, setM] = api.createSignal(0)
      const dispose = api.createRoot((d) => {
        api.createEffect(() => {
          const v = n()
          t(`parent:run:${v}`)
          api.createEffect(() => {
            t(`child:run:${v},${m()}`)
            api.onCleanup(() => t(`child:cleanup:${v}`))
          })
        })
        return d
      })
      setM(1)
      setN(1)
      setM(2)
      dispose()
    },
  )

  same("O1 getOwner/runWithOwner attach late computations and cleanups to the root", (api, t) => {
    const [a, setA] = api.createSignal(0)
    let owner: unknown
    const dispose = api.createRoot((d) => {
      owner = api.getOwner()
      return d
    })
    api.runWithOwner(owner, () => {
      api.onCleanup(() => t("late:cleanup"))
      api.createEffect(() => t(`late:run:${a()}`))
    })
    setA(1)
    dispose()
    setA(2)
  })

  same("O5 disposing an inner root stops its effects; the outer root keeps running", (api, t) => {
    const [a, setA] = api.createSignal(0)
    let disposeInner!: () => void
    const dispose = api.createRoot((d) => {
      api.createEffect(() => t(`outer:${a()}`))
      api.createRoot((di) => {
        disposeInner = di
        api.createEffect(() => t(`inner:${a()}`))
      })
      return d
    })
    setA(1)
    disposeInner()
    disposeInner() // idempotent
    setA(2)
    dispose()
  })

  same("R8 an effect writing an unrelated signal cascades within the same flush", (api, t) => {
    const [a, setA] = api.createSignal(0)
    const [b, setB] = api.createSignal(0)
    const dispose = api.createRoot((d) => {
      api.createEffect(() => {
        const v = a()
        t(`ab:${v}`)
        setB(v * 10)
      })
      api.createEffect(() => t(`b:${b()}`))
      return d
    })
    setA(1)
    setA(2)
    dispose()
  })

  // --- flagged: known divergences, promoted to `test` when VINT_FULL=1 ---

  same(
    "R11 [M4] on(..., { defer: true }) in a memo with `initial` returns prevValue on the deferred run",
    (api, t) => {
      const [a, setA] = api.createSignal(1)
      const dispose = api.createRoot((d) => {
        const m = api.createMemo(
          api.on(a, (v, _prev, prevValue: number | undefined) => v + (prevValue ?? 0), { defer: true }),
          42,
        )
        t(`m:${String(m())}`)
        api.createEffect(() => t(`e:${String(m())}`))
        return d
      })
      setA(2)
      dispose()
    },
    flagged,
  )

  same(
    "R5 [L1] the first memo compute assigns unconditionally; `equals` gates re-computations only",
    (api, t) => {
      const [n, setN] = api.createSignal(5)
      const dispose = api.createRoot((d) => {
        const m = api.createMemo(
          () => ({ id: 1, x: n() }),
          { id: 1, x: 0 },
          {
            equals: (a, b) => a.id === b.id,
          },
        )
        t(`m:${m().x}`)
        api.createEffect(() => t(`e:${m().x}`))
        return d
      })
      setN(6) // same id: gated in both engines
      dispose()
    },
    flagged,
  )

  same(
    "R7 [M3] an effect created inside a memo body during a top-level stale read runs after the memo returns",
    (api, t) => {
      const [s, setS] = api.createSignal(0)
      let m!: () => number
      const dispose = api.createRoot((d) => {
        m = api.createMemo(() => {
          const v = s()
          t("m:enter")
          api.createEffect(() => t("inner:run"))
          t(`m:exit:${v}`)
          return v
        })
        return d
      })
      setS(1) // Solid recomputes here (eager); vint on the read below (lazy) — not traced
      t(`read:${m()}`)
      dispose()
    },
    flagged,
  )

  // --- permanent divergence, documented in R10 ---

  test("R10 [L13] createRoot body throw: vint RUNS the effects created before the throw, Solid drops them", () => {
    const scenario: Scenario = (api, t) => {
      try {
        api.createRoot(() => {
          api.createEffect(() => t("e:run"))
          throw new Error("body")
        })
      } catch (e) {
        t(`threw:${fmt(e)}`)
      }
    }
    // The divergence is deliberate (R10's AggregateError clause needs the
    // flush to happen): assert it exactly, so a change in either direction
    // is a conscious one.
    expect(traceOf(vintApi, scenario)).toEqual(["e:run", "threw:body"])
    expect(traceOf(solidApi, scenario)).toEqual(["threw:body"])
  })
})

// ---------------------------------------------------------------------------
// Random graphs: no throws, no loops — every trace must match
// ---------------------------------------------------------------------------

type Ref = { t: "s" | "m"; i: number }
interface MemoSpec {
  sources: Ref[]
  op: "sum" | "mod" | "cond"
  k: number
  equals: "default" | "false" | "parity"
}
interface EffectSpec {
  sources: Ref[]
  cond: boolean
  cascade: number | null
  inner: boolean
}
interface Graph {
  init: number[]
  memos: MemoSpec[]
  effects: EffectSpec[]
}
type Op =
  | { op: "write"; s: number; v: number }
  | { op: "batch"; writes: Array<[number, number]> }
  | { op: "read"; m: number }
  | { op: "dispose" }

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)
const parity = (a: number, b: number) => a % 2 === b % 2

/** src[0] always; the rest only if src[0] is even (R3). */
function readSeq(sources: Ref[], cond: boolean, read: (r: Ref) => number): number[] {
  const vals = [read(sources[0] as Ref)]
  if (!cond || (vals[0] as number) % 2 === 0) {
    for (let i = 1; i < sources.length; i++) vals.push(read(sources[i] as Ref))
  }
  return vals
}

function upstreamSignals(memos: MemoSpec[], refs: Ref[]): Set<number> {
  const out = new Set<number>()
  const seen = new Set<number>()
  const walk = (r: Ref) => {
    if (r.t === "s") out.add(r.i)
    else if (!seen.has(r.i)) {
      seen.add(r.i)
      for (const src of (memos[r.i] as MemoSpec).sources) walk(src)
    }
  }
  for (const r of refs) walk(r)
  return out
}

const refArb = (nSig: number, nMemo: number) =>
  fc
    .integer({ min: 0, max: nSig + nMemo - 1 })
    .map((i): Ref => (i < nSig ? { t: "s", i } : { t: "m", i: i - nSig }))

const memoArb = (nSig: number, idx: number) =>
  fc.record<MemoSpec>({
    sources: fc.array(refArb(nSig, idx), { minLength: 1, maxLength: 3 }),
    op: fc.constantFrom("sum", "mod", "cond"),
    k: fc.integer({ min: 2, max: 9 }),
    equals: fc.constantFrom("default", "false", "parity"),
  })

const graphArb: fc.Arbitrary<Graph> = fc
  .integer({ min: 2, max: 4 })
  .chain((nSig) =>
    fc.tuple(
      fc.array(fc.integer({ min: 0, max: 20 }), { minLength: nSig, maxLength: nSig }),
      fc
        .integer({ min: 0, max: 4 })
        .chain((nMemo) =>
          nMemo === 0
            ? fc.constant([] as MemoSpec[])
            : fc
                .tuple(...Array.from({ length: nMemo }, (_, i) => memoArb(nSig, i)))
                .map((t) => t as MemoSpec[]),
        ),
    ),
  )
  .chain(([init, memos]) =>
    fc
      .array(
        fc.record({
          sources: fc.array(refArb(init.length, memos.length), { minLength: 1, maxLength: 3 }),
          cond: fc.boolean(),
          cascadePick: fc.option(fc.nat(), { nil: null }),
          inner: fc.boolean(),
        }),
        { minLength: 1, maxLength: 4 },
      )
      .map((raw): Graph => {
        // cascade targets: not upstream of this or any earlier effect (acyclic),
        // never signal 0 (keeps one signal writable), unique
        const taken = new Set<number>()
        const forbidden = new Set<number>([0])
        const effects: EffectSpec[] = []
        for (const e of raw) {
          for (const s of upstreamSignals(memos, e.sources)) forbidden.add(s)
          let cascade: number | null = null
          if (e.cascadePick !== null) {
            const candidates: number[] = []
            for (let s = 0; s < init.length; s++)
              if (!forbidden.has(s) && !taken.has(s)) candidates.push(s)
            if (candidates.length) {
              cascade = candidates[e.cascadePick % candidates.length] as number
              taken.add(cascade)
            }
          }
          effects.push({ sources: e.sources, cond: e.cond, cascade, inner: e.inner })
        }
        return { init, memos, effects }
      }),
  )

const scenarioArb = graphArb.chain((graph) => {
  const targets = new Set(graph.effects.map((e) => e.cascade))
  const writable: number[] = []
  for (let s = 0; s < graph.init.length; s++) if (!targets.has(s)) writable.push(s)
  const sig = fc.nat().map((n) => writable[n % writable.length] as number)
  const val = fc.integer({ min: 0, max: 20 })
  const arms: Array<fc.WeightedArbitrary<Op>> = [
    { arbitrary: fc.record({ op: fc.constant("write" as const), s: sig, v: val }), weight: 6 },
    {
      arbitrary: fc.record({
        op: fc.constant("batch" as const),
        writes: fc.array(fc.tuple(sig, val), { minLength: 1, maxLength: 4 }),
      }),
      weight: 2,
    },
    { arbitrary: fc.constant({ op: "dispose" as const }), weight: 1 },
  ]
  if (graph.memos.length) {
    arms.push({
      arbitrary: fc.record({
        op: fc.constant("read" as const),
        m: fc.nat().map((n) => n % graph.memos.length),
      }),
      weight: 2,
    })
  }
  return fc.record({
    graph: fc.constant(graph),
    ops: fc.array(fc.oneof(...arms), { minLength: 5, maxLength: 30 }),
  })
})

/** Builds the graph through `api` and drives the ops, tracing effect runs and reads. */
function randomScenario(graph: Graph, ops: Op[]): Scenario {
  return (api, t) => {
    const sigs = graph.init.map((v) => api.createSignal(v))
    const memos: Array<Getter<number>> = []
    const readRef = (r: Ref) =>
      r.t === "s"
        ? (sigs[r.i] as [Getter<number>, Setter<number>])[0]()
        : (memos[r.i] as Getter<number>)()
    const makeEffect = (spec: EffectSpec, i: number) => {
      api.createEffect(() => {
        const vals = readSeq(spec.sources, spec.cond, readRef)
        t(`e${i}:${vals.join(",")}`)
        if (spec.cascade !== null) (sigs[spec.cascade] as [Getter<number>, Setter<number>])[1](sum(vals))
      })
    }
    const inner: { dispose: (() => void) | null } = { dispose: null }
    const dispose = api.createRoot((d) => {
      graph.memos.forEach((spec, i) => {
        const options =
          spec.equals === "false"
            ? { equals: false as const }
            : spec.equals === "parity"
              ? { equals: parity }
              : {}
        memos.push(
          api.createMemo(
            () => {
              const vals = readSeq(spec.sources, spec.op === "cond", readRef)
              const s = sum(vals)
              const v = spec.op === "mod" ? s % spec.k : s
              // parity-normalised so that lazy vs eager retention is unobservable
              return spec.equals === "parity" ? v % 2 : v
            },
            undefined,
            options,
          ),
        )
        void i
      })
      graph.effects.forEach((spec, i) => {
        if (!spec.inner) makeEffect(spec, i)
      })
      if (graph.effects.some((e) => e.inner)) {
        api.createRoot((di) => {
          inner.dispose = di
          graph.effects.forEach((spec, i) => {
            if (spec.inner) makeEffect(spec, i)
          })
        })
      }
      return d
    })
    for (const op of ops) {
      switch (op.op) {
        case "write":
          ;(sigs[op.s] as [Getter<number>, Setter<number>])[1](op.v)
          break
        case "batch":
          api.batch(() => {
            for (const [s, v] of op.writes) (sigs[s] as [Getter<number>, Setter<number>])[1](v)
          })
          break
        case "read":
          t(`r${op.m}:${(memos[op.m] as Getter<number>)()}`)
          break
        case "dispose":
          inner.dispose?.()
          break
      }
      t(OP_END)
    }
    dispose()
    inner.dispose?.()
  }
}

const OP_END = "--"

/**
 * Sibling effects have no promised order (R7 orders render before user
 * effects, nothing more), and the order in which two siblings are visited
 * depends on each signal's observer array — which Solid's eager memos and
 * vint's lazy memos reshuffle at different moments (the swap-remove detach
 * happens on recompute). So each op is compared by its settled result: the
 * last value every effect observed in that op, sorted, plus the reads.
 */
function settled(trace: string[]): string[][] {
  const ops: string[][] = []
  let last = new Map<string, string>()
  let reads: string[] = []
  for (const line of trace) {
    if (line === OP_END) {
      ops.push([...reads, ...[...last.values()].sort()])
      last = new Map()
      reads = []
    } else if (line.startsWith("r")) reads.push(line)
    else last.set(line.slice(0, line.indexOf(":")), line)
  }
  ops.push([...reads, ...[...last.values()].sort()])
  return ops
}

describe("solid-diff: random graphs", () => {
  test("R3+R5+R6+R8+R9+O5 per op, every effect's settled value and every read matches Solid (no throws, no loops)", () => {
    fc.assert(
      fc.property(scenarioArb, ({ graph, ops }) => {
        const scenario = randomScenario(graph, ops)
        expect(settled(traceOf(vintApi, scenario))).toEqual(settled(traceOf(solidApi, scenario)))
      }),
      { seed: SEED, numRuns: 200 },
    )
  })
})

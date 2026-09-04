// Contract group P — property-based scheduler tests (assessment §9 Phase 1, item 1).
//
// A random DAG of signals, memos and effects is driven through a random op
// sequence, and every observable is compared against a pure oracle: memo
// values are recomputed from scratch, an effect's tuple is its sources'
// oracle values under the same conditional-read rule, and cascade writes
// settle to a fixed point. The oracle needs one thing it cannot compute
// from scratch — which nodes a write reaches — so each computation records
// the reads of its last run (that is what the scheduler must have tracked,
// and P4 checks that it did).
//
// History: in Phase 1 the arms that exercise throws, loops and throwing
// cleanups were `test.fails`, each naming the assessment finding
// it reproduces (H1, H2, M2, L3). Phase 2 fixes them and flips the default.
import fc from "fast-check"
import { describe, expect, test } from "vitest"
import {
  batch,
  createEffect,
  createMemo,
  createRenderEffect,
  createRoot,
  createSignal,
  getOwner,
  onCleanup,
  untrack,
} from "../src/index"
import { __debugTree, __observerCount, type DebugNode, type Owner } from "../src/reactive"

/** Flagged arms reproduce known defects until Phase 2 lands. */
// Phase 2 landed: every arm is a real test (the Phase 1 flag gating is gone)
const flagged = test
const SEED = 20260904
const RUNS = 200

// ---------------------------------------------------------------------------
// Graph and op shapes
// ---------------------------------------------------------------------------

type Ref = { t: "s" | "m"; i: number }
type MemoEquals = "default" | "false" | "parity"
interface MemoSpec {
  sources: Ref[]
  op: "sum" | "mod" | "cond"
  k: number
  equals: MemoEquals
  mayThrow: boolean
}
interface EffectSpec {
  kind: "user" | "render"
  sources: Ref[]
  cond: boolean
  throws: boolean
  /** Index of a signal that is NOT upstream of this effect, or null. */
  cascade: number | null
  cleanupThrows: boolean
  inner: boolean
}
interface Flags {
  throws: boolean
  cleanupThrows: boolean
  loops: boolean
  cascades: boolean
}
interface Graph {
  flags: Flags
  init: number[]
  memos: MemoSpec[]
  effects: EffectSpec[]
}
type Op =
  | { op: "write"; s: number; v: number }
  | { op: "batch"; writes: Array<[number, number]> }
  | { op: "read"; m: number }
  | { op: "dispose" }
  | { op: "flip"; m: number }
  | { op: "loop" }
interface Scenario {
  graph: Graph
  ops: Op[]
}

const OFF: Flags = { throws: false, cleanupThrows: false, loops: false, cascades: true }
const refId = (r: Ref) => `${r.t}${r.i}`
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)

/** The conditional-read rule (R3): src[0] always; the rest only if src[0] is even. */
function readSeq(sources: Ref[], cond: boolean, read: (r: Ref) => number): number[] {
  const first = sources[0] as Ref
  const vals = [read(first)]
  if (!cond || (vals[0] as number) % 2 === 0) {
    for (let i = 1; i < sources.length; i++) vals.push(read(sources[i] as Ref))
  }
  return vals
}

function memoOp(spec: MemoSpec, vals: number[]): number {
  const s = sum(vals)
  const v = spec.op === "mod" ? s % spec.k : s
  // A parity memo's value is normalised so that "parity-equal" and "===" agree:
  // whether a lazy memo RETAINS an equal-but-different value depends on when it
  // was last pulled, which a from-scratch oracle cannot know. Retention itself
  // is pinned by the scripted signal tests; here parity exercises the custom
  // `equals` path and R5 gating (0/1 values collide constantly).
  return spec.equals === "parity" ? v % 2 : v
}

const equalsOption = (e: MemoEquals) =>
  e === "false" ? { equals: false as const } : e === "parity" ? { equals: parity } : {}
const parity = (a: number, b: number) => a % 2 === b % 2

/** Signals transitively upstream of a node (static: every declared source). */
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

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

const refArb = (nSig: number, nMemo: number) =>
  fc
    .integer({ min: 0, max: nSig + nMemo - 1 })
    .map((i): Ref => (i < nSig ? { t: "s", i } : { t: "m", i: i - nSig }))

const memoArb = (nSig: number, idx: number, flags: Flags) =>
  fc.record<MemoSpec>({
    sources: fc.array(refArb(nSig, idx), { minLength: 1, maxLength: 3 }),
    op: fc.constantFrom("sum", "mod", "cond"),
    k: fc.integer({ min: 2, max: 9 }),
    equals: fc.constantFrom("default", "false", "parity"),
    mayThrow: flags.throws ? fc.boolean() : fc.constant(false),
  })

const effectArb = (nSig: number, nMemo: number, flags: Flags) =>
  fc.record({
    kind: fc.constantFrom<"user" | "render">("user", "render"),
    sources: fc.array(refArb(nSig, nMemo), { minLength: 1, maxLength: 3 }),
    cond: fc.boolean(),
    throws: flags.throws ? fc.integer({ min: 0, max: 3 }).map((x) => x === 0) : fc.constant(false),
    cascadePick: flags.cascades ? fc.option(fc.nat(), { nil: null }) : fc.constant(null),
    cleanupThrows: flags.cleanupThrows
      ? fc.integer({ min: 0, max: 2 }).map((x) => x === 0)
      : fc.constant(false),
    inner: fc.boolean(),
  })

function graphArb(flags: Flags): fc.Arbitrary<Graph> {
  return fc
    .integer({ min: 2, max: 6 })
    .chain((nSig) =>
      fc.tuple(
        fc.array(fc.integer({ min: 0, max: 20 }), { minLength: nSig, maxLength: nSig }),
        fc
          .integer({ min: 0, max: 6 })
          .chain((nMemo) =>
            nMemo === 0
              ? fc.constant([] as MemoSpec[])
              : fc
                  .tuple(...Array.from({ length: nMemo }, (_, i) => memoArb(nSig, i, flags)))
                  .map((t) => t as MemoSpec[]),
          ),
      ),
    )
    .chain(([init, memos]) =>
      fc
        .array(effectArb(init.length, memos.length, flags), { minLength: 1, maxLength: 6 })
        .map((raw): Graph => {
          // Resolve cascade targets: a target must not be upstream of this
          // effect or of any earlier one (so effect→effect edges only point
          // forward: no cycles), never signal 0 (the loop signal, and it
          // keeps at least one signal writable by ops), and be unique.
          const taken = new Set<number>()
          const forbidden = new Set<number>([0])
          const effects: EffectSpec[] = []
          for (const e of raw) {
            for (const s of upstreamSignals(memos, e.sources)) forbidden.add(s)
            let cascade: number | null = null
            if (e.cascadePick !== null) {
              const candidates: number[] = []
              for (let s = 0; s < init.length; s++) {
                if (!forbidden.has(s) && !taken.has(s)) candidates.push(s)
              }
              if (candidates.length) {
                cascade = candidates[e.cascadePick % candidates.length] as number
                taken.add(cascade)
              }
            }
            effects.push({
              kind: e.kind,
              sources: e.sources,
              cond: e.cond,
              throws: e.throws,
              cascade,
              cleanupThrows: e.cleanupThrows,
              inner: e.inner,
            })
          }
          return { flags, init, memos, effects }
        }),
    )
}

function scenarioArb(flags: Flags): fc.Arbitrary<Scenario> {
  return graphArb(flags).chain((graph) => {
    const writable: number[] = []
    const targets = new Set(graph.effects.map((e) => e.cascade))
    for (let s = 0; s < graph.init.length; s++) if (!targets.has(s)) writable.push(s)
    const sig = fc.nat().map((n) => writable[n % writable.length] as number)
    const val = fc.integer({ min: 0, max: 20 })
    const throwable: number[] = []
    graph.memos.forEach((m, i) => {
      if (m.mayThrow) throwable.push(i)
    })
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
    if (throwable.length) {
      arms.push({
        arbitrary: fc.record({
          op: fc.constant("flip" as const),
          m: fc.nat().map((n) => throwable[n % throwable.length] as number),
        }),
        weight: 3,
      })
    }
    return fc
      .tuple(fc.array(fc.oneof(...arms), { minLength: 10, maxLength: 40 }), fc.nat())
      .map(([ops, loopAt]): Scenario => {
        if (!flags.loops) return { graph, ops }
        // never mutate a generated value — the shrinker reuses it
        const at = loopAt % (ops.length + 1)
        return { graph, ops: [...ops.slice(0, at), { op: "loop" }, ...ops.slice(at)] }
      })
  })
}

// ---------------------------------------------------------------------------
// Oracle
// ---------------------------------------------------------------------------

class ModelThrow extends Error {}

class Model {
  sig: number[]
  gate: boolean[]
  live: boolean[]
  constructor(readonly g: Graph) {
    this.sig = [...g.init]
    this.gate = g.memos.map(() => false)
    this.live = g.effects.map(() => true)
  }
  memo(i: number): number {
    const spec = this.g.memos[i] as MemoSpec
    const vals = readSeq(spec.sources, spec.op === "cond", (r) => this.ref(r))
    const v = memoOp(spec, vals)
    if (spec.mayThrow && this.gate[i] && v % 7 === 3) throw new ModelThrow(`m${i}`)
    return v
  }
  ref(r: Ref): number {
    return r.t === "s" ? (this.sig[r.i] as number) : this.memo(r.i)
  }
  /** The tuple effect `i` reads; throws ModelThrow(label) if its evaluation throws. */
  effect(i: number): number[] {
    const spec = this.g.effects[i] as EffectSpec
    const vals = readSeq(spec.sources, spec.cond, (r) => this.ref(r))
    if (spec.throws && sum(vals) % 7 === 3) throw new ModelThrow(`e${i}`)
    return vals
  }
  tryEffect(i: number): { vals: number[] } | { threw: string } {
    try {
      return { vals: this.effect(i) }
    } catch (e) {
      if (e instanceof ModelThrow) return { threw: e.message }
      throw e
    }
  }
}

// ---------------------------------------------------------------------------
// Harness: the real graph, instrumented
// ---------------------------------------------------------------------------

interface NodeRec {
  id: string
  /** Ids read during the last run that entered the body (a prefix if it threw). */
  deps: string[]
}
interface EffectRec extends NodeRec {
  runs: number
  last: number[] | null
  live: boolean
  cleanupArmed: boolean
}
interface Harness {
  sigs: Array<[() => number, (v: number | ((p: number) => number)) => number]>
  gates: Array<[() => boolean, (v: boolean | ((p: boolean) => boolean)) => boolean]>
  memoGets: Array<() => number>
  memoRecs: NodeRec[]
  effRecs: EffectRec[]
  /** Loop gadget (loops arm): memo over signal 0 and the self-feeding effect. */
  loopMemo: NodeRec | null
  loopEffect: EffectRec | null
  loopActive: boolean
  root: Owner
  inner: Owner | null
  disposeInner: (() => void) | null
  disposeOuter: () => void
  cascadeWrites: number
  initError: unknown
}

const LOOP_LIMIT_VALUE = 1e9

function build(g: Graph): Harness {
  // One object, mutated in place: the effect bodies close over it, and the
  // engine resets `cascadeWrites` / toggles `loopActive` on the same instance.
  const h: Harness = {
    sigs: g.init.map((v) => createSignal(v)),
    gates: g.memos.map(() => createSignal(false)),
    memoGets: [] as Array<() => number>,
    memoRecs: [] as NodeRec[],
    effRecs: [] as EffectRec[],
    loopMemo: null as NodeRec | null,
    loopEffect: null as EffectRec | null,
    loopActive: false,
    inner: null as Owner | null,
    disposeInner: null as (() => void) | null,
    cascadeWrites: 0,
    initError: null as unknown,
    root: null as unknown as Owner,
    disposeOuter: () => {},
  }
  const readRef = (r: Ref, reads: string[]): number => {
    const v =
      r.t === "s" ? (h.sigs[r.i] as Harness["sigs"][number])[0]() : (h.memoGets[r.i] as () => number)()
    reads.push(refId(r))
    return v
  }
  const makeEffect = (spec: EffectSpec, i: number) => {
    const rec: EffectRec = {
      id: `e${i}`,
      deps: [],
      runs: 0,
      last: null,
      live: true,
      cleanupArmed: spec.cleanupThrows,
    }
    h.effRecs[i] = rec // indexed by effect number, whatever the creation order
    const body = () => {
      rec.runs++
      const reads: string[] = []
      rec.deps = reads // visible as a prefix if a read below throws
      const vals = readSeq(spec.sources, spec.cond, (r) => readRef(r, reads))
      rec.last = vals
      if (rec.cleanupArmed) {
        onCleanup(() => {
          rec.cleanupArmed = false
          throw new Error(`c${i}`)
        })
      }
      const s = sum(vals)
      if (spec.throws && s % 7 === 3) throw new Error(`e${i}`)
      if (spec.cascade !== null) {
        const [get, set] = h.sigs[spec.cascade] as Harness["sigs"][number]
        if (untrack(get) !== s) {
          h.cascadeWrites++
          set(s)
        }
      }
    }
    if (spec.kind === "render") createRenderEffect(body)
    else createEffect(body)
  }
  try {
    createRoot((dispose) => {
      h.root = getOwner() as Owner
      h.disposeOuter = dispose
      g.memos.forEach((spec, i) => {
        const rec: NodeRec = { id: `m${i}`, deps: [] }
        h.memoRecs.push(rec)
        h.memoGets.push(
          createMemo(
            () => {
              const reads: string[] = []
              rec.deps = reads
              const on = (h.gates[i] as Harness["gates"][number])[0]()
              reads.push(`g${i}`)
              const vals = readSeq(spec.sources, spec.op === "cond", (r) => readRef(r, reads))
              const v = memoOp(spec, vals)
              if (spec.mayThrow && on && v % 7 === 3) throw new Error(`m${i}`)
              return v
            },
            undefined,
            equalsOption(spec.equals),
          ),
        )
      })
      g.effects.forEach((spec, i) => {
        if (!spec.inner) makeEffect(spec, i)
      })
      if (g.effects.some((e) => e.inner)) {
        createRoot((d) => {
          h.inner = getOwner()
          h.disposeInner = d
          g.effects.forEach((spec, i) => {
            if (spec.inner) makeEffect(spec, i)
          })
        })
      }
      if (g.flags.loops) {
        // H1 shape: effect reads memo m of signal x and writes x+1 while m() < LIMIT
        const mRec: NodeRec = { id: "mL", deps: [] }
        const [x, setX] = h.sigs[0] as Harness["sigs"][number]
        const m = createMemo(() => {
          mRec.deps = ["s0"]
          return x()
        })
        const eRec: EffectRec = {
          id: "eL",
          deps: [],
          runs: 0,
          last: null,
          live: true,
          cleanupArmed: false,
        }
        createEffect(() => {
          eRec.runs++
          const v = m()
          eRec.deps = ["mL"]
          eRec.last = [v]
          if (h.loopActive && v < LOOP_LIMIT_VALUE) setX(v + 1)
        })
        h.loopMemo = mRec
        h.loopEffect = eRec
      }
    })
  } catch (e) {
    h.initError = e
  }
  return h
}

// ---------------------------------------------------------------------------
// Engine: run the ops, checking the selected properties after each
// ---------------------------------------------------------------------------

interface Checks {
  currency?: boolean // P1 / P3
  runs?: boolean // P2
  observers?: boolean // P4
  invariant?: boolean // P5 (I3)
  restClean?: boolean // P5 strengthening, flags-off only
  errors?: boolean // P6
}

const errorLabels = (e: unknown): string[] => {
  if (e === null) return []
  if (e instanceof AggregateError) return e.errors.flatMap(errorLabels)
  const msg = e instanceof Error ? e.message : String(e)
  return msg.startsWith("E-LOOP") ? [] : [msg]
}

/** All live nodes' recorded deps, as id → deps (multiset preserved). */
function depsOf(h: Harness): Map<string, string[]> {
  const out = new Map<string, string[]>()
  for (const m of h.memoRecs) out.set(m.id, [...m.deps])
  if (h.loopMemo) out.set(h.loopMemo.id, [...h.loopMemo.deps])
  for (const e of h.effRecs) if (e.live) out.set(e.id, [...e.deps])
  if (h.loopEffect) out.set(h.loopEffect.id, [...h.loopEffect.deps])
  return out
}

/** Node ids reachable from `changed` through the union of the dep snapshots. */
function reachable(changed: Set<string>, ...snapshots: Array<Map<string, string[]>>): Set<string> {
  const rev = new Map<string, Set<string>>()
  for (const snap of snapshots) {
    for (const [node, deps] of snap) {
      for (const d of deps) {
        let set = rev.get(d)
        if (!set) rev.set(d, (set = new Set()))
        set.add(node)
      }
    }
  }
  const seen = new Set<string>()
  const stack = [...changed]
  while (stack.length) {
    const id = stack.pop() as string
    for (const o of rev.get(id) ?? []) {
      if (!seen.has(o)) {
        seen.add(o)
        stack.push(o)
      }
    }
  }
  return seen
}

function walkTree(node: DebugNode, visit: (n: DebugNode) => void): void {
  visit(node)
  for (const c of node.owned) walkTree(c, visit)
}

function runScenario({ graph: g, ops }: Scenario, checks: Checks): void {
  const h = build(g)
  const model = new Model(g)
  const effectById = new Map<string, number>()
  for (let i = 0; i < g.effects.length; i++) effectById.set(`e${i}`, i)
  const allSignals = new Set(g.init.map((_, i) => `s${i}`))
  /** Effects whose evaluation threw during the last throwing op (P3). */
  let stranded = new Set<string>()

  /** Model-side propagation: cascades settle to a fixed point; returns reached effects. */
  const propagate = (changed: Set<string>, before: Map<string, string[]>): Set<string> => {
    const after = depsOf(h)
    for (;;) {
      const reach = reachable(changed, before, after)
      let progressed = false
      for (const id of reach) {
        const i = effectById.get(id)
        if (i === undefined || !model.live[i]) continue
        const spec = g.effects[i] as EffectSpec
        if (spec.cascade === null) continue
        const r = model.tryEffect(i)
        if ("threw" in r) continue
        const v = sum(r.vals)
        if (model.sig[spec.cascade] !== v) {
          model.sig[spec.cascade] = v
          changed.add(`s${spec.cascade}`)
          progressed = true
        }
      }
      if (!progressed) return reach
    }
  }

  const evalLoop = (): number[] => [model.sig[0] as number]

  const check = (
    label: string,
    reach: Set<string>,
    threw: unknown,
    runsBefore: Map<string, number>,
    kind: "write" | "read" | "dispose" | "loop",
  ) => {
    const ctx = `after ${label}`
    const liveEffects: Array<{ rec: EffectRec; evalNow: () => { vals: number[] } | { threw: string } }> =
      []
    h.effRecs.forEach((rec, i) => {
      if (rec.live) liveEffects.push({ rec, evalNow: () => model.tryEffect(i) })
    })
    if (h.loopEffect) liveEffects.push({ rec: h.loopEffect, evalNow: () => ({ vals: evalLoop() }) })

    // P1/P3: at rest after a non-throwing op every reached effect is current;
    // any effect that ran (for whatever reason) saw the oracle's tuple.
    // The loop op is exempt: E-LOOP skips the offender for the remainder of
    // that flush (R8), so the effects it starved are one step behind by
    // design; the NEXT write to the loop signal is where H1 shows.
    if (checks.currency && kind !== "loop") {
      for (const { rec, evalNow } of liveEffects) {
        const r = evalNow()
        if ("threw" in r) continue // stranded by a throw: cannot be current until re-notified
        const ran = rec.runs > (runsBefore.get(rec.id) ?? 0)
        if (ran || (threw === null && reach.has(rec.id))) {
          expect(rec.last, `${ctx}: ${rec.id} tuple`).toEqual(r.vals)
        }
      }
    }
    // P2: an effect runs at most once per flush plus once per cascade write,
    // and never when nothing it depends on changed (R3/R5).
    if (checks.runs && kind !== "loop" && kind !== "read") {
      for (const { rec } of liveEffects) {
        const delta = rec.runs - (runsBefore.get(rec.id) ?? 0)
        expect(delta, `${ctx}: ${rec.id} runs`).toBeLessThanOrEqual(1 + h.cascadeWrites)
        if (!reach.has(rec.id)) expect(delta, `${ctx}: ${rec.id} ran while unreached`).toBe(0)
      }
    }
    // P4: every source's observer count is exactly the live nodes' recorded reads.
    if (checks.observers) {
      const counts = new Map<string, number>()
      for (const deps of depsOf(h).values())
        for (const d of deps) counts.set(d, (counts.get(d) ?? 0) + 1)
      h.sigs.forEach(([get], i) => {
        expect(__observerCount(get), `${ctx}: observers of s${i}`).toBe(counts.get(`s${i}`) ?? 0)
      })
      h.gates.forEach(([get], i) => {
        expect(__observerCount(get), `${ctx}: observers of g${i}`).toBe(counts.get(`g${i}`) ?? 0)
      })
      h.memoGets.forEach((get, i) => {
        expect(__observerCount(get), `${ctx}: observers of m${i}`).toBe(counts.get(`m${i}`) ?? 0)
      })
    }
    // P5: invariant I3 — a non-CLEAN memo never has a CLEAN observer (it would
    // have missed the mark); and, with no throws or loops, nothing is left
    // marked or queued once a flush has returned.
    if (checks.invariant || checks.restClean) {
      const roots = h.inner ? [h.root, h.inner] : [h.root]
      for (const r of roots) {
        walkTree(__debugTree(r), (n) => {
          if (n.disposed) return
          if (checks.invariant && n.kind === "memo" && n.state !== 0) {
            for (const s of n.observers)
              expect(s, `${ctx}: observer of a marked memo is CLEAN`).toBeGreaterThanOrEqual(1)
          }
          if (checks.restClean && (n.kind === "user" || n.kind === "render")) {
            expect(n.state, `${ctx}: effect left marked at rest`).toBe(0)
            expect(n.queued, `${ctx}: effect left queued at rest`).toBe(false)
          }
        })
      }
    }
  }

  const runsSnapshot = () => {
    const m = new Map<string, number>()
    for (const e of h.effRecs) m.set(e.id, e.runs)
    if (h.loopEffect) m.set(h.loopEffect.id, h.loopEffect.runs)
    return m
  }
  /** Tuples as they stood before the op: what each effect last read (for gating). */
  const lastSnapshot = () => {
    const m = new Map<string, number[] | null>()
    for (const e of h.effRecs) m.set(e.id, e.last)
    return m
  }

  /**
   * Expected error multiset for a write-type op: at most one per reached
   * effect. An effect is validated dep by dep, in read order (R6): a memo dep
   * that throws surfaces its error; a dep whose value changed (a written
   * signal, a memo whose fresh value differs from what the effect last read,
   * or an `equals: false` memo that was reached at all) makes the body run,
   * which surfaces the first throw of the full evaluation; otherwise the
   * effect is gated (R5) and nothing surfaces.
   */
  const expectedErrors = (
    reach: Set<string>,
    changed: Set<string>,
    deps: Map<string, string[]>,
    lastBefore: Map<string, number[] | null>,
  ): string[] => {
    const out: string[] = []
    for (const id of reach) {
      const i = effectById.get(id)
      if (i === undefined || !model.live[i]) continue
      const last = lastBefore.get(id) ?? []
      const bodyError = (): string | null => {
        const r = model.tryEffect(i)
        return "threw" in r ? r.threw : null
      }
      let err: string | null = null
      const order = deps.get(id) ?? []
      for (let idx = 0; idx < order.length; idx++) {
        const d = order[idx] as string
        if (d.startsWith("s")) {
          if (changed.has(d)) {
            err = bodyError()
            break
          }
          continue
        }
        const m = Number(d.slice(1))
        let fresh: number
        try {
          fresh = model.memo(m)
        } catch (e) {
          if (!(e instanceof ModelThrow)) throw e
          err = e.message
          break
        }
        const alwaysChanges = (g.memos[m] as MemoSpec).equals === "false" && reach.has(d)
        if (alwaysChanges || fresh !== last[idx]) {
          err = bodyError()
          break
        }
      }
      if (err !== null) out.push(err)
    }
    return out.sort()
  }

  const afterWrite = (
    label: string,
    changed: Set<string>,
    before: Map<string, string[]>,
    runsBefore: Map<string, number>,
    lastBefore: Map<string, number[] | null>,
    threw: unknown,
  ) => {
    const reach = propagate(changed, before)
    if (checks.errors) {
      // The oracle evaluates every reached memo, so it may record a throwing
      // PREFIX of deps where vint's lazy pull never entered the memo at all
      // and kept its stale edges — vint can therefore legitimately reach (and
      // rethrow from) a superset of what the oracle predicts. What must hold:
      // no duplicates (L3), every predicted error surfaces, and nothing
      // surfaces that cannot throw right now.
      const actual = errorLabels(threw).sort()
      const expected = expectedErrors(reach, changed, before, lastBefore)
      expect(new Set(actual).size, `after ${label}: duplicate errors in ${actual}`).toBe(actual.length)
      for (const e of expected) expect(actual, `after ${label}: missing error ${e}`).toContain(e)
      for (const a of actual) {
        const m = /^m(\d+)$/.exec(a)
        const gated = m ? model.gate[Number(m[1])] === true : false
        expect(expected.includes(a) || gated, `after ${label}: unexpected error ${a}`).toBe(true)
      }
    }
    check(label, reach, threw, runsBefore, "write")
    const next = new Set<string>()
    for (const id of reach) {
      const i = effectById.get(id)
      if (i !== undefined && model.live[i] && "threw" in model.tryEffect(i)) next.add(id)
    }
    // P3 bookkeeping: an effect reached by this op is either current now or freshly stranded
    for (const id of stranded) if (!reach.has(id)) next.add(id)
    stranded = next
  }

  // --- init: every effect is "reached" ---
  {
    const before = depsOf(h)
    const runsBefore = new Map<string, number>()
    afterWrite("init", new Set(allSignals), before, runsBefore, new Map(), h.initError)
  }

  ops.forEach((op, n) => {
    const label = `op#${n} ${JSON.stringify(op)}`
    const before = depsOf(h)
    const runsBefore = runsSnapshot()
    const lastBefore = lastSnapshot()
    h.cascadeWrites = 0
    let threw: unknown = null
    switch (op.op) {
      case "write": {
        const changed = new Set<string>()
        if (model.sig[op.s] !== op.v) {
          model.sig[op.s] = op.v
          changed.add(`s${op.s}`)
        }
        try {
          ;(h.sigs[op.s] as Harness["sigs"][number])[1](op.v)
        } catch (e) {
          threw = e
        }
        afterWrite(label, changed, before, runsBefore, lastBefore, threw)
        break
      }
      case "batch": {
        const changed = new Set<string>()
        for (const [s, v] of op.writes) {
          if (model.sig[s] !== v) {
            model.sig[s] = v
            changed.add(`s${s}`)
          }
        }
        try {
          batch(() => {
            for (const [s, v] of op.writes) (h.sigs[s] as Harness["sigs"][number])[1](v)
          })
        } catch (e) {
          threw = e
        }
        afterWrite(label, changed, before, runsBefore, lastBefore, threw)
        break
      }
      case "flip": {
        model.gate[op.m] = !model.gate[op.m]
        try {
          ;(h.gates[op.m] as Harness["gates"][number])[1]((v) => !v)
        } catch (e) {
          threw = e
        }
        afterWrite(label, new Set([`g${op.m}`]), before, runsBefore, lastBefore, threw)
        break
      }
      case "read": {
        // Top-level untracked read (R5): the value is the oracle's, or the
        // read throws when the oracle does. R10 lets a read that re-activates
        // stranded effects surface THEIR errors; the value is then available
        // on the next read.
        const get = h.memoGets[op.m] as () => number
        let expected: number | null = null
        try {
          expected = model.memo(op.m)
        } catch (e) {
          if (!(e instanceof ModelThrow)) throw e
        }
        let value: number | null = null
        try {
          value = get()
        } catch (e) {
          threw = e
          if (expected !== null) {
            expect(
              errorLabels(e).every((l) => l.startsWith("e") || l.startsWith("m")),
              `${label}: read threw ${e}`,
            ).toBe(true)
            value = get()
            threw = null
          }
        }
        if (expected !== null) expect(value, `${label}: memo value`).toBe(expected)
        else expect(threw, `${label}: read must throw`).not.toBeNull()
        check(label, new Set(), threw, runsBefore, "read")
        break
      }
      case "dispose": {
        try {
          h.disposeInner?.()
        } catch (e) {
          threw = e
        }
        g.effects.forEach((spec, i) => {
          if (spec.inner) {
            model.live[i] = false
            ;(h.effRecs[i] as EffectRec).live = false
          }
        })
        check(label, new Set(), threw, runsBefore, "dispose")
        break
      }
      case "loop": {
        // H1 shape: self-feed through the loop memo until E-LOOP, then stop.
        h.loopActive = true
        const [x, setX] = h.sigs[0] as Harness["sigs"][number]
        try {
          setX(untrack(x) + 1)
        } catch (e) {
          threw = e
        }
        h.loopActive = false
        expect(threw, `${label}: expected E-LOOP`).toBeInstanceOf(Error)
        // an effect that merely READS the looping signal runs 1000+ times too
        // and reports its own E-LOOP, so the result may be an AggregateError
        const messages =
          threw instanceof AggregateError
            ? threw.errors.map((e) => String((e as Error).message))
            : [String((threw as Error).message)]
        expect(
          messages.some((m) => /E-LOOP/.test(m)),
          `${label}: expected E-LOOP`,
        ).toBe(true)
        // resync the oracle with where the loop stopped
        model.sig[0] = untrack(x)
        propagate(new Set(["s0"]), before)
        check(label, new Set(), threw, runsBefore, "loop")
        break
      }
    }
  })

  // Teardown: an armed cleanup (cleanupThrows arm) may fire here; the
  // properties above have already been checked.
  try {
    h.disposeOuter()
    h.disposeInner?.()
  } catch {}
}

const arm = (overrides: Partial<Flags>): Flags => ({ ...OFF, ...overrides })

// ---------------------------------------------------------------------------
// Properties
// ---------------------------------------------------------------------------

describe("property: scheduler vs oracle", () => {
  test("P1/R3+R5+R6+R8+R9 at rest every reached effect's tuple is the oracle's (dynamic deps, gating, cascades, batches)", () => {
    fc.assert(
      fc.property(scenarioArb(OFF), (sc) => runScenario(sc, { currency: true })),
      { seed: SEED, numRuns: RUNS },
    )
  })

  test("P2/R5+R8 per op an effect runs at most 1 + cascade writes, and never when nothing upstream changed", () => {
    fc.assert(
      fc.property(scenarioArb(OFF), (sc) => runScenario(sc, { runs: true })),
      { seed: SEED, numRuns: RUNS },
    )
  })

  test("P4/O1+O5 after every op (and disposal) each source's observer count is the live nodes' recorded reads", () => {
    fc.assert(
      fc.property(scenarioArb(OFF), (sc) => runScenario(sc, { observers: true })),
      { seed: SEED, numRuns: RUNS },
    )
  })

  test("P5/R6+R8 white-box: I3 (a marked memo never has a CLEAN observer) and nothing stays marked or queued at rest", () => {
    fc.assert(
      fc.property(scenarioArb(OFF), (sc) => runScenario(sc, { invariant: true, restClean: true })),
      { seed: SEED, numRuns: RUNS },
    )
  })

  // --- flagged arms: known defects, promoted to `test` when VINT_FULL=1 ---

  flagged(
    "P3/R10 [H2] after a memo throw, the next upstream write brings every reached effect current (memo→memo→effect, diamonds)",
    () => {
      fc.assert(
        fc.property(scenarioArb(arm({ throws: true, cascades: false })), (sc) =>
          runScenario(sc, { currency: true, invariant: true }),
        ),
        { seed: SEED, numRuns: RUNS },
      )
    },
  )

  flagged(
    "P3/R8 [H1] E-LOOP through a memo is per-flush: the effect resumes on the next write to the loop signal",
    () => {
      fc.assert(
        fc.property(scenarioArb(arm({ loops: true, cascades: false })), (sc) =>
          runScenario(sc, { currency: true, runs: true, invariant: true }),
        ),
        { seed: SEED, numRuns: 100 },
      )
    },
  )

  flagged(
    "P6/R10 [L3] the errors rethrown after an op are exactly one per throwing reached effect — no duplicates",
    () => {
      fc.assert(
        fc.property(scenarioArb(arm({ throws: true, cascades: false })), (sc) =>
          runScenario(sc, { errors: true }),
        ),
        { seed: SEED, numRuns: RUNS },
      )
    },
  )

  flagged(
    "P6/R10 [L3] scripted: a validation-time memo throw is reported once per flush, even when a later promotion re-queues the effect",
    () => {
      // E's validation pulls m1 (throws) and stops; E' then pulls m0, whose
      // change promotes E again — runQueue had already cleared E's `queued`
      // flag, so E is processed a second time and the same error surfaces
      // twice as "2 effects threw".
      const [s, setS] = createSignal(0)
      let gate = false
      createRoot(() => {
        const m1 = createMemo(() => {
          const v = s()
          if (gate) throw new Error("m1")
          return v
        })
        const m0 = createMemo(() => s() * 2)
        createEffect(() => {
          m1()
          m0()
        })
        createEffect(() => {
          m0()
        })
      })
      gate = true
      let caught: unknown = null
      try {
        setS(1)
      } catch (e) {
        caught = e
      }
      expect(errorLabels(caught)).toEqual(["m1"])
    },
  )

  flagged(
    "P1/O2 [M2] a throwing onCleanup never stops the re-run: the body still runs and the effect stays current",
    () => {
      fc.assert(
        fc.property(scenarioArb(arm({ cleanupThrows: true })), (sc) =>
          runScenario(sc, { currency: true }),
        ),
        { seed: SEED, numRuns: RUNS },
      )
    },
  )

  flagged(
    "P4/O2+O5 [M2] a throwing onCleanup never aborts a scope reset (re-run or disposal): subscriptions stay exact",
    () => {
      fc.assert(
        fc.property(scenarioArb(arm({ cleanupThrows: true })), (sc) =>
          runScenario(sc, { observers: true }),
        ),
        { seed: SEED, numRuns: RUNS },
      )
    },
  )
})

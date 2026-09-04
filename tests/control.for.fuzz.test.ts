// Contract group G — For (C2) fuzz: random keyed-list sequences checked
// against a model after every step (assessment §9 Phase 1, item 3).
//
// Flags: VINT_FULL=1 turns on the arms that reproduce KNOWN defects the
// Phase 3 rewrite will fix. Those arms are `test.fails` — vitest passes them
// only while they throw — so a fix forces their promotion to `test`.
import { beforeEach, describe, expect, test, vi } from "vitest"
import type { Accessor, Child } from "../src/index"
import { createSignal, For, mount, Show, tags } from "../src/index"
import { __observerCount } from "../src/reactive"
import { FULL } from "./helpers/flags"

/** Arms that reproduce a known defect: off by default, `test.fails` under VINT_FULL. */
const knownDefect = FULL ? test.fails : test.skip

const { li, ul } = tags

let host: HTMLDivElement
beforeEach(() => {
  document.body.innerHTML = ""
  host = document.createElement("div")
  document.body.append(host)
})

// ---------------------------------------------------------------------------
// Deterministic PRNG (mulberry32) — fixed seeds make every failure replayable
// ---------------------------------------------------------------------------

type Rng = { next(): number; int(n: number): number; pick<T>(xs: readonly T[]): T }

function rng(seed: number): Rng {
  let a = seed >>> 0
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const int = (n: number) => Math.floor(next() * n)
  return { next, int, pick: (xs) => xs[int(xs.length)] as (typeof xs)[number] }
}

const SEEDS = [1, 7, 42, 1337, 20260904, 0xdeadbeef]
const STEPS = 200
const MAX_ROWS = 40

// ---------------------------------------------------------------------------
// Reference helpers
// ---------------------------------------------------------------------------

/** O(n²) longest strictly-increasing subsequence — the C2 minimality oracle. */
function lisLength(seq: readonly number[]): number {
  const best = seq.map(() => 1)
  for (let i = 0; i < seq.length; i++) {
    for (let j = 0; j < i; j++) {
      if ((seq[j] as number) < (seq[i] as number) && (best[j] as number) + 1 > (best[i] as number)) {
        best[i] = (best[j] as number) + 1
      }
    }
  }
  return best.length ? Math.max(...best) : 0
}

/** Top-level `insertBefore` calls on `parent` made while `fn` runs. happy-dom
 *  expands a fragment by re-entering the public `insertBefore` once per
 *  child; those nested calls are NOT counted, so a new row (inserted as one
 *  fragment) costs exactly one call and a moved row one per node it owns.
 *  Inserts into OTHER nodes (a new row's text binding filling its own `li`)
 *  are not the list's reconcile and are ignored. */
function countInserts(parent: Node, fn: () => void): Node[] {
  const proto = Node.prototype
  const original = proto.insertBefore
  const calls: Node[] = []
  let depth = 0
  proto.insertBefore = function (this: Node, node: Node, ref: Node | null) {
    if (depth === 0 && this === parent) calls.push(node)
    const fragment = node.nodeType === 11
    if (fragment) depth++
    try {
      return original.call(this, node, ref)
    } finally {
      if (fragment) depth--
    }
  } as typeof original
  try {
    fn()
  } finally {
    proto.insertBefore = original
  }
  return calls
}

const isComment = (n: Node | null | undefined, data: string): boolean =>
  !!n && n.nodeType === 8 && (n as Comment).data === data

/** Every `<!--row-->` anchor anywhere under `root`. */
function rowAnchors(root: Node, out: Comment[] = []): Comment[] {
  for (const child of root.childNodes) {
    if (isComment(child, "row")) out.push(child as Comment)
    rowAnchors(child, out)
  }
  return out
}

/** Structural oracle for one For's range. Between `<!--for-->` and
 *  `<!--/for-->` there must be exactly: `<!--row-->` + `<li>` per model row
 *  (in order, `data-id` = id, text = expected), or the fallback alone while
 *  empty. Anything else — a duplicate anchor, an orphaned fallback, a stray
 *  text node — is a failure. */
function checkForRange(
  parent: Element,
  ids: readonly string[],
  textOf: (id: string) => string,
  fallback: { selector: string; text: string; shape: readonly string[] } | null,
): HTMLLIElement[] {
  const nodes = [...parent.childNodes]
  expect(isComment(nodes[0], "for")).toBe(true)
  expect(isComment(nodes[nodes.length - 1], "/for")).toBe(true)
  const inner = nodes.slice(1, -1)
  const lis: HTMLLIElement[] = []
  if (ids.length === 0) {
    if (fallback) {
      expect(inner.map((n) => n.nodeName)).toEqual(fallback.shape)
      const only = inner[fallback.shape.indexOf("LI")] as HTMLLIElement
      expect(only.matches(fallback.selector)).toBe(true)
      expect(only.textContent).toBe(fallback.text)
    } else {
      expect(inner).toEqual([])
    }
    return lis
  }
  expect(inner.length).toBe(ids.length * 2)
  for (let i = 0; i < ids.length; i++) {
    const anchor = inner[2 * i] as Node
    const row = inner[2 * i + 1] as HTMLLIElement
    expect(isComment(anchor, "row")).toBe(true)
    expect(row.nodeName).toBe("LI")
    expect(row.getAttribute("data-id")).toBe(ids[i])
    expect(row.textContent).toBe(textOf(ids[i] as string))
    lis.push(row)
  }
  if (fallback) expect(parent.querySelector(fallback.selector)).toBeNull()
  return lis
}

/** Rows whose id survived a step must be the very same element (C2). */
function checkIdentity(
  seen: Map<string, Element>,
  ids: readonly string[],
  lis: readonly Element[],
): void {
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i] as string
    const prev = seen.get(id)
    if (prev) expect(lis[i]).toBe(prev)
  }
  seen.clear()
  for (let i = 0; i < ids.length; i++) seen.set(ids[i] as string, lis[i] as Element)
}

/** C2 minimality: new rows cost one insert each (one fragment), retained rows
 *  off a longest increasing subsequence of their previous positions cost
 *  `nodesPerRow` each, and nothing else moves. */
function expectMinimal(
  calls: readonly Node[],
  prevIds: readonly string[],
  nextIds: readonly string[],
  nodesPerRow: number,
  fallbackInserts: number,
): void {
  const prevPos = new Map(prevIds.map((id, i) => [id, i]))
  const retained: number[] = []
  let fresh = 0
  for (const id of nextIds) {
    const p = prevPos.get(id)
    if (p === undefined) fresh++
    else retained.push(p)
  }
  const moved = retained.length - lisLength(retained)
  const becameEmpty = prevIds.length > 0 && nextIds.length === 0
  const fragments = calls.filter((n) => n.nodeType === 11).length
  const anchors = calls.filter((n) => isComment(n, "row")).length
  expect(fragments).toBe(fresh)
  expect(anchors).toBe(moved)
  expect(calls.length).toBe(fresh + moved * nodesPerRow + (becameEmpty ? fallbackInserts : 0))
}

// ---------------------------------------------------------------------------
// Keyed rows { id, label }
// ---------------------------------------------------------------------------

type Row = { id: number; label: string }

const OPS = [
  "insert",
  "remove",
  "move",
  "shuffle",
  "update",
  "clear",
  "fresh",
  "reverse",
  "replace",
  "tick",
] as const
type Op = (typeof OPS)[number]

function shuffled<T>(xs: readonly T[], r: Rng): T[] {
  const out = [...xs]
  for (let i = out.length - 1; i > 0; i--) {
    const j = r.int(i + 1)
    const t = out[i] as T
    out[i] = out[j] as T
    out[j] = t
  }
  return out
}

/** Immutable model step. `ids` hands out never-seen ids. */
function stepRows(model: readonly Row[], op: Op, r: Rng, ids: { next: number }): Row[] {
  const fresh = (): Row => ({ id: ids.next++, label: `L${r.int(1000)}` })
  const n = model.length
  switch (op) {
    case "insert": {
      if (n >= MAX_ROWS) return model.filter((_, i) => i !== r.int(n))
      const at = r.int(n + 1)
      return [...model.slice(0, at), fresh(), ...model.slice(at)]
    }
    case "remove":
      return n ? model.filter((_, i) => i !== r.int(n)) : model.slice()
    case "move": {
      if (n < 2) return model.slice()
      const from = r.int(n)
      const rest = model.filter((_, i) => i !== from)
      const to = r.int(rest.length + 1)
      return [...rest.slice(0, to), model[from] as Row, ...rest.slice(to)]
    }
    case "shuffle": {
      if (n < 2) return model.slice()
      const a = r.int(n)
      const b = a + 1 + r.int(n - a)
      return [...model.slice(0, a), ...shuffled(model.slice(a, b), r), ...model.slice(b)]
    }
    case "update": {
      if (!n) return model.slice()
      const i = r.int(n)
      return model.map((row, j) => (j === i ? { ...row, label: `U${r.int(1000)}` } : row))
    }
    case "clear":
      return []
    case "fresh": {
      // half the time keep a shuffled subset of the current rows, so the new
      // list mixes retained (reordered) and brand-new rows
      const kept = r.next() < 0.5 ? shuffled(model, r).slice(0, r.int(n + 1)) : []
      const added = Array.from({ length: r.int(12) }, fresh)
      return shuffled([...kept, ...added], r)
    }
    case "reverse":
      return [...model].reverse()
    case "replace": {
      if (!n) return [fresh()]
      const i = r.int(n)
      return model.map((row, j) => (j === i ? fresh() : row))
    }
    case "tick":
      return model.slice()
  }
}

type KeyedOptions = {
  seed: number
  steps: number
  /** Built once the shared signal exists, so a fallback may read it. */
  fallback: (shared: Accessor<number>) => () => Child
  /** Fallback oracle: what sits between the markers while empty, or how many
   *  top-level inserts the fallback costs. `null` skips minimality on the
   *  step that becomes empty (the fallback's own shape is not under test). */
  fallbackOracle: {
    selector: string
    text: (shared: number) => string
    /** Node names between the For markers while empty (a live fallback adds its own markers). */
    shape: readonly string[]
    inserts: number | null
  }
  /** Observers the fallback itself holds on `shared` while shown. */
  fallbackObservers: number
}

function runKeyedFuzz(opts: KeyedOptions): void {
  const r = rng(opts.seed)
  const ids = { next: 0 }
  const [shared, setShared] = createSignal(0)
  const baseline = __observerCount(shared)
  let model: Row[] = Array.from({ length: 8 }, () => ({ id: ids.next++, label: `L${r.int(1000)}` }))
  const [rows, setRows] = createSignal<readonly Row[]>(model)
  const dispose = mount(host, () =>
    ul(
      For({
        each: rows,
        key: (row) => row.id,
        fallback: opts.fallback(shared),
        children: (item, index) =>
          li({ "data-id": () => String(item().id) }, () => `${index()}:${item().label}:${shared()}`),
      }),
    ),
  )
  const list = host.querySelector("ul") as HTMLUListElement
  const seen = new Map<string, Element>()
  let tick = 0

  const check = (prev: readonly Row[], calls: readonly Node[] | null) => {
    const idList = model.map((row) => String(row.id))
    const textOf = (id: string) => {
      const i = model.findIndex((row) => String(row.id) === id)
      return `${i}:${(model[i] as Row).label}:${tick}`
    }
    const lis = checkForRange(list, idList, textOf, {
      selector: opts.fallbackOracle.selector,
      text: opts.fallbackOracle.text(tick),
      shape: opts.fallbackOracle.shape,
    })
    checkIdentity(seen, idList, lis)
    expect(__observerCount(shared)).toBe(
      baseline + model.length + (model.length === 0 ? opts.fallbackObservers : 0),
    )
    if (calls) {
      const prevIds = prev.map((row) => String(row.id))
      const becameEmpty = prev.length > 0 && model.length === 0
      if (!(becameEmpty && opts.fallbackOracle.inserts === null)) {
        expectMinimal(calls, prevIds, idList, 2, opts.fallbackOracle.inserts ?? 0)
      }
    }
  }

  check(model, null)
  for (let step = 0; step < opts.steps; step++) {
    const op = r.pick(OPS)
    const prev = model
    model = stepRows(model, op, r, ids)
    const calls = countInserts(list, () => {
      if (op === "tick") setShared(++tick)
      else setRows(model)
    })
    check(prev, calls)
  }
  dispose()
  expect(host.childNodes.length).toBe(0)
  expect(__observerCount(shared)).toBe(baseline)
}

// ---------------------------------------------------------------------------
// Primitive keys (unique strings, default identity key)
// ---------------------------------------------------------------------------

function stepStrings(model: readonly string[], op: Op, r: Rng, ids: { next: number }): string[] {
  const fresh = () => `s${ids.next++}`
  const n = model.length
  switch (op) {
    case "insert": {
      if (n >= MAX_ROWS) return model.filter((_, i) => i !== r.int(n))
      const at = r.int(n + 1)
      return [...model.slice(0, at), fresh(), ...model.slice(at)]
    }
    case "remove":
      return n ? model.filter((_, i) => i !== r.int(n)) : model.slice()
    case "move": {
      if (n < 2) return model.slice()
      const from = r.int(n)
      const rest = model.filter((_, i) => i !== from)
      const to = r.int(rest.length + 1)
      return [...rest.slice(0, to), model[from] as string, ...rest.slice(to)]
    }
    case "shuffle": {
      if (n < 2) return model.slice()
      const a = r.int(n)
      const b = a + 1 + r.int(n - a)
      return [...model.slice(0, a), ...shuffled(model.slice(a, b), r), ...model.slice(b)]
    }
    case "clear":
      return []
    case "fresh":
      return Array.from({ length: r.int(12) }, fresh)
    case "reverse":
      return [...model].reverse()
    case "replace": {
      if (!n) return [fresh()]
      const i = r.int(n)
      return model.map((s, j) => (j === i ? fresh() : s))
    }
    case "update":
    case "tick":
      return model.slice()
  }
}

function runPrimitiveFuzz(seed: number, steps: number): void {
  const r = rng(seed)
  const ids = { next: 0 }
  const [shared, setShared] = createSignal(0)
  const baseline = __observerCount(shared)
  let model: string[] = Array.from({ length: 6 }, () => `s${ids.next++}`)
  const [items, setItems] = createSignal<readonly string[]>(model)
  const dispose = mount(host, () =>
    ul(
      For({
        each: items,
        fallback: () => li({ class: "empty" }, "empty"),
        children: (item, index) => li({ "data-id": item }, () => `${index()}:${item()}:${shared()}`),
      }),
    ),
  )
  const list = host.querySelector("ul") as HTMLUListElement
  const seen = new Map<string, Element>()
  let tick = 0
  const check = (prev: readonly string[], calls: readonly Node[] | null) => {
    const textOf = (id: string) => `${model.indexOf(id)}:${id}:${tick}`
    const lis = checkForRange(list, model, textOf, {
      selector: "li.empty",
      text: "empty",
      shape: ["LI"],
    })
    checkIdentity(seen, model, lis)
    expect(__observerCount(shared)).toBe(baseline + model.length)
    if (calls) expectMinimal(calls, prev, model, 2, 1)
  }
  check(model, null)
  for (let step = 0; step < steps; step++) {
    const op = r.pick(OPS)
    const prev = model
    model = stepStrings(model, op, r, ids)
    const calls = countInserts(list, () => {
      if (op === "tick") setShared(++tick)
      else setItems(model)
    })
    check(prev, calls)
  }
  dispose()
  expect(host.childNodes.length).toBe(0)
  expect(__observerCount(shared)).toBe(baseline)
}

// ---------------------------------------------------------------------------
// Nested: every row renders an inner For over its own mutable sub-list
// ---------------------------------------------------------------------------

type Group = { id: number; label: string; kids: readonly string[] }

const KID_OPS = ["addKid", "dropKid", "shuffleKids", "clearKids", "refillKids"] as const
type KidOp = (typeof KID_OPS)[number]

function stepKids(kids: readonly string[], op: KidOp, r: Rng, ids: { next: number }): string[] {
  const fresh = () => `k${ids.next++}`
  switch (op) {
    case "addKid": {
      if (kids.length >= 6) return kids.filter((_, i) => i !== r.int(kids.length))
      const at = r.int(kids.length + 1)
      return [...kids.slice(0, at), fresh(), ...kids.slice(at)]
    }
    case "dropKid":
      return kids.length ? kids.filter((_, i) => i !== r.int(kids.length)) : []
    case "shuffleKids":
      return shuffled(kids, r)
    case "clearKids":
      return []
    case "refillKids":
      return Array.from({ length: 1 + r.int(4) }, fresh)
  }
}

function runNestedFuzz(seed: number, steps: number): void {
  const r = rng(seed)
  const ids = { next: 0 }
  const [shared, setShared] = createSignal(0)
  const baseline = __observerCount(shared)
  const freshGroup = (): Group => ({
    id: ids.next++,
    label: `G${r.int(1000)}`,
    kids: Array.from({ length: r.int(4) }, () => `k${ids.next++}`),
  })
  let model: Group[] = Array.from({ length: 4 }, freshGroup)
  const [groups, setGroups] = createSignal<readonly Group[]>(model)
  const dispose = mount(host, () =>
    ul(
      For({
        each: groups,
        key: (g) => g.id,
        fallback: () => li({ class: "empty" }, "empty"),
        children: (item) =>
          li(
            { "data-id": () => String(item().id) },
            () => `${item().label}:${shared()}`,
            ul(
              For({
                each: () => item().kids,
                children: (kid) => li({ "data-id": kid }, () => `[${kid()}]`),
              }),
            ),
          ),
      }),
    ),
  )
  const outer = host.querySelector("ul") as HTMLUListElement
  const seen = new Map<string, Element>()
  let tick = 0
  const check = () => {
    const idList = model.map((g) => String(g.id))
    const rowText = (g: Group) => `${g.label}:${tick}${g.kids.map((k) => `[${k}]`).join("")}`
    const lis = checkForRange(
      outer,
      idList,
      (id) => rowText(model.find((g) => String(g.id) === id) as Group),
      { selector: "li.empty", text: "empty", shape: ["LI"] },
    )
    checkIdentity(seen, idList, lis)
    for (let i = 0; i < model.length; i++) {
      const inner = (lis[i] as HTMLLIElement).querySelector("ul") as HTMLUListElement
      checkForRange(inner, (model[i] as Group).kids, (k) => `[${k}]`, null)
    }
    expect(host.textContent).toBe(model.length ? model.map(rowText).join("") : "empty")
    // every <!--row--> anchor in the tree belongs to exactly one live row
    expect(rowAnchors(host).length).toBe(model.length + model.reduce((n, g) => n + g.kids.length, 0))
    expect(__observerCount(shared)).toBe(baseline + model.length)
  }
  check()
  for (let step = 0; step < steps; step++) {
    if (r.next() < 0.5 && model.length) {
      // mutate one row's kids immutably (same id, new object)
      const i = r.int(model.length)
      const op = r.pick(KID_OPS)
      model = model.map((g, j) => (j === i ? { ...g, kids: stepKids(g.kids, op, r, ids) } : g))
      setGroups(model)
    } else {
      const op = r.pick(OPS)
      if (op === "tick") setShared(++tick)
      else {
        // reuse the flat-row stepper for order/membership; regenerate kids for new rows
        const asRows = model.map((g) => ({ id: g.id, label: g.label }))
        const next = stepRows(asRows, op, r, ids)
        const byId = new Map(model.map((g) => [g.id, g]))
        model = next.map((row) => {
          const prev = byId.get(row.id)
          return prev && prev.label === row.label
            ? prev
            : { id: row.id, label: row.label, kids: prev ? prev.kids : freshGroup().kids }
        })
        setGroups(model)
      }
    }
    check()
  }
  dispose()
  expect(host.childNodes.length).toBe(0)
  expect(__observerCount(shared)).toBe(baseline)
}

// ---------------------------------------------------------------------------

describe("For fuzz", () => {
  const plainFallback = {
    fallback: () => () => li({ class: "empty" }, "empty"),
    fallbackOracle: { selector: "li.empty", text: () => "empty", shape: ["LI"], inserts: 1 },
    fallbackObservers: 0,
  }

  test.each(SEEDS)(
    "G62/C2 keyed rows, %i: DOM order, anchors, identity, observers and LIS-minimality hold after every step",
    (seed) => {
      runKeyedFuzz({ seed, steps: STEPS, ...plainFallback })
    },
  )

  test("G63/C2 primitive keys (unique strings): the same invariants hold", () => {
    runPrimitiveFuzz(99, 100)
  })

  test.each([3, 11])("G64/C2 nested For per row, %i: texts and anchor uniqueness hold", (seed) => {
    // A label-only row update re-runs the inner `each` with the SAME kids
    // array: assessment L7's E-FOR-SAMEREF false positive. Tolerated here —
    // and only that code — so the test is quiet now and unchanged once fixed.
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    try {
      runNestedFuzz(seed, 80)
      const codes = new Set(warn.mock.calls.map((c) => String(c[0]).match(/E-[A-Z-]+/)?.[0]))
      codes.delete("E-FOR-SAMEREF")
      expect([...codes]).toEqual([])
    } finally {
      warn.mockRestore()
    }
  })

  // Assessment H3: a fallback whose top-level child is a live binding (a Show
  // here) leaves its nodes behind when rows appear — the range check finds
  // the orphaned `li.empty` between the rows. Promote to `test` once fixed.
  knownDefect(
    "G65/C2+D9 KNOWN(H3) keyed rows with a live-binding fallback: no orphan after empty→rows",
    () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
      try {
        runKeyedFuzz({
          seed: 5,
          steps: 120,
          fallback: (shared) => () =>
            Show({
              when: () => shared() >= 0,
              children: () => li({ class: "empty" }, () => `empty:${shared()}`),
            }),
          fallbackOracle: {
            selector: "li.empty",
            text: (s) => `empty:${s}`,
            shape: ["#comment", "LI", "#comment"],
            inserts: null,
          },
          fallbackObservers: 2, // Show's memo + the li's text binding
        })
      } finally {
        warn.mockRestore()
      }
    },
  )
})

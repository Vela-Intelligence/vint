// Type-level test for createResource (contract A1, A4). Compiled by
// `npm run typecheck`, never executed: every `@ts-expect-error` line FAILS
// the build if the expression below it is NOT a type error, and every plain
// line fails the build if it IS one.

import type { ResourceAccessor, ResourceControls, Setter } from "../../src/index"
import { createResource, createSignal } from "../../src/index"

/** Exact type equality — assignability alone would let `Promise<T>` pass for `Promise<T | undefined>`. */
type Equal<A, B> = (<X>() => X extends A ? 1 : 2) extends <X>() => X extends B ? 1 : 2 ? true : false
declare function expectType<T>(value: T): void

type User = { id: number }

// --- overload 1: fetcher only --------------------------------------------

const [user, userCtl] = createResource(async () => ({ id: 1 }) as User)
expectType<ResourceAccessor<User>>(user)
expectType<ResourceControls<User>>(userCtl)
expectType<boolean>(user.loading)
expectType<unknown>(user.error)
const dataIsOptional: Equal<ReturnType<typeof user>, User | undefined> = true
// @ts-expect-error data() is T | undefined without an initialValue
expectType<User>(user())
// @ts-expect-error there is no `state` — `loading` and `data()` already say it (A1)
void user.state
// @ts-expect-error there is no `latest` — data() keeps the last value (A1)
void user.latest

// --- overload 2: source + fetcher -----------------------------------------

const [id] = createSignal<number | null>(null)
const [byId] = createResource(id, async (n) => {
  expectType<number>(n) // falsy source values never reach the fetcher
  return `user-${n}`
})
expectType<ResourceAccessor<string>>(byId)
const byIdIsOptional: Equal<ReturnType<typeof byId>, string | undefined> = true
// Referencing `info` in an untyped fetcher fixes T before the return type is
// seen (TS infers `unknown`, as with Solid's fetcher) — give T explicitly then.
const [typedInfo] = createResource<string, number | null>(id, async (n, info) => {
  expectType<number>(n)
  expectType<string | undefined>(info.value)
  expectType<unknown>(info.refetching)
  return `user-${n}`
})
expectType<ResourceAccessor<string>>(typedInfo)
// @ts-expect-error the fetcher's source parameter is the narrowed source value
createResource(id, async (n: string) => n)
// @ts-expect-error a source must be an accessor
createResource(5, async () => 1)

// --- initialValue narrows data() to T --------------------------------------

const [seeded, seededCtl] = createResource(async () => 1, { initialValue: 0 })
const seededIsT: Equal<ReturnType<typeof seeded>, number> = true
expectType<number>(seeded())
const [seededById, seededByIdCtl] = createResource(id, async (n) => n * 2, {
  initialValue: 0,
  name: "double",
})
const seededByIdIsT: Equal<ReturnType<typeof seededById>, number> = true
expectType<Setter<number>>(seededCtl.mutate)
expectType<number>(seededCtl.mutate((prev) => prev + 1))
expectType<number>(seededByIdCtl.mutate(3))
// @ts-expect-error initialValue must be a T
createResource(async () => 1, { initialValue: "zero" })
// @ts-expect-error no `storage` option (stores are a non-goal)
createResource(async () => 1, { storage: undefined })
// @ts-expect-error no SSR options (`ssrLoadFrom`, `onHydrated`, `deferStream` are non-goals)
createResource(async () => 1, { ssrLoadFrom: "initial" })
// @ts-expect-error a misspelt option is caught
createResource(async () => 1, { initalValue: 0 })

// --- controls (A4) ----------------------------------------------------------

const refetchIsPromise: Equal<ReturnType<typeof userCtl.refetch>, Promise<User | undefined>> = true
userCtl.refetch()
userCtl.refetch("why")
userCtl.refetch(null)
userCtl.refetch(0)
userCtl.refetch(false)
expectType<Setter<User | undefined>>(userCtl.mutate)
expectType<User | undefined>(userCtl.mutate((prev) => (prev ? { id: prev.id + 1 } : { id: 0 })))
expectType<User | undefined>(userCtl.mutate({ id: 5 }))
expectType<User | undefined>(userCtl.mutate(undefined))
// @ts-expect-error mutate takes a T (or an updater to one), never another type
userCtl.mutate("nope")
// @ts-expect-error the updater must return a T
userCtl.mutate((prev) => String(prev))
// @ts-expect-error refetch takes at most one argument
userCtl.refetch(1, 2)

void dataIsOptional
void byIdIsOptional
void seededIsT
void seededByIdIsT
void refetchIsPromise

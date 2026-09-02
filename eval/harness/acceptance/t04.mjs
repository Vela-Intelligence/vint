// 04-fetch acceptance — controlled promises so races are deterministic
export async function accept({ module, container, helpers: h }) {
  const calls = []
  const deps = {
    fetchUser(id) {
      let resolve, reject
      const promise = new Promise((res, rej) => {
        resolve = res
        reject = rej
      })
      calls.push({ id: Number(id), resolve, reject })
      return promise
    },
  }

  module.mountApp(container, deps)
  await h.settle()

  h.assert(calls.length === 1 && calls[0].id === 1, `must load id 1 on mount (calls: ${JSON.stringify(calls.map((c) => c.id))})`)
  h.assert(h.visibleWithText(container, "loading"), `"loading" must be visible while the first load is in flight (got: ${h.snapshot(container)})`)

  calls[0].resolve({ name: "Ada" })
  await h.settle()
  h.assert(h.visibleWithText(container, "Ada"), `after resolve: "Ada" missing (got: ${h.snapshot(container)})`)
  h.assert(!h.visibleWithText(container, "loading"), `"loading" must disappear after success`)

  const next = h.byText(container, "next")
  h.assert(next, `no "next" button`)

  await h.click(next) // id 2 in flight
  h.assert(h.visibleWithText(container, "loading"), `"loading" must show while id 2 is in flight`)
  await h.click(next) // id 3 in flight; id 2 still pending
  h.assert(
    calls.map((c) => c.id).join(",") === "1,2,3",
    `expected fetches for 1,2,3 — got ${JSON.stringify(calls.map((c) => c.id))}`,
  )

  calls[2].resolve({ name: "Cyd" })
  await h.settle()
  h.assert(h.visibleWithText(container, "Cyd"), `latest response (Cyd) must be shown (got: ${h.snapshot(container)})`)
  h.assert(!h.visibleWithText(container, "loading"), `"loading" must clear once the latest load settles`)

  calls[1].resolve({ name: "Bob" }) // stale — must be ignored
  await h.settle()
  h.assert(h.visibleWithText(container, "Cyd") && !h.visibleWithText(container, "Bob"), `stale response (Bob) must be discarded — display shows: ${h.snapshot(container)}`)

  await h.click(next) // id 4
  calls[3].reject(new Error("nope"))
  await h.settle()
  h.assert(h.visibleWithText(container, "error: nope"), `rejection must render "error: nope" (got: ${h.snapshot(container)})`)
  h.assert(!h.visibleWithText(container, "loading"), `"loading" must clear after an error`)
}

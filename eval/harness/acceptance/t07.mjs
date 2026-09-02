// 07-subscriptions acceptance — exact subscription discipline
export async function accept({ module, container, helpers: h }) {
  const active = new Map() // id -> { channel, cb }
  let nextId = 0
  let maxActive = 0
  const deps = {
    subscribe(channel, cb) {
      const id = nextId++
      active.set(id, { channel, cb })
      maxActive = Math.max(maxActive, active.size)
      return () => active.delete(id)
    },
  }
  const push = async (channel, msg) => {
    for (const sub of [...active.values()]) if (sub.channel === channel) sub.cb(msg)
    await h.settle()
  }
  const activeChannels = () => [...active.values()].map((s) => s.channel).join(",")

  module.mountApp(container, deps)
  await h.settle()

  const toggle = h.byText(container, "toggle")
  const chanA = h.byText(container, "A")
  const chanB = h.byText(container, "B")
  h.assert(toggle && chanA && chanB, `missing toggle/A/B buttons (got: ${h.snapshot(container)})`)
  h.assert(active.size === 0, "monitor starts OFF — no subscription may exist yet")
  h.assert(h.visibleWithText(container, "off"), `"off" must be shown initially`)

  await h.click(toggle)
  h.assert(active.size === 1 && activeChannels() === "A", `ON must mean exactly one subscription on A (have: [${activeChannels()}])`)
  h.assert(h.visibleWithText(container, "last: none"), `"last: none" must show before any message (got: ${h.snapshot(container)})`)

  await push("A", "hello")
  h.assert(h.visibleWithText(container, "last: hello"), `message must display (got: ${h.snapshot(container)})`)

  await h.click(chanB)
  h.assert(active.size === 1 && activeChannels() === "B", `switching must move the single subscription to B (have: [${activeChannels()}])`)
  const before = h.snapshot(container)
  await push("A", "stale-A") // nothing listens — display must not change
  h.assert(!container.textContent.includes("stale-A"), "a message on the abandoned channel must not display")
  h.assert(h.snapshot(container) === before, "display must be unchanged by the stale channel message")
  await push("B", "world")
  h.assert(h.visibleWithText(container, "last: world"), `B message must display (got: ${h.snapshot(container)})`)

  await h.click(toggle) // OFF
  h.assert(active.size === 0, "OFF must unsubscribe")
  h.assert(h.visibleWithText(container, "off"), `"off" must show again`)
  const savedCb = maxActive // sanity below

  // rapid toggling must never stack subscriptions
  await h.click(toggle)
  await h.click(toggle)
  await h.click(toggle)
  await h.click(chanA)
  await h.click(chanB)
  await h.click(chanA)
  h.assert(active.size === 1 && activeChannels() === "A", `after rapid toggling/switching: exactly one subscription on A (have: [${activeChannels()}])`)
  h.assert(maxActive <= 1, `subscriptions stacked: ${maxActive} were active at once — every (re)subscribe needs a paired unsubscribe`)
  h.assert(savedCb <= 1, "subscription discipline must hold for the whole run")
}

Build a live channel monitor with exact subscription discipline.

Your `mountApp(container, deps)` receives `deps.subscribe`:

    deps.subscribe(channel: "A" | "B", cb: (msg: string) => void): () => void

It registers `cb` for messages on that channel and returns an unsubscribe
function. Use ONLY this for receiving data.

Requirements (all texts exact):

- A button whose text is `toggle`. The monitor starts OFF.
- Buttons whose texts are `A` and `B` choose the channel (initially `A`).
- While OFF, an element whose text is `off` is shown, and there must be NO
  active subscription.
- While ON, the app is subscribed to exactly the chosen channel and shows
  `last: M` where M is the most recently received message on that
  subscription, or `last: none` before any message arrives.
- Switching channels while ON must unsubscribe from the old channel and
  subscribe to the new one.
- Toggling OFF must unsubscribe. Messages delivered to a stale callback
  must never update the display.
- STRICT: at no point may more than ONE subscription be active, no matter
  how quickly the user toggles or switches channels. Every subscribe must
  be paired with exactly one unsubscribe.

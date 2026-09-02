import { createMemo, createSignal } from "solid-js"
import { render } from "solid-js/web"

function App() {
  const [n, setN] = createSignal(0)
  const doubled = createMemo(() => n() * 2)
  return (
    <div>
      <button onClick={() => setN((c) => c + 1)}>+</button>
      <button onClick={() => setN((c) => c - 1)}>-</button>
      <div>count: {n()}</div>
      <div>doubled: {doubled()}</div>
      <span id="parity">{n() % 2 === 0 ? "even" : "odd"}</span>
    </div>
  )
}

export function mountApp(container: HTMLElement): void {
  render(() => <App />, container)
}

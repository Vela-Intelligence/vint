import htm from "htm"
import { h, render } from "preact"
import { useState } from "preact/hooks"

const html = htm.bind(h)

function App() {
  const [n, setN] = useState(0)
  const doubled = n * 2
  return html`
    <div>
      <button onClick=${() => setN((c: number) => c + 1)}>+</button>
      <button onClick=${() => setN((c: number) => c - 1)}>-</button>
      <div>count: ${n}</div>
      <div>doubled: ${doubled}</div>
      <span id="parity">${n % 2 === 0 ? "even" : "odd"}</span>
    </div>
  `
}

export function mountApp(container: HTMLElement): void {
  render(html`<${App} />`, container)
}

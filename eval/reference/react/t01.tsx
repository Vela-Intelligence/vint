import { useState } from "react"
import { createRoot } from "react-dom/client"

function App() {
  const [n, setN] = useState(0)
  const doubled = n * 2
  return (
    <div>
      <button onClick={() => setN((c) => c + 1)}>+</button>
      <button onClick={() => setN((c) => c - 1)}>-</button>
      <div>count: {n}</div>
      <div>doubled: {doubled}</div>
      <span id="parity">{n % 2 === 0 ? "even" : "odd"}</span>
    </div>
  )
}

export function mountApp(container: HTMLElement): void {
  createRoot(container).render(<App />)
}

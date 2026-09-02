import { createSignal, For } from "solid-js"
import { render } from "solid-js/web"

type Row = { id: number; label: string }

function App() {
  const [rows, setRows] = createSignal<Row[]>([
    { id: 1, label: "alpha" },
    { id: 2, label: "beta" },
    { id: 3, label: "gamma" },
    { id: 4, label: "delta" },
  ])
  return (
    <div>
      <button onClick={() => setRows((prev) => [...prev].reverse())}>reverse</button>
      <ul>
        <For each={rows()}>
          {(row) => (
            <li>
              <span>{row.label}</span>
              <input data-row={String(row.id)} />
            </li>
          )}
        </For>
      </ul>
    </div>
  )
}

export function mountApp(container: HTMLElement): void {
  render(() => <App />, container)
}

// Effects with automatic cleanup: an interval that lives exactly as long as
// `running` is true. onCleanup runs before every effect re-run and on unmount
// (contract O2) — leave this page mid-run and the timer dies with it.
import { createEffect, createSignal, For, onCleanup, tags } from "../src/index"

const { div, h2, p, button, span, ol, li } = tags

const fmt = (ms: number): string => `${(ms / 1000).toFixed(2)}s`

export function StopwatchExample(): Element {
  const [running, setRunning] = createSignal(false)
  const [elapsed, setElapsed] = createSignal(0)
  const [laps, setLaps] = createSignal<{ id: number; at: number }[]>([])
  let nextLap = 1

  createEffect(() => {
    if (!running()) return
    const started = Date.now() - elapsed()
    const timer = setInterval(() => setElapsed(Date.now() - started), 51)
    onCleanup(() => clearInterval(timer))
  })

  const reset = (): void => {
    setRunning(false)
    setElapsed(0)
    setLaps([])
  }

  return div(
    h2("Stopwatch"),
    p({ class: "muted" }, "createEffect + onCleanup: the interval is scoped to the effect run."),
    div(
      { class: "row" },
      span({ class: "stat wide" }, () => fmt(elapsed())),
      button({ onclick: () => setRunning((r) => !r) }, () => (running() ? "pause" : "start")),
      button(
        {
          onclick: () => setLaps((prev) => [...prev, { id: nextLap++, at: elapsed() }]),
          disabled: () => !running(),
        },
        "lap",
      ),
      button({ onclick: reset }, "reset"),
    ),
    ol(
      For({
        each: laps,
        key: (l) => l.id,
        children: (lap) => li(() => fmt(lap().at)),
      }),
    ),
  )
}

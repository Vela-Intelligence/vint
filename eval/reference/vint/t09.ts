import { createSignal, Match, mount, Show, Switch, tags } from "vint"

const { div, button, input, span } = tags

export function mountApp(container: HTMLElement): void {
  mount(container, () => {
    const [step, setStep] = createSignal(1)
    const [name, setName] = createSignal("")
    const [kind, setKind] = createSignal<"a" | "b">("a")
    const [error, setError] = createSignal(false)
    const next1 = () => {
      if (!name().trim()) {
        setError(true)
        return
      }
      setError(false)
      setStep(2)
    }
    return div(
      span(() => `step ${step()} of 3`),
      Switch({
        children: [
          Match({
            when: () => step() === 1,
            children: () =>
              div(
                input({
                  id: "wname",
                  value: name,
                  oninput: (e: Event) => setName((e.target as HTMLInputElement).value),
                }),
                button({ onclick: next1 }, "next"),
                Show({ when: error, children: () => span("name required") }),
              ),
          }),
          Match({
            when: () => step() === 2,
            children: () =>
              div(
                span(() => `selected: ${kind()}`),
                button({ onclick: () => setKind("a") }, "type a"),
                button({ onclick: () => setKind("b") }, "type b"),
                button({ onclick: () => setStep(1) }, "back"),
                button({ onclick: () => setStep(3) }, "next"),
              ),
          }),
          Match({
            when: () => step() === 3,
            children: () =>
              div(
                span(() => `summary: ${name()} / ${kind()}`),
                button({ onclick: () => setStep(2) }, "back"),
              ),
          }),
        ],
      }),
    )
  })
}

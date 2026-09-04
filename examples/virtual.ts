// Windowed (virtual) list — the answer to "my list is too big".
//
// `For` diffs whatever array `each()` returns, so its cost is proportional to
// the number of rows you hand it, not to how much data you have. Slice the
// data down to what is on screen and the reconcile stays small no matter how
// large the backing collection is: 50,000 records here, ~20 rows rendered,
// and scrolling one row costs one row build and a handful of DOM moves.
//
// Two sizing rules make this work, and both are load-bearing:
//   1. Rows must be a known, fixed height, or you cannot compute the range
//      from scrollTop. Variable heights need measurement — out of scope here.
//   2. The spacer above/below must reserve the full scroll height, or the
//      scrollbar lies.
import { createMemo, createSelector, createSignal, For, mount, onCleanup, tags } from "../src/index"

const { div, ul, li, span, strong, p, label, input } = tags

const ROW_HEIGHT = 32 // px — must match the CSS below
const OVERSCAN = 4 // rows rendered beyond the viewport, to cover fast scrolls

type Record_ = { id: number; name: string; team: string; score: number }

const TEAMS = ["platform", "growth", "infra", "design", "data"]
const DATA: Record_[] = Array.from({ length: 50_000 }, (_, i) => ({
  id: i,
  name: `record ${i.toString().padStart(5, "0")}`,
  team: TEAMS[i % TEAMS.length] as string,
  score: (i * 7919) % 1000,
}))

function VirtualList() {
  const [scrollTop, setScrollTop] = createSignal(0)
  const [viewportHeight, setViewportHeight] = createSignal(480)
  const [query, setQuery] = createSignal("")
  const [selected, setSelected] = createSignal<number | null>(null)
  // C4: a selection change re-runs two rows' class bindings, not every row's
  const isSelected = createSelector(selected)

  // The filter runs over all 50k — that is user-land work, and it is why the
  // memo matters: it recomputes only when the query changes, not on scroll.
  const filtered = createMemo(() => {
    const q = query().trim().toLowerCase()
    return q ? DATA.filter((r) => r.name.includes(q) || r.team.includes(q)) : DATA
  })

  const first = createMemo(() => Math.max(0, Math.floor(scrollTop() / ROW_HEIGHT) - OVERSCAN))
  const count = createMemo(() => Math.ceil(viewportHeight() / ROW_HEIGHT) + OVERSCAN * 2)

  // THE POINT: `each` returns only the visible slice. For never sees 50,000.
  // Scrolling by one row retains every row but one, so the keyed reconcile
  // removes one row and inserts one — regardless of how large `filtered()` is.
  const window_ = createMemo(() => filtered().slice(first(), first() + count()))

  const viewport = div({
    class: "viewport",
    onscroll: (e: Event) => setScrollTop((e.target as HTMLElement).scrollTop),
  })

  // keep the rendered window in step with the element's real height
  const observer = new ResizeObserver(() => setViewportHeight(viewport.clientHeight))
  observer.observe(viewport)
  onCleanup(() => observer.disconnect())

  const rows = ul(
    {
      class: "rows",
      // offset the rendered window to where it actually belongs in the scroll
      style: () => `transform: translateY(${first() * ROW_HEIGHT}px)`,
    },
    For({
      each: window_,
      key: (r) => r.id,
      fallback: () => li({ class: "empty" }, "no matches"),
      children: (item) =>
        li(
          {
            class: () => (isSelected(item().id) ? "row selected" : "row"),
            onclick: () => setSelected(item().id),
          },
          span({ class: "name" }, () => item().name),
          span({ class: "team" }, () => item().team),
          span({ class: "score" }, () => String(item().score)),
        ),
    }),
  )

  // the spacer gives the scrollbar the full height of the DATA, not the window
  const spacer = div(
    { class: "spacer", style: () => `height: ${filtered().length * ROW_HEIGHT}px` },
    rows,
  )
  viewport.appendChild(spacer)

  return div(
    { class: "virtual" },
    p(
      strong(() => String(filtered().length)),
      " records · rendering ",
      strong(() => String(window_().length)),
      " · selected ",
      strong(() => (selected() === null ? "none" : `#${selected()}`)),
    ),
    label(
      "filter ",
      input({
        value: query,
        placeholder: "name or team",
        oninput: (e: Event) => {
          setQuery((e.target as HTMLInputElement).value)
          // a new result set means the old scroll offset is meaningless
          viewport.scrollTop = 0
          setScrollTop(0)
        },
      }),
    ),
    viewport,
  )
}

mount(document.body, () =>
  div(
    tags.h1("vint — windowed list"),
    p({ class: "muted" }, "50,000 records, ~20 rows in the DOM. Scrolling one row builds one row."),
    VirtualList(),
    tags.style(`
      /* explicit colours: the page must be legible whatever theme the
         browser is in, and a bare background inherits the host's */
      :root { color-scheme: light dark;
              --bg: #fbfcfa; --fg: #16201c; --dim: #6b7772;
              --line: #d8dcd6; --sel: #e3ede8; }
      @media (prefers-color-scheme: dark) {
        :root { --bg: #101614; --fg: #e4e9e5; --dim: #8b978f;
                --line: #28332e; --sel: #172a25; }
      }
      body { font: 14px/1.5 ui-monospace, monospace; padding: 24px;
             background: var(--bg); color: var(--fg); }
      .muted { color: var(--dim); }
      .viewport { height: 480px; overflow-y: auto; position: relative;
                  border: 1px solid var(--line); }
      .spacer { position: relative; }
      .rows { margin: 0; padding: 0; list-style: none; position: absolute; top: 0; left: 0; right: 0; }
      .row { height: ${ROW_HEIGHT}px; display: flex; gap: 16px; align-items: center;
             padding: 0 12px; border-bottom: 1px solid var(--line); cursor: pointer; }
      .row.selected { background: var(--sel); }
      .name { flex: 1; }
      .team { width: 90px; color: var(--dim); }
      .score { width: 60px; text-align: right; font-variant-numeric: tabular-nums; }
      .empty { padding: 12px; color: var(--dim); }
      label { display: block; margin: 12px 0; }
      input { font: inherit; padding: 4px 8px; background: var(--bg);
              color: var(--fg); border: 1px solid var(--line); }
    `),
  ),
)

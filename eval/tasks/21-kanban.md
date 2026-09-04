# Task: a kanban board

Build a single-page kanban board. Every requirement below is exact
and all of them must hold at once. Export `mountApp(container, deps)`; `deps.loadBoard()` returns a Promise of:

    { columns: Array<{ id: string, title: string }>,
      cards:   Array<{ id: string, title: string, column: string }> }

Use ONLY `deps.loadBoard` for data — no other IO. Timers via `setTimeout`
are allowed where stated.

GENERAL
- While the board is loading, an element whose text is `loading` is shown
  and nothing else is required to exist.
- After loading, each column renders as an element with class `column`
  containing: an `<h2>` with the column title, an element with class
  `count` whose text is `N cards` (N = cards currently in that column,
  always current), and its cards as `<li>` elements with attribute
  `data-card="<card id>"`, in the order the cards were loaded (or moved in).
- A top-level element with class `total` whose text is `T cards total`
  (T = all cards, always current).
- Card `<li>` elements keep their DOM identity across filtering and edits
  (the same element object before and after); a move between columns may
  re-create the element.

MOVING
- Each card has a button `→` that moves it to the next column and a button
  `←` that moves it to the previous column. In the last column `→` is
  disabled; in the first, `←` is disabled. A moved card is appended to the
  end of its new column.
- A moved card gets class `moved` for 1500 ms (via setTimeout), then loses
  it. Moving it again restarts the timer.
- A top-level button `undo` reverts the most recent move (the card returns
  to its previous column, at the end). `undo` is disabled when there is
  nothing to undo. Undo itself is not undoable and does not add `moved`.

FILTER
- A top-level `<input>` with attribute `data-filter`. Cards whose title does
  not contain the filter value (case-insensitive) are hidden by setting
  inline `display: none` on their `<li>` — they are not removed, and counts
  still include them.

EDITING
- Double-clicking a card's title (an element with class `title`) replaces
  it with an `<input>` with class `edit` holding the current title, focused.
  Enter commits the new title (trimmed; empty is ignored and keeps the old
  title); Escape cancels. While the input is open, other cards moving or
  the counts changing must not close it or move focus away from it.

SHORTCUT
- Pressing `z` (keydown on `document`) while no input is focused performs
  `undo`.

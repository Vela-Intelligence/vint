Build a filterable, sortable, editable score table.

Requirements (all texts exact):

- Initial rows, in this order:
  `[{ id: 1, name: "ada", score: 4 }, { id: 2, name: "bob", score: 1 }, { id: 3, name: "cyd", score: 2 }, { id: 4, name: "dan", score: 6 }]`
- Each row renders as an `<li>` containing `<name> <score>` (single space)
  and a button whose text is `+1` that increments that row's score.
- A text input filters rows: a row is shown when its name contains the
  input's value (case-insensitive). Empty input shows all rows.
- A button whose text is `sort` cycles the sort mode none → desc → asc →
  none. An element always shows the current mode as `sort: none`,
  `sort: desc`, or `sort: asc` (desc/asc sort the VISIBLE rows by score).
  In mode none, rows appear in their original id order.
- An element whose text is `showing X of Y` (X = visible rows, Y = all
  rows), always current.
- Everything composes live: incrementing a score while sorted re-positions
  the row immediately if its new score demands it; filtering while sorted
  keeps the sort.
- Rows must be keyed by id: a row that stays visible across filter, sort,
  and score changes keeps the SAME `<li>` DOM element.

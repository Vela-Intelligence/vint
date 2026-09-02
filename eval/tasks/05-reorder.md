Build a reorderable keyed list.

Requirements (all texts exact):

- Initial data, in this order:
  `[{ id: 1, label: "alpha" }, { id: 2, label: "beta" }, { id: 3, label: "gamma" }, { id: 4, label: "delta" }]`
- Each row renders as an `<li>` containing: an element showing the row's
  label, and a text input with the attribute `data-row` set to the row's id
  (e.g. `data-row="2"`).
- A button whose text is `reverse`. Clicking it reverses the order of the
  rows.
- Behavior under test: the user types text into the input of row id 2, then
  clicks `reverse`. Afterwards: (a) the labels appear in reversed order;
  (b) the typed text is still in row 2's input — the value travels with the
  row, not with the position; (c) each row's input is the SAME DOM element
  it was before the reorder (rows must be keyed by id and moved, not
  destroyed and recreated).
- Clicking `reverse` twice returns to the original order.

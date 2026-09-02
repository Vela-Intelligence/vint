Build a three-step wizard whose state survives navigation.

Requirements (all texts exact):

- An element always shows `step N of 3` for the current step (start at 1).
- Step 1: a text input with id `wname`, and a button whose text is `next`.
  Clicking `next` with an empty (or whitespace-only) input shows an element
  whose text is `name required` and stays on step 1; with a non-empty name
  it advances to step 2 (and the error text disappears).
- Step 2: an element showing `selected: a` or `selected: b` (initially
  `a`), buttons whose texts are `type a` and `type b` to choose, and
  buttons `back` and `next`.
- Step 3: an element whose text is `summary: NAME / TYPE` (the entered
  name and chosen type), and a button `back`.
- Navigation preserves state in BOTH directions: going back to step 1
  shows the name still in the input; back to step 2 shows the chosen type
  still selected; returning forward reflects the same values. Only the
  current step's controls are visible.

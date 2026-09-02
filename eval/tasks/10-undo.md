Build an undoable counter board.

Requirements (all texts exact):

- A button whose text is `add` appends a new counter starting at 0.
- Each counter renders as an `<li>` containing its current value and a
  button whose text is `+` that increments it.
- An element whose text is `total: N` — the sum of all counter values,
  always current.
- A button whose text is `undo` reverts the most recent action, however
  the actions were interleaved:
  - undoing an `add` removes that counter,
  - undoing a `+` decrements the counter it incremented.
  Repeated clicks keep walking history backwards. With no history left,
  `undo` does nothing (no crash, no change).

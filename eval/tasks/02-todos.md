Build a todo list app.

Requirements (all texts exact):

- A text input and a button whose text is `Add`. Clicking `Add` appends a
  todo whose title is the input's current value, then clears the input.
  Empty titles are ignored.
- Each todo renders as an `<li>` containing its title and a button whose
  text is `x`. Clicking `x` removes exactly that todo.
- An element whose text is `N left`, where N is the number of todos.
- While there are no todos, an element whose text is `empty` is visible in
  the DOM; it disappears as soon as there is at least one todo and comes
  back when the list becomes empty again.

All updates must be immediate.

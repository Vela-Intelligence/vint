Build a master–detail contact editor.

Requirements (all texts exact):

- Initial contacts, in this order:
  `[{ id: 1, name: "ada" }, { id: 2, name: "bob" }, { id: 3, name: "cyd" }]`
- Each contact renders as an `<li>` containing its current name and a button
  whose text is `edit`. Clicking `edit` selects that contact.
- While no contact is selected, there is no editor. While one is selected, a
  text input with id `editor` is visible, pre-filled with the selected
  contact's current name.
- Typing in the editor renames the selected contact LIVE: the contact's
  `<li>` shows the new name as you type, keystroke by keystroke.
- An element whose text is `modified: N`, where N is the number of contacts
  whose current name differs from their original name (renaming a contact
  back to its exact original decreases N).
- Selecting a different contact loads that contact's current name into the
  editor.
- The `<li>` elements must not be rebuilt while typing: each contact keeps
  the SAME `<li>` DOM element throughout edits and selection changes.

Build a settings panel with an unrelated ticker.

Requirements (all texts exact):

- A button whose text is `toggle`. It shows/hides a panel. The panel starts
  hidden ("hidden" means: not present in the DOM, or `display: none`).
- The panel contains a text input with id `name`.
- A button whose text is `tick` and an element whose text is `ticks: N`
  (N starts at 0). Clicking `tick` increments N.
- Behavior under test: with the panel visible, a user types into the `name`
  input and focuses it, then clicks `tick` several times. The input must
  keep both its typed value and its focus — unrelated state changes must
  not reset or rebuild the panel.
- Toggling the panel away and back may reset the input; that is fine.

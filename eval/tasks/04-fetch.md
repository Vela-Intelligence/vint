Build a user viewer that loads data asynchronously.

Your `mountApp(container, deps)` receives `deps.fetchUser`, an async
function: `fetchUser(id: number) => Promise<{ name: string }>`. It may
reject. Use ONLY `deps.fetchUser` for data — no other IO.

Requirements (all texts exact):

- The app starts by loading user id 1 immediately on mount.
- A button whose text is `next`. Clicking it advances to the next id
  (2, 3, …) and loads that user.
- While a load is in flight, an element whose text is `loading` is visible.
- On success, an element shows exactly the user's name; `loading`
  disappears.
- On failure, an element whose text is `error: E` is shown, where E is the
  rejection's `.message`; `loading` disappears.
- Races: if the user clicks `next` while a previous load is still in
  flight, the earlier response must be ignored even if it arrives later —
  the display always reflects the most recently requested id.

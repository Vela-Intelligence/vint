Build a project tracker — a single app with three views, live derived
counts, and async-loaded data. This is a larger app; every requirement
below is exact and all of them must hold at once.

Data comes from `deps.loadSeed()`, which returns a Promise of:

    {
      workspace: string,
      people: Array<{ id: string, name: string }>,
      projects: Array<{
        id: string,
        name: string,
        tasks: Array<{ id: string, title: string, done: boolean, assignee: string | null }>
      }>
    }

`assignee` is a person id. Use ONLY `deps.loadSeed` for data — no other IO.

GENERAL

- While the seed is loading, an element whose text is `loading` is shown
  and nothing else is required to exist yet.
- After loading, an `<h1>` always shows the current workspace name.
- Three buttons whose texts are `board`, `people`, `settings` switch views;
  an element always shows `view: board`, `view: people`, or
  `view: settings`. Start on board. Only the current view's content is
  visible.
- ALL entered state survives switching views away and back: the board's
  filter text, each project's draft input, checkbox states, assignments,
  and settings values.

BOARD VIEW

- The view's root element has class `board` (plus class `compact` while
  the compact setting is on — see settings).
- Each project renders as an element with class `project` containing:
  - the project's name,
  - an element whose text is `D/T done` (D = done tasks, T = total tasks
    in that project, e.g. `0/2 done`), always current,
  - its tasks as `<li>`s. Each task li contains: a checkbox
    (`input type="checkbox"`, checked = done, toggling updates everything
    live), the task's title, and a `<select>` whose first option is `-`
    (unassigned) followed by one option per person (option text = person
    name). Choosing an option assigns/unassigns the task.
  - a text input and a button whose text is `add task`: clicking appends a
    task with the input's title (not done, unassigned) and clears the
    input; empty or whitespace-only titles are ignored.
- A top-level text input with attribute `data-filter`: tasks whose title
  does not contain its value (case-insensitive) are hidden. Projects
  themselves stay visible. Task `<li>` elements that remain visible keep
  their DOM identity across filtering and edits.
- A top-level text input with attribute `data-new-project` and a button
  whose text is `add project`: clicking appends a project with that name
  and no tasks (empty ignored, input cleared).

PEOPLE VIEW

- Each person renders as an `<li>` whose text is exactly `NAME: K open`,
  where K is the number of not-done tasks assigned to them across all
  projects, always current.

SETTINGS VIEW

- A text input with id `workspace`, pre-filled with the workspace name;
  typing renames the workspace LIVE (the `<h1>` updates per keystroke).
- A checkbox with id `compact` controlling the board's `compact` class.

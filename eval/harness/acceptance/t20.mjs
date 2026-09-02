// 20-tracker acceptance — the large-app cell. Async seed, three views,
// nested keyed lists, cross-view derived counts, state surviving view
// switches. Every helper scopes to spec'd structure only.
export async function accept({ module, container, helpers: h }) {
  let resolveSeed
  const deps = {
    loadSeed: () =>
      new Promise((resolve) => {
        resolveSeed = resolve
      }),
  }

  module.mountApp(container, deps)
  await h.settle()
  h.assert(h.visibleWithText(container, "loading"), `"loading" must show while the seed is pending (got: ${h.snapshot(container)})`)

  resolveSeed({
    workspace: "Acme",
    people: [
      { id: "p1", name: "ada" },
      { id: "p2", name: "bob" },
    ],
    projects: [
      {
        id: "j1",
        name: "apollo",
        tasks: [
          { id: "t1", title: "design", done: false, assignee: "p1" },
          { id: "t2", title: "build", done: false, assignee: null },
        ],
      },
      { id: "j2", name: "zephyr", tasks: [{ id: "t3", title: "ship", done: true, assignee: "p2" }] },
    ],
  })
  await h.settle()

  // --- scoped helpers -------------------------------------------------------
  const h1 = () => container.querySelector("h1")
  const tab = (name) => h.byText(container, name)
  const projectEl = (name) =>
    [...container.querySelectorAll(".project")].find((p) => p.textContent.includes(name))
  const taskLi = (project, title) =>
    [...projectEl(project).querySelectorAll("li")].find((li) => li.textContent.includes(title))
  const visibleTaskTitles = (project) =>
    [...projectEl(project).querySelectorAll("li")]
      .filter((li) => {
        for (let n = li; n && n !== container; n = n.parentElement) {
          if (n.style && n.style.display === "none") return false
        }
        return true
      })
      .map((li) => ["design", "build", "test", "ship"].find((t) => li.textContent.includes(t)))
      .filter(Boolean)
  const checkbox = (project, title) => taskLi(project, title).querySelector('input[type="checkbox"]')
  const setSelect = async (project, title, optionText) => {
    const select = taskLi(project, title).querySelector("select")
    h.assert(select, `task "${title}" needs a <select>`)
    const option = [...select.querySelectorAll("option")].find((o) => o.textContent.trim() === optionText)
    h.assert(option, `select for "${title}" needs an option "${optionText}"`)
    select.value = option.value
    select.dispatchEvent(new globalThis.Event("change", { bubbles: true }))
    select.dispatchEvent(new globalThis.Event("input", { bubbles: true }))
    await h.settle()
  }
  const projectInput = (name) => projectEl(name).querySelector('input[type="text"], input:not([type])')

  // --- initial render -------------------------------------------------------
  h.assert(h1()?.textContent.trim() === "Acme", `h1 must show "Acme" (got "${h1()?.textContent}")`)
  h.assert(h.visibleWithText(container, "view: board"), `must start on "view: board" (got: ${h.snapshot(container)})`)
  h.assert(projectEl("apollo") && projectEl("zephyr"), "both projects must render with class .project")
  h.assert(h.visibleWithText(projectEl("apollo"), "0/2 done"), `apollo must show "0/2 done"`)
  h.assert(h.visibleWithText(projectEl("zephyr"), "1/1 done"), `zephyr must show "1/1 done"`)
  h.assert(checkbox("zephyr", "ship").checked === true, "ship must start checked (done)")

  // --- people view: derived counts ------------------------------------------
  await h.click(tab("people"))
  h.assert(h.visibleWithText(container, "view: people"), "people tab must switch the view")
  h.assert(h.visibleWithText(container, "ada: 1 open"), `"ada: 1 open" missing (got: ${h.snapshot(container)})`)
  h.assert(h.visibleWithText(container, "bob: 0 open"), `"bob: 0 open" missing (ship is done)`)
  await h.click(tab("board"))

  // --- toggle + assign ripple across views ----------------------------------
  checkbox("apollo", "design").click()
  await h.settle()
  h.assert(h.visibleWithText(projectEl("apollo"), "1/2 done"), `after toggling design: "1/2 done" (got: ${h.snapshot(projectEl("apollo"))})`)
  await setSelect("apollo", "build", "bob")
  await h.click(tab("people"))
  h.assert(h.visibleWithText(container, "ada: 0 open"), `after done-toggle: "ada: 0 open"`)
  h.assert(h.visibleWithText(container, "bob: 1 open"), `after assigning build to bob: "bob: 1 open"`)
  await h.click(tab("board"))

  // --- add task -------------------------------------------------------------
  await h.click(h.byText(projectEl("apollo"), "add task")) // empty — ignored
  h.assert(projectEl("apollo").querySelectorAll("li").length === 2, "empty add task must be ignored")
  h.setInputValue(projectInput("apollo"), "test")
  await h.click(h.byText(projectEl("apollo"), "add task"))
  h.assert(taskLi("apollo", "test"), "new task \"test\" must appear")
  h.assert(h.visibleWithText(projectEl("apollo"), "1/3 done"), `after add: "1/3 done"`)
  h.assert(projectInput("apollo").value === "", "the project's draft input must clear after add")

  // --- filter + identity + survival across views ----------------------------
  // captured here, after the last view switch: identity is promised through
  // FILTERING and edits, not across view unmount/remount
  const designLi = taskLi("apollo", "design")
  const filter = container.querySelector("[data-filter]")
  h.assert(filter, "board needs the [data-filter] input")
  h.setInputValue(filter, "e")
  await h.settle()
  h.assert(visibleTaskTitles("apollo").join(",") === "design,test", `filter "e": apollo should show design,test — got ${visibleTaskTitles("apollo").join(",")}`)
  h.assert(visibleTaskTitles("zephyr").join(",") === "", `filter "e": zephyr should show no tasks — got ${visibleTaskTitles("zephyr").join(",")}`)
  h.assert(projectEl("zephyr"), "projects stay visible under a task filter")
  h.assert(taskLi("apollo", "design") === designLi, "design's li must keep DOM identity through filtering")

  h.setInputValue(projectInput("zephyr"), "draftZ")
  await h.click(tab("settings"))
  h.assert(h.visibleWithText(container, "view: settings"), "settings tab must switch the view")
  await h.click(tab("board"))
  h.assert(container.querySelector("[data-filter]").value === "e", "the filter text must survive a view round-trip")
  h.assert(visibleTaskTitles("apollo").join(",") === "design,test", "the filtered view must survive a view round-trip")
  h.assert(projectInput("zephyr").value === "draftZ", "a project's draft input must survive a view round-trip")
  h.setInputValue(container.querySelector("[data-filter]"), "")
  await h.settle()

  // --- settings: live rename + compact --------------------------------------
  await h.click(tab("settings"))
  const workspace = container.querySelector("#workspace")
  h.assert(workspace, "settings needs the #workspace input")
  h.assert(workspace.value === "Acme", `#workspace must be pre-filled "Acme" (got "${workspace.value}")`)
  h.setInputValue(workspace, "Umbrella")
  await h.settle()
  h.assert(h1()?.textContent.trim() === "Umbrella", `h1 must rename LIVE (got "${h1()?.textContent}")`)
  const compact = container.querySelector("#compact")
  h.assert(compact, "settings needs the #compact checkbox")
  compact.click()
  await h.settle()
  await h.click(tab("board"))
  const boardRoot = container.querySelector(".board")
  h.assert(boardRoot, "the board view root needs class .board")
  h.assert(boardRoot.classList.contains("compact"), "compact setting must add class .compact to the board root")

  // --- add project ----------------------------------------------------------
  const newProject = container.querySelector("[data-new-project]")
  h.assert(newProject, "board needs the [data-new-project] input")
  h.setInputValue(newProject, "orion")
  await h.click(h.byText(container, "add project"))
  h.assert(projectEl("orion"), `project "orion" must appear`)
  h.assert(h.visibleWithText(projectEl("orion"), "0/0 done"), `orion must show "0/0 done"`)

  // --- final ripple check ----------------------------------------------------
  checkbox("apollo", "test").click()
  await h.settle()
  h.assert(h.visibleWithText(projectEl("apollo"), "2/3 done"), `after toggling test: "2/3 done" (got: ${h.snapshot(projectEl("apollo"))})`)
}

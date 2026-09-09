// 22-i18n acceptance — locale switch (labels, lang/dir on the document),
// Intl.PluralRules categories (French "one" for 0, Arabic's six), Intl
// number formatting substituted verbatim, item identity across the switch,
// text preserved without normalization, and the IME commit keystroke.
export async function accept({ module, container, helpers: h }) {
  const messages = {
    en: { dir: "ltr", title: "Groceries", add: "Add it", placeholder: "Something to buy",
          empty: "Empty list", count: { one: "{n} thing", other: "{n} things" } },
    fr: { dir: "ltr", title: "Courses", add: "Ajouter", placeholder: "Quelque chose",
          empty: "Liste vide", count: { one: "{n} chose", other: "{n} choses" } },
    ar: { dir: "rtl", title: "المشتريات", add: "إضافة", placeholder: "شيء ما",
          empty: "القائمة فارغة", count: { zero: "لا أشياء", one: "شيء واحد", two: "شيئان",
                                           few: "{n} أشياء", many: "{n} شيئًا", other: "{n} شيء" } },
  }
  const expectedCount = (locale, n) => {
    const m = messages[locale]
    const tpl = m.count[new Intl.PluralRules(locale).select(n)] ?? m.count.other
    return tpl.replace("{n}", new Intl.NumberFormat(locale).format(n))
  }

  module.mountApp(container, { messages })
  await h.settle()

  const root = document.documentElement
  const select = container.querySelector("select[data-locale]")
  const h1 = () => container.querySelector("h1")
  const input = () => container.querySelector("input[data-new]")
  const addButton = () => container.querySelector("button[data-add]")
  const count = () => container.querySelector("[data-count]")?.textContent.trim()
  const empty = () => container.querySelector("[data-empty]")
  const lis = () => [...container.querySelectorAll("ul[data-items] > li")]
  const texts = () => lis().map((li) => li.querySelector("[data-text]")?.textContent)
  const setLocale = async (code) => {
    h.setInputValue(select, code)
    select.dispatchEvent(new globalThis.Event("change", { bubbles: true }))
    await h.settle()
  }
  const add = async (text) => {
    h.setInputValue(input(), text)
    await h.settle()
    await h.click(addButton())
  }
  const enter = async (init) => {
    input().dispatchEvent(new globalThis.KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true, ...init }))
    await h.settle()
  }

  // initial state, first locale
  h.assert(select, `a select[data-locale] (got: ${h.snapshot(container)})`)
  h.assert([...select.options].map((o) => o.value).join(",") === "en,fr,ar", `options in Object.keys order: ${[...select.options].map((o) => o.value)}`)
  h.assert([...select.options].map((o) => o.textContent.trim()).join(",") === "en,fr,ar", "option text is the code")
  h.assert(select.value === "en", `first locale selected: ${select.value}`)
  h.assert(root.getAttribute("lang") === "en" && root.getAttribute("dir") === "ltr", `documentElement lang/dir at mount: ${root.getAttribute("lang")}/${root.getAttribute("dir")}`)
  h.assert(h1()?.textContent.trim() === "Groceries", `h1: ${h1()?.textContent}`)
  h.assert(input()?.getAttribute("dir") === "auto", "input[data-new] has dir=auto")
  h.assert(input()?.placeholder === "Something to buy", `placeholder: ${input()?.placeholder}`)
  h.assert(addButton()?.textContent.trim() === "Add it", `add button: ${addButton()?.textContent}`)
  h.assert(count() === expectedCount("en", 0), `count at 0: ${count()} (expected ${expectedCount("en", 0)})`)
  h.assert(empty()?.textContent.trim() === "Empty list", `data-empty present at 0 items: ${h.snapshot(container)}`)

  // adding: button, Enter, trimming, empty, the IME commit keystroke
  await add("milk")
  h.assert(texts().join("|") === "milk", `one item after add: ${texts()}`)
  h.assert(input().value === "", "input cleared after add")
  h.assert(!empty(), "data-empty removed once an item exists")
  h.assert(count() === expectedCount("en", 1), `count at 1: ${count()}`)
  h.setInputValue(input(), "  eggs  ")
  await h.settle()
  await enter({ isComposing: true })
  h.assert(texts().length === 1, "Enter with isComposing must not add")
  await enter()
  h.assert(texts().join("|") === "milk|eggs", `Enter adds the trimmed value: ${texts()}`)
  h.setInputValue(input(), "   ")
  await h.settle()
  await enter()
  await h.click(addButton())
  h.assert(texts().length === 2, "whitespace-only adds nothing")
  const decomposed = "crème fraîche" // a combining grave: 15 code points, kept as typed
  await add(decomposed)
  h.assert(texts()[2] === decomposed, `item text kept exactly as entered (got ${JSON.stringify(texts()[2])})`)
  h.assert(count() === expectedCount("en", 3), `count at 3: ${count()}`)

  // the switch: every label, the document, identity
  const before = lis()
  await setLocale("fr")
  h.assert(root.getAttribute("lang") === "fr" && root.getAttribute("dir") === "ltr", `lang/dir after fr: ${root.getAttribute("lang")}/${root.getAttribute("dir")}`)
  h.assert(h1()?.textContent.trim() === "Courses", `h1 in fr: ${h1()?.textContent}`)
  h.assert(addButton()?.textContent.trim() === "Ajouter", `add button in fr: ${addButton()?.textContent}`)
  h.assert(input()?.placeholder === "Quelque chose", `placeholder in fr: ${input()?.placeholder}`)
  h.assert(count() === expectedCount("fr", 3), `count in fr at 3: ${count()}`)
  const after = lis()
  h.assert(after.length === 3 && after.every((li, i) => li === before[i]), "li elements keep identity across a locale change")

  // removal keeps the others' identity; French says "one" for zero
  await h.click(lis()[1].querySelector("button[data-remove]"))
  h.assert(texts().join("|") === `milk|${decomposed}`, `remove the middle item: ${texts()}`)
  h.assert(lis()[0] === before[0] && lis()[1] === before[2], "remaining li elements keep identity after a removal")
  await h.click(lis()[0].querySelector("button[data-remove]"))
  await h.click(lis()[0].querySelector("button[data-remove]"))
  h.assert(texts().length === 0, "all removed")
  h.assert(count() === expectedCount("fr", 0), `French plural category for 0 is "one": ${count()} (expected ${expectedCount("fr", 0)})`)
  h.assert(empty()?.textContent.trim() === "Liste vide", "data-empty returns, in the current locale")

  // Arabic: rtl, and the six categories with the locale's own number formatting
  await setLocale("ar")
  h.assert(root.getAttribute("lang") === "ar" && root.getAttribute("dir") === "rtl", `lang/dir after ar: ${root.getAttribute("lang")}/${root.getAttribute("dir")}`)
  h.assert(h1()?.textContent.trim() === "المشتريات", `h1 in ar: ${h1()?.textContent}`)
  h.assert(count() === expectedCount("ar", 0), `ar zero: ${count()}`)
  for (let n = 1; n <= 11; n++) {
    await add(`item ${n}`)
    h.assert(count() === expectedCount("ar", n), `ar count at ${n}: ${count()} (expected ${expectedCount("ar", n)})`)
  }
  h.assert(texts().length === 11, `eleven items: ${texts().length}`)
  await setLocale("en")
  h.assert(count() === expectedCount("en", 11), `back to en at 11: ${count()}`)
  h.assert(root.getAttribute("dir") === "ltr", "dir returns to ltr")
}

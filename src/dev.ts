/**
 * Dev-mode assertions. Errors are prompts: every message names what happened
 * and states the fix imperatively (contract §E). The skill/llms.txt embeds
 * these messages verbatim — edit them here only.
 */

export const DEV: boolean = (() => {
  try {
    const env = (import.meta as { env?: { DEV?: boolean } }).env
    return env?.DEV ?? true
  } catch {
    return true
  }
})()

/** An effect running this many times in a single flush is feeding itself. */
export const LOOP_LIMIT = 1000

export const MESSAGES = {
  "E-LOOP": (name: string) =>
    `E-LOOP: effect${name} ran ${LOOP_LIMIT}+ times in one flush — it writes a signal it also depends on. Wrap the write in untrack(), or restructure so the effect does not retrigger itself.`,
  "E-WRITE-IN-MEMO": (name: string) =>
    `E-WRITE-IN-MEMO: a signal was written inside memo${name}. Memos must be pure — move the write into a createEffect.`,
  "E-CIRCULAR-MEMO": (name: string) =>
    `E-CIRCULAR-MEMO: memo${name} reads itself while computing. Break the cycle — derive the value from other signals.`,
  "E-DISPOSED-MEMO": (name: string) =>
    `E-DISPOSED-MEMO: read of memo${name} whose owner was disposed — it will never update again. Create the memo under an owner that lives as long as its readers.`,
  "E-NO-OWNER": (what: string) =>
    `E-NO-OWNER: ${what} was created outside any root — it will never be disposed. Create it inside mount()/createRoot(), or use runWithOwner().`,
  "E-FOR-ARRAY": () =>
    `E-FOR-ARRAY: For's \`each\` must be a function returning an array. You passed a plain array — wrap it: For({ each: () => items }). For reactive data, pass the signal getter itself: For({ each: items }).`,
  "E-FOR-EACH-RESULT": (got: string) =>
    `E-FOR-EACH-RESULT: For's each() returned ${got} instead of an array. Return an array on every run — e.g. For({ each: () => items() ?? [] }).`,
  "E-FOR-DUPKEY": (key: string) =>
    `E-FOR-DUPKEY: For received two rows with the same key (${key}). Keys must be unique — pass a key function that returns a unique id: For({ each, key: t => t.id, ... }).`,
  "E-FOR-SAMEREF": () =>
    `E-FOR-SAMEREF: For received the same array instance as last time — it was mutated in place, and rows keyed by identity cannot see that. Update immutably (set([...prev, item])), and give object rows a key function.`,
  "E-SAMEREF-SET": () =>
    `E-SAMEREF-SET: a setter received the same array instance it already holds — the set is a NO-OP, so if you mutated the array in place, vint cannot see the change and nothing re-renders. Update immutably: set(prev => [...prev, item]).`,
  "E-FOR-ITEM-ACCESS": (prop: string) =>
    `E-FOR-ITEM-ACCESS: you read .${prop} on For's item argument, but UNLIKE Solid's For, item is an ACCESSOR — call it first: item().${prop}.`,
  "E-FOR-DETACHED": () =>
    `E-FOR-DETACHED: For's anchor markers are no longer in the DOM — the node containing them was removed or moved outside vint, so this For can no longer render. Keep For inside DOM that vint owns (don't cache and re-append nodes across Show branches).`,
  "E-BIND-DETACHED": () =>
    `E-BIND-DETACHED: a live binding's anchor markers are no longer in the DOM — the node containing them was removed or emptied outside vint (e.g. innerHTML/replaceChildren), so this binding can no longer render. Let vint own the DOM it binds; remove nodes by making the binding return null instead.`,
  "E-SWITCH-ARRAY": () =>
    `E-SWITCH-ARRAY: Switch's children must be an ARRAY of Match(...) calls — wrap it: Switch({ children: [Match({ when, children })] }).`,
  "E-SHOW-WHEN": () =>
    `E-SHOW-WHEN: Show's \`when\` must be a FUNCTION, not a value. UNLIKE Solid's JSX — where the compiler wraps the expression for you — nothing wraps it here, so a value would freeze the branch forever. Pass the accessor itself: Show({ when: isOpen, ... }), or a thunk: Show({ when: () => count() > 0, ... }).`,
  "E-MATCH-WHEN": () =>
    `E-MATCH-WHEN: Match's \`when\` must be a FUNCTION, not a value — same reason as Show's (Solid's JSX wraps it for you; vint does not). Pass the accessor itself: Match({ when: isReady, ... }), or a thunk: Match({ when: () => status() === "done", ... }).`,
  "E-CHILDREN-FN": (what: string) =>
    `E-CHILDREN-FN: ${what} must be a FUNCTION that returns the DOM, not an already-built element — vint has no JSX, so branches build lazily and can be rebuilt. Write () => div(...) instead of div(...). (For's children takes the row: children: (item) => li(() => item().title).)`,
  "E-MOUNT-CONTAINER": (got: string) =>
    `E-MOUNT-CONTAINER: mount's first argument must be an element (or a ShadowRoot), got ${got}. Pass a real node — mount(document.getElementById("app"), App) — and check it is not null; a selector string does not work, call document.querySelector() yourself.`,
  "E-NO-REF": () =>
    `E-NO-REF: vint has no ref prop — the tag call already returns the element. Keep the reference: const el = div(...); then use el directly.`,
  "E-NO-CLASSLIST": () =>
    `E-NO-CLASSLIST: vint has no classList prop — use one computed class string: class: () => (active() ? "on" : "").`,
  "E-MOUNT-VIEW": () =>
    `E-MOUNT-VIEW: mount's second argument must be a function — pass the component itself, mount(el, App), not the result of calling it, mount(el, App()).`,
  "E-URL-SCHEME": (key: string) =>
    `E-URL-SCHEME: the "${key}" prop was set to a javascript:, vbscript:, or non-image data: URL — following it runs attacker-controlled code or loads an attacker-controlled document. Allow only http(s), mailto, tel, or relative URLs, and validate the scheme before building this prop from data. (Warning only; the value was still set.)`,
  "E-RAW-HTML": (key: string) =>
    `E-RAW-HTML: the "${key}" prop parses a string as HTML — never pass untrusted data through it. To render text safely, use children: div(value). (Warning only; the assignment still happens.)`,
  "E-PROTO-KEY": () =>
    `E-PROTO-KEY: a "__proto__" prop key was ignored — it would corrupt the element's prototype. If this key came from spreading external data, stop spreading untrusted objects into props.`,
  "E-CALLBACK-PROP": (key: string) =>
    `E-CALLBACK-PROP: the "${key}" prop received a function that declares parameters — reactive prop bindings are called with NO arguments, so this was probably meant as a callback VALUE (e.g. a Lit formatter). To assign the function itself, use prop:${key}. (Warning only; the value was treated as a reactive binding.)`,
  "E-EVENT-VALUE": (key: string) =>
    `E-EVENT-VALUE: the "${key}" prop looks like an event handler but its value is not a function — it was skipped. Pass a function (${key}: () => ...), or use attr:${key} / prop:${key} if you really meant an attribute or property.`,
} as const

export type ErrorCode = keyof typeof MESSAGES

export function vintError(code: ErrorCode, detail = ""): Error {
  const make = MESSAGES[code] as (d: string) => string
  return new Error(make(detail))
}

export function vintWarn(code: ErrorCode, detail = ""): void {
  const make = MESSAGES[code] as (d: string) => string
  console.warn(make(detail))
}

/** Format an optional debug name for inclusion in messages. */
export function named(name: string | undefined): string {
  return name ? ` "${name}"` : ""
}

/**
 * Dev-mode assertions. Errors are prompts: every message names what happened
 * and states the fix imperatively (contract §E). The skill (skills/vint/SKILL.md) embeds
 * these messages verbatim — edit them here only.
 *
 * DEV is a build-time constant (§E): `--define:__VINT_DEV__=false` produces
 * dist/vint.prod.js with every `if (DEV)` block and every warning text
 * absent; left undefined (vitest, examples, eval, a copied src/) it is on.
 */

/** Defined by `npm run build` (true → dist/vint.js, false → dist/vint.prod.js).
 *  Left undefined — vitest, examples, the eval harness, a copied src/ — DEV is on.
 *  The prod build is two esbuild passes (package.json build:prod): the first
 *  inlines this const as a literal at every import site, the second sees the
 *  literal at parse time and eliminates the dead `if (DEV)` branches — esbuild
 *  does not re-run elimination after inlining within a single pass. */
declare const __VINT_DEV__: boolean | undefined
export const DEV: boolean = typeof __VINT_DEV__ === "undefined" ? true : __VINT_DEV__

/** An effect running this many times in a single flush is feeding itself. */
export const LOOP_LIMIT = 1000

/** Thrown regardless of DEV — the checks marked *(always)* in contract §E. */
export const MESSAGES = {
  "E-LOOP": (name: string) =>
    `E-LOOP: effect${name} ran ${LOOP_LIMIT}+ times in one flush — it writes a signal it also depends on. Wrap the write in untrack(), or restructure so the effect does not retrigger itself.`,
  "E-FOR-ARRAY": () =>
    `E-FOR-ARRAY: For's \`each\` must be a function returning an array. You passed a plain array — wrap it: For({ each: () => items }). For reactive data, pass the signal getter itself: For({ each: items }).`,
  "E-FOR-EACH-RESULT": (got: string) =>
    `E-FOR-EACH-RESULT: For's each() returned ${got} instead of an array. Return an array on every run — e.g. For({ each: () => items() ?? [] }).`,
  "E-FOR-DUPKEY": (key: string) =>
    `E-FOR-DUPKEY: For received two rows with the same key (${key}). Keys must be unique — pass a key function that returns a unique id: For({ each, key: t => t.id, ... }).`,
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
  "E-CHILD-TYPE": (got: string) =>
    `E-CHILD-TYPE: a child must be a node, string, number, boolean, null, an array of those, or a function returning one — got ${got}. A props object goes FIRST: div({ class: "x" }, ...children). A Promise is not a child: use createResource and render data() in a binding. Any other object: render a string (String(value) or JSON.stringify(value)).`,
  "E-TAG-NAME": (name: string) =>
    `E-TAG-NAME: "${name}" is not a valid element name. Tag names are code, never data — write the tag literally (tags.div(...)); a custom element needs a hyphen (tags["my-widget"](...)).`,
} as const

/** Thrown in dev only — every call site is `if (DEV) throw vintDevError(...)`,
 *  so the prod build drops the sites, this object, and the text. */
export const DEV_MESSAGES = {
  "E-WRITE-IN-MEMO": (name: string) =>
    `E-WRITE-IN-MEMO: a signal was written inside memo${name}. Memos must be pure — move the write into a createEffect.`,
  "E-CIRCULAR-MEMO": (name: string) =>
    `E-CIRCULAR-MEMO: memo${name} reads itself while computing. Break the cycle — derive the value from other signals.`,
  "E-DISPOSED-MEMO": (name: string) =>
    `E-DISPOSED-MEMO: read of memo${name} whose owner was disposed — it will never update again. Create the memo under an owner that lives as long as its readers.`,
  "E-DISPOSED-OWNER": (what: string) =>
    `E-DISPOSED-OWNER: ${what} was created under an owner that is already disposed — it could never be cleaned up. If this owner disposed itself earlier in the same body, return right after disposing; for a callback that outlives its owner, keep a disposed flag and skip the work.`,
} as const

/** Warned (console.warn), dev only — absent from the prod bundle. */
export const WARNINGS = {
  "E-NO-OWNER": (what: string) =>
    `E-NO-OWNER: ${what} was created outside any root — it will never be disposed. Create it inside mount()/createRoot(), or use runWithOwner().`,
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
  "E-DEAD-BINDING": (key: string) =>
    `E-DEAD-BINDING: the "${key}" prop is a function that read no signals on its first run, so it can never run again — a binding's dependencies are collected per run. If you meant to pass the function ITSELF (a Lit callback or renderer), use prop:${key}. If you meant a constant, drop the function and pass the value.`,
  "E-URL-SCHEME": (key: string) =>
    `E-URL-SCHEME: the "${key}" prop received a javascript:, vbscript:, or non-image data: URL — following it runs attacker-controlled code or loads an attacker-controlled document. Allow only http(s), mailto, tel, or relative URLs, and validate the scheme before building this prop from data. A javascript:/vbscript: value is NEVER assigned (the attribute was removed); a data: value was still set.`,
  "E-RAW-HTML": (key: string) =>
    `E-RAW-HTML: the "${key}" prop parses a string as HTML — never pass untrusted data through it. To render text safely, use children: div(value). (Warning only; the assignment still happens.)`,
  "E-PROTO-KEY": () =>
    `E-PROTO-KEY: a "__proto__" prop key was ignored — it would corrupt the element's prototype. If this key came from spreading external data, stop spreading untrusted objects into props.`,
  "E-CALLBACK-PROP": (key: string) =>
    `E-CALLBACK-PROP: the "${key}" prop looks like a callback VALUE, not a reactive binding — either it declares parameters (bindings are called with NO arguments), or it overwrote a property that already held a function. vint CALLS it and assigns the return, which destroys the callback. To assign the function itself, use prop:${key}. (Warning only; the value was treated as a reactive binding.)`,
  "E-EVENT-VALUE": (key: string) =>
    `E-EVENT-VALUE: the "${key}" prop looks like an event handler but its value is not a function — it was skipped. Pass a function (${key}: () => ...), or use prop:${key} if you really meant a property. There is no way to set an inline handler attribute.`,
  "E-EVENT-ATTR": (key: string) =>
    `E-EVENT-ATTR: the "${key}" prop would set an inline event-handler attribute — a string executed as code — so it was skipped. Pass a function under the plain event key instead (${key.slice(5)}: () => ...).`,
  "E-ATTR-NAME": (key: string) =>
    `E-ATTR-NAME: "${key}" is not a valid attribute name, so it was skipped. Attribute names are code, never data — if this key came from spreading external data, stop spreading untrusted objects into props.`,
  "E-READONLY-PROP": (key: string) =>
    `E-READONLY-PROP: "${key}" names a read-only property, so the assignment was skipped. If you meant the attribute, use attr:${key.slice(5)}; otherwise drop the prop.`,
} as const

export type ErrorCode = keyof typeof MESSAGES
export type DevErrorCode = keyof typeof DEV_MESSAGES
export type WarnCode = keyof typeof WARNINGS

export function vintError(code: ErrorCode, detail = ""): Error {
  const make = MESSAGES[code] as (d: string) => string
  return new Error(make(detail))
}

export function vintDevError(code: DevErrorCode, detail = ""): Error {
  const make = DEV_MESSAGES[code] as (d: string) => string
  return new Error(make(detail))
}

export function vintWarn(code: WarnCode, detail = ""): void {
  if (!DEV) return // lets the prod build drop WARNINGS entirely
  const make = WARNINGS[code] as (d: string) => string
  console.warn(make(detail))
}

/** Format an optional debug name for inclusion in messages. */
export function named(name: string | undefined): string {
  return name ? ` "${name}"` : ""
}

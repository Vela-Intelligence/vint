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
  "E-FOR-DUPKEY": (key: string) =>
    `E-FOR-DUPKEY: For rendered two rows with the same key (${key}). Keys must be unique — pass a key function that returns a unique id: For({ each, key: t => t.id, ... }).`,
  "E-FOR-SAMEREF": () =>
    `E-FOR-SAMEREF: For received the same array instance as last time — it was mutated in place, and rows keyed by identity cannot see that. Update immutably (set([...prev, item])), and give object rows a key function.`,
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

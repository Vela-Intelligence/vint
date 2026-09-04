/**
 * Test-only feature flag. `VINT_FULL=1` turns on the arms that reproduce
 * defects the current code still has (assessment §6) — until the fix lands
 * they are `test.fails`. Both vitest configs define `__VINT_FULL__` from the
 * environment so the flag works in Node and in browser mode alike, where
 * `process` does not exist.
 */
declare const __VINT_FULL__: boolean | undefined
export const FULL: boolean = typeof __VINT_FULL__ !== "undefined" ? __VINT_FULL__ : false

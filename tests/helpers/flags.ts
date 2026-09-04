/**
 * Test-only feature flag, ON by default since Phase 2: the arms that
 * reproduce assessment findings run as real tests. `VINT_FULL=0` turns them
 * off to reproduce the Phase 1 baseline. Both vitest configs define
 * `__VINT_FULL__` from the environment so the flag works in Node and in
 * browser mode alike, where `process` does not exist.
 */
declare const __VINT_FULL__: boolean | undefined
export const FULL: boolean = typeof __VINT_FULL__ !== "undefined" ? __VINT_FULL__ : true

/**
 * vint — AI-native vanilla TypeScript UI framework.
 * Real DOM, VanJS-shaped tag functions, Solid-faithful reactivity.
 *
 * The single public surface. One name per concept — no aliases.
 * Semantics: docs/contract.md. Agent guide: skills/vint/SKILL.md.
 */

export type { MatchProps } from "./control"
export { For, Match, Show, Switch } from "./control"
export type { Child, Props, SvgTags, TagFn, Tags } from "./dom"
export { mount, tags, tagsNS } from "./dom"
export type {
  Reactive,
  StyleValue,
  SvgTagPropsMap,
  TagPropsMap,
} from "./props.generated"
export type { Accessor, Owner, Setter, SignalOptions } from "./reactive"
export {
  batch,
  createEffect,
  createMemo,
  createRenderEffect,
  createRoot,
  createSignal,
  getOwner,
  on,
  onCleanup,
  onMount,
  runWithOwner,
  untrack,
} from "./reactive"
export type {
  InitializedResourceAccessor,
  InitializedResourceControls,
  ResourceAccessor,
  ResourceControls,
  ResourceFetcherInfo,
  ResourceOptions,
} from "./resource"
export { createResource } from "./resource"
export { createSelector } from "./selector"

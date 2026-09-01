/**
 * vint — AI-native vanilla TypeScript UI framework.
 * Real DOM, VanJS-shaped tag functions, Solid-faithful reactivity.
 *
 * The single public surface. One name per concept — no aliases.
 * Semantics: docs/contract.md. Agent guide: docs/llms.txt.
 */

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
export type { Accessor, Owner, Setter, SignalOptions } from "./reactive"

export { mount, tags, tagsNS } from "./dom"
export type { Child, Props, TagFn, Tags } from "./dom"

export { For, Match, Show, Switch } from "./control"
export type { MatchProps } from "./control"

export { createResource } from "./resource"
export type { ResourceAccessor, ResourceControls, ResourceFetcherInfo } from "./resource"

// Type-level test for src/props.generated.ts (contract D11). Compiled by
// `npm run typecheck`, never executed: every `@ts-expect-error` line FAILS
// the build if the expression below it is NOT a type error, and every plain
// call fails the build if it IS one. Tag functions are declared locally so
// this file does not depend on src/dom.ts's `Tags` type.

import type { HTMLElementProps, SvgTagPropsMap, TagPropsMap } from "../../src/props.generated"

type Tag<K extends keyof TagPropsMap, E> = (props?: TagPropsMap[K], ...children: unknown[]) => E
type SvgTag<K extends keyof SvgTagPropsMap, E> = (props?: SvgTagPropsMap[K], ...children: unknown[]) => E

declare const div: Tag<"div", HTMLDivElement>
declare const input: Tag<"input", HTMLInputElement>
declare const button: Tag<"button", HTMLButtonElement>
declare const a: Tag<"a", HTMLAnchorElement>
declare const label: Tag<"label", HTMLLabelElement>
declare const svg: { svg: SvgTag<"svg", SVGSVGElement>; path: SvgTag<"path", SVGPathElement> }

// --- misuse is a compile error -------------------------------------------

// @ts-expect-error misspelt key (excess property, despite the template index signatures)
div({ clas: "x" })
// @ts-expect-error value is a string property
input({ value: 42 })
// @ts-expect-error checked is a boolean property
input({ checked: "yes" })
// @ts-expect-error a string under an event key is never a listener (D8)
button({ onclick: "alert(1)" })
// @ts-expect-error listeners receive exactly one argument
button({ onclick: (_e: MouseEvent, _extra: number) => 0 })
// @ts-expect-error tabIndex (IDL) is a number; the attribute form is `tabindex`
input({ tabIndex: "abc" })
// @ts-expect-error a binding must return the property's type
a({ href: () => 5 })
// @ts-expect-error the event type is inferred, so a typo on it is caught
button({ onclick: (e) => e.nosuch })
// @ts-expect-error a prop of another element is not accepted here
div({ checked: true })
// @ts-expect-error a data-* value is a primitive
div({ "data-row": {} })
// @ts-expect-error the runtime rejects `ref` (E-NO-REF); the type does too
div({ ref: (el: Element) => el })
// @ts-expect-error the runtime rejects `classList` (E-NO-CLASSLIST); the type does too
div({ classList: { on: true } })
// @ts-expect-error SVG keys are checked too
svg.svg({ viewbox: "0 0 1 1" })

// --- correct use compiles --------------------------------------------------

div({ class: "x", id: () => "y", hidden: true, "data-row": 1, "aria-label": "z" })
input({ value: () => "s", oninput: (e) => e.target, checked: () => true })
button({ onclick: (e) => e.clientX })
button({ onclick: (e: MouseEvent) => e.preventDefault() })
div({ "on:vi-change": (e) => e, "prop:renderer": () => 1, "attr:foo": "bar" })
a({ href: "/x", title: () => undefined, tabindex: 0 })
div({ style: () => ({ color: "red", marginTop: 4 }) })
div({ style: "color: red" })
div({ title: null, id: undefined, hidden: () => null })
label({ for: "field", role: "presentation" })
svg.svg({ viewBox: "0 0 1 1", class: "c" })
svg.path({ d: "M0 0", "stroke-width": 2 })
div()

// `onclick` receives a mouse event: lib.dom spells it PointerEvent (a MouseEvent subtype).
type OnClick = NonNullable<HTMLElementProps["onclick"]>
type ClickEvent = Parameters<OnClick>[0]
const clickEventIsMouseEvent: ClickEvent extends MouseEvent ? true : never = true
void clickEventIsMouseEvent

// Every tag of the two lib.dom maps has an entry, and no extra keys are invented.
const htmlKeysMatch: keyof TagPropsMap extends keyof HTMLElementTagNameMap
  ? keyof HTMLElementTagNameMap extends keyof TagPropsMap
    ? true
    : never
  : never = true
const svgKeysMatch: keyof SvgTagPropsMap extends keyof SVGElementTagNameMap
  ? keyof SVGElementTagNameMap extends keyof SvgTagPropsMap
    ? true
    : never
  : never = true
void htmlKeysMatch
void svgKeysMatch

#!/usr/bin/env node
// Generates src/props.generated.ts — the per-tag prop types promised by
// docs/contract.md D11 — from the lib.dom.d.ts shipped with the repo's
// TypeScript. Deterministic: sorted output, no timestamps, formatted by biome,
// so `--check` can compare a fresh generation with the committed file.
//
//   node scripts/gen-props.mjs          write src/props.generated.ts
//   node scripts/gen-props.mjs --check  exit 1 (with a diff summary) if stale
//
// What is generated (see the header of the output for the reader-facing
// version):
//   - every writable, non-function, non-`on*` IDL property of HTMLElement
//     (the HTML base) and of SVGElement (the SVG base), typed `Reactive<T>`
//     with T spelled exactly as lib.dom declares it;
//   - per element interface, the DELTA against its base — properties the
//     base lacks or declares with a different type — so `HTMLInputElement`
//     contributes `value`, `checked`, ... and `HTMLSpanElement` (no delta)
//     maps straight to the base;
//   - `on<event>` handlers from HTMLElementEventMap / SVGElementEventMap;
//   - `TagPropsMap` / `SvgTagPropsMap` covering every key of
//     HTMLElementTagNameMap / SVGElementTagNameMap.
// Hand-written parts (attributes that are not IDL properties, the escape
// hatches, SVG presentation attributes) live in the HAND_WRITTEN_* tables.

import { execFileSync } from "node:child_process"
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join, relative } from "node:path"
import { fileURLToPath } from "node:url"
import ts from "typescript"

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..")
const OUT = join(ROOT, "src", "props.generated.ts")
const CHECK = process.argv.includes("--check")

// ---------------------------------------------------------------------------
// Hand-written parts
// ---------------------------------------------------------------------------

/** Keys the runtime rejects (E-NO-REF, E-NO-CLASSLIST) or routes specially
 *  (`style`); never emitted as generated IDL props. */
const RUNTIME_OWNED = new Set(["ref", "classList", "style"])

/** Attributes (not IDL properties) that every HTML tag accepts. Override a
 *  generated IDL prop of the same name (`role`). */
const HAND_WRITTEN_HTML = [
  ["class", "Reactive<string>", "the class attribute (className is the IDL twin)"],
  ["for", "Reactive<string>", "<label for> / <output for> (htmlFor is the IDL twin)"],
  ["role", "Reactive<string>", "ARIA role"],
  ["style", "Reactive<StyleValue>", "cssText string, or an object diffed key by key (D7)"],
  ["tabindex", "Reactive<number | string>", "the attribute form (tabIndex is the IDL twin)"],
]

/** SVG presentation attributes. SVG IDL properties are almost all readonly
 *  SVGAnimated* objects, so the attribute names are the usable surface. Both
 *  the camelCase and the hyphenated spelling are accepted where they differ. */
const HAND_WRITTEN_SVG = [
  ["class", "Reactive<string>", "the class attribute"],
  ["role", "Reactive<string>", "ARIA role"],
  ["style", "Reactive<StyleValue>", "cssText string, or an object diffed key by key (D7)"],
  ["tabindex", "Reactive<number | string>", "the attribute form (tabIndex is the IDL twin)"],
  ...[
    "viewBox",
    "d",
    "fill",
    "stroke",
    "strokeWidth",
    "stroke-width",
    "cx",
    "cy",
    "r",
    "x",
    "y",
    "width",
    "height",
    "x1",
    "y1",
    "x2",
    "y2",
    "points",
    "transform",
    "opacity",
    "href",
    "xlink:href",
    "preserveAspectRatio",
    "pathLength",
    "textAnchor",
    "dominantBaseline",
    "fontSize",
    "fontFamily",
  ].map((name) => [name, "Reactive<string | number>", null]),
]

/** A template-literal index-signature key: `on:` → `on:${string}`. */
const pattern = (prefix) => `\`${prefix}\${string}\``

/** Keys routed by prefix (D8 events, D10 prop:/attr:, data-/aria- attributes). */
const ESCAPE_HATCHES = [
  [
    pattern("on:"),
    "((ev: Event) => void) | null | undefined",
    "listener under the EXACT event name (custom events)",
  ],
  [pattern("prop:"), "unknown", "assigned as a property, never reactive, never an attribute"],
  [pattern("attr:"), "unknown", "set as an attribute, never a property"],
  [pattern("data-"), "Reactive<string | number | boolean | null | undefined>", "data-* attribute"],
  [pattern("aria-"), "Reactive<string | null | undefined>", "aria-* attribute"],
]

// ---------------------------------------------------------------------------
// lib.dom introspection
// ---------------------------------------------------------------------------

const PROBE = [
  "declare const htmlTags: HTMLElementTagNameMap",
  "declare const svgTags: SVGElementTagNameMap",
  "declare const htmlEvents: HTMLElementEventMap",
  "declare const svgEvents: SVGElementEventMap",
  "declare const htmlBase: HTMLElement",
  "declare const svgBase: SVGElement",
].join("\n")

const host = ts.createCompilerHost({})
const getSourceFile = host.getSourceFile
host.getSourceFile = (file, lang, ...rest) =>
  file === "probe.ts"
    ? ts.createSourceFile(file, PROBE, lang)
    : getSourceFile.call(host, file, lang, ...rest)
const program = ts.createProgram(
  ["probe.ts"],
  {
    lib: ["lib.es2022.d.ts", "lib.dom.d.ts"],
    strict: true,
    noEmit: true,
    types: [],
  },
  host,
)
const checker = program.getTypeChecker()
const probe = program.getSourceFile("probe.ts")

const typeOfProbe = (name) => {
  const st = probe.statements.find((s) => s.declarationList?.declarations[0].name.text === name)
  return checker.getTypeAtLocation(st.declarationList.declarations[0])
}

const text = (node) => node.getText().replace(/\s+/g, " ").trim()

/** The declared type of a symbol if it is a writable data property: a
 *  non-readonly property signature, or a get/set accessor pair (the setter's
 *  parameter type is what an assignment accepts). Null when readonly. */
function writableType(sym) {
  const decls = sym.declarations ?? []
  const setter = decls.find(ts.isSetAccessor)
  if (setter) return setter.parameters[0]?.type ? text(setter.parameters[0].type) : null
  const prop = decls.find((d) => ts.isPropertySignature(d) || ts.isPropertyDeclaration(d))
  if (!prop) return null
  if (prop.modifiers?.some((m) => m.kind === ts.SyntaxKind.ReadonlyKeyword)) return null
  if (prop.type) return text(prop.type)
  return checker.typeToString(checker.getTypeOfSymbol(sym), undefined, ts.TypeFormatFlags.NoTruncation)
}

/** [name, type] for every writable, non-function, non-`on*` IDL property of
 *  an element type, sorted by name. `on*` keys are the event surface (D8);
 *  functions are methods, which are not props. */
function idlProps(elType) {
  const out = []
  for (const sym of checker.getPropertiesOfType(elType)) {
    const name = sym.name
    if (!/^[a-zA-Z]/.test(name) || /^on/.test(name) || RUNTIME_OWNED.has(name)) continue
    const type = writableType(sym)
    if (type === null) continue
    if (checker.getTypeOfSymbol(sym).getNonNullableType().getCallSignatures().length) continue
    out.push([name, type])
  }
  return out.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
}

/** [event, EventType] for every entry of an event map, sorted. */
function eventEntries(mapType) {
  return checker
    .getPropertiesOfType(mapType)
    .map((sym) => {
      const d = sym.declarations?.find(ts.isPropertySignature)
      const type = d?.type
        ? text(d.type)
        : checker.typeToString(checker.getTypeOfSymbol(sym), undefined, ts.TypeFormatFlags.NoTruncation)
      return [sym.name, type]
    })
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
}

/** One family (HTML or SVG): base props, per-element deltas, tag → interface. */
function family({ baseName, tagMapType, baseType, handWritten }) {
  const handWrittenKeys = new Set(handWritten.map(([k]) => k))
  const base = idlProps(baseType).filter(([k]) => !handWrittenKeys.has(k))
  const baseTypes = new Map(base)
  const elements = new Map() // element interface name → { delta, tags }
  const tags = [] // [tag, propsInterface]
  const tagSyms = checker.getPropertiesOfType(tagMapType).sort((a, b) => (a.name < b.name ? -1 : 1))
  for (const tagSym of tagSyms) {
    const elType = checker.getTypeOfSymbol(tagSym)
    const elName = checker.typeToString(elType)
    if (!elements.has(elName)) {
      const delta = idlProps(elType).filter(
        ([k, t]) => !handWrittenKeys.has(k) && baseTypes.get(k) !== t,
      )
      elements.set(elName, { delta, tags: [] })
    }
    const el = elements.get(elName)
    el.tags.push(tagSym.name)
    tags.push([
      tagSym.name,
      elName === baseName || el.delta.length === 0 ? `${baseName}Props` : `${elName}Props`,
    ])
  }
  return { base, elements, tags }
}

const html = family({
  baseName: "HTMLElement",
  tagMapType: typeOfProbe("htmlTags"),
  baseType: typeOfProbe("htmlBase"),
  handWritten: HAND_WRITTEN_HTML,
})
const svg = family({
  baseName: "SVGElement",
  tagMapType: typeOfProbe("svgTags"),
  baseType: typeOfProbe("svgBase"),
  handWritten: HAND_WRITTEN_SVG,
})
const htmlEvents = eventEntries(typeOfProbe("htmlEvents"))
const svgEvents = eventEntries(typeOfProbe("svgEvents"))
const sameEvents = JSON.stringify(htmlEvents) === JSON.stringify(svgEvents)

// ---------------------------------------------------------------------------
// Emit
// ---------------------------------------------------------------------------

const key = (name) => (/^[A-Za-z_$][\w$]*$/.test(name) ? name : JSON.stringify(name))
const lines = []
const emit = (s = "") => lines.push(s)

function emitHandWritten(entries) {
  for (const [name, type, doc] of entries) emit(`  ${doc ? `/** ${doc} */ ` : ""}${key(name)}?: ${type}`)
}

function emitFamily(fam, { baseName, handWritten, eventProps, label }) {
  const deltaElements = [...fam.elements].filter(
    ([name, el]) => name !== baseName && el.delta.length > 0,
  )
  emit(`// ---------------------------------------------------------------------------`)
  emit(`// ${label}`)
  emit(`// ---------------------------------------------------------------------------`)
  emit()
  emit(`/** Props every ${label.toLowerCase()} tag accepts: attributes that are not IDL`)
  emit(` *  properties (hand-written), then every writable IDL property of ${baseName}. */`)
  emit(`export interface ${baseName}Props extends ${eventProps}, EscapeHatchProps {`)
  emitHandWritten(handWritten)
  for (const [name, type] of fam.base) emit(`  ${key(name)}?: Reactive<${type}>`)
  emit(`}`)
  for (const [elName, el] of deltaElements) {
    emit()
    emit(
      `/** Props of ${el.tags.map((t) => `<${t}>`).join(", ")} (${elName}) beyond ${baseName}Props. */`,
    )
    emit(`export interface ${elName}Props extends ${baseName}Props {`)
    for (const [name, type] of el.delta) emit(`  ${key(name)}?: Reactive<${type}>`)
    emit(`}`)
  }
}

emit(`// GENERATED FILE — DO NOT EDIT. Regenerate with \`npm run gen:props\`;`)
emit(`// \`npm run check:props\` fails when this file is stale.`)
emit(`// Source: lib.dom.d.ts from TypeScript ${ts.version}, read by scripts/gen-props.mjs.`)
emit(`// Contract: docs/contract.md D11 (typed props).`)
emit(`//`)
emit(`// How a key reaches the DOM (src/dom.ts, D6–D10):`)
emit(`//   - a function value is a zero-argument BINDING, re-run when its signals change;`)
emit(`//   - null/undefined clears the property or attribute;`)
emit(`//   - \`on<event>\` values are listeners, attached once (never a binding);`)
emit(`//   - \`on:<name>\`, \`prop:<name>\`, \`attr:<name>\` route by prefix (see EscapeHatchProps);`)
emit(`//   - \`style\` takes a cssText string or a camelCase/kebab-case object;`)
emit(
  `//   - anything else is assigned as a property when the element has one, else set as an attribute.`,
)
emit(`//`)
emit(`// Counts: ${html.base.length} HTMLElement props, ${html.tags.length} HTML tags,`)
emit(
  `// ${[...html.elements.values()].reduce((n, e) => n + e.delta.length, 0)} HTML delta props, ${svg.base.length} SVGElement props, ${svg.tags.length} SVG tags,`,
)
emit(
  `// ${[...svg.elements.values()].reduce((n, e) => n + e.delta.length, 0)} SVG delta props, ${htmlEvents.length} events.`,
)
emit()
emit(`/** A prop value: the value itself, or a zero-argument binding that returns it.`)
emit(` *  null/undefined (returned or given) clears the property or attribute (D6). */`)
emit(`export type Reactive<T> = T | null | undefined | (() => T | null | undefined)`)
emit()
emit(`/** \`style\`: a cssText string, or an object whose keys are camelCase or`)
emit(` *  kebab-case CSS properties. Object values are diffed key by key (D7). */`)
emit(`export type StyleValue = string | Record<string, string | number | null | undefined>`)
emit()
emit(`/** Keys routed by prefix rather than by name (D8, D10). Template-literal`)
emit(` *  index signatures only admit keys matching the pattern, so a misspelt`)
emit(` *  plain key (\`clas\`) is still an excess-property error. */`)
emit(`export interface EscapeHatchProps {`)
for (const [pattern, type, doc] of ESCAPE_HATCHES) emit(`  /** ${doc} */ [k: ${pattern}]: ${type}`)
emit(`}`)
emit()
emit(`/** \`on<event>\` listeners, typed from HTMLElementEventMap. Attached once with`)
emit(` *  addEventListener; a non-function value is E-EVENT-VALUE (D8). */`)
emit(`export interface HTMLElementEventProps {`)
for (const [name, type] of htmlEvents) emit(`  on${name}?: ((ev: ${type}) => void) | null | undefined`)
emit(`}`)
emit()
if (sameEvents) {
  emit(`/** SVGElementEventMap declares the same events as HTMLElementEventMap. */`)
  emit(`export type SVGElementEventProps = HTMLElementEventProps`)
} else {
  emit(`/** \`on<event>\` listeners, typed from SVGElementEventMap. */`)
  emit(`export interface SVGElementEventProps {`)
  for (const [name, type] of svgEvents) emit(`  on${name}?: ((ev: ${type}) => void) | null | undefined`)
  emit(`}`)
}
emit()
emitFamily(html, {
  baseName: "HTMLElement",
  handWritten: HAND_WRITTEN_HTML,
  eventProps: "HTMLElementEventProps",
  label: "HTML",
})
emit()
emit(`/** Tag name → props type, one entry per key of HTMLElementTagNameMap. */`)
emit(`export interface TagPropsMap {`)
for (const [tag, iface] of html.tags) emit(`  ${key(tag)}: ${iface}`)
emit(`}`)
emit()
emitFamily(svg, {
  baseName: "SVGElement",
  handWritten: HAND_WRITTEN_SVG,
  eventProps: "SVGElementEventProps",
  label: "SVG",
})
emit()
emit(`/** Tag name → props type, one entry per key of SVGElementTagNameMap. */`)
emit(`export interface SvgTagPropsMap {`)
for (const [tag, iface] of svg.tags) emit(`  ${key(tag)}: ${iface}`)
emit(`}`)
emit()

const raw = lines.join("\n")
const formatted = execFileSync(
  join(ROOT, "node_modules", ".bin", "biome"),
  ["format", `--stdin-file-path=${relative(ROOT, OUT)}`],
  { cwd: ROOT, input: raw, encoding: "utf8", maxBuffer: 1 << 24 },
)

if (CHECK) {
  const current = existsSync(OUT) ? readFileSync(OUT, "utf8") : null
  if (current === formatted) {
    console.log(
      `check:props ok — ${relative(ROOT, OUT)} is up to date (${formatted.split("\n").length - 1} lines)`,
    )
    process.exit(0)
  }
  if (current === null) {
    console.error(`check:props FAILED — ${relative(ROOT, OUT)} is missing; run \`npm run gen:props\``)
    process.exit(1)
  }
  const a = current.split("\n")
  const b = formatted.split("\n")
  let first = 0
  while (first < a.length && first < b.length && a[first] === b[first]) first++
  console.error(`check:props FAILED — ${relative(ROOT, OUT)} is stale; run \`npm run gen:props\``)
  console.error(
    `  committed: ${a.length} lines; generated: ${b.length} lines; first difference at line ${first + 1}`,
  )
  console.error(`  - ${a[first] ?? "<end of file>"}`)
  console.error(`  + ${b[first] ?? "<end of file>"}`)
  process.exit(1)
}

writeFileSync(OUT, formatted)
console.log(
  `wrote ${relative(ROOT, OUT)} (${formatted.split("\n").length - 1} lines, TypeScript ${ts.version})`,
)

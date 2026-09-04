// GENERATED FILE — DO NOT EDIT. Regenerate with `npm run gen:props`;
// `npm run check:props` fails when this file is stale.
// Source: lib.dom.d.ts from TypeScript 5.9.3, read by scripts/gen-props.mjs.
// Contract: docs/contract.md D11 (typed props).
//
// How a key reaches the DOM (src/dom.ts, D6–D10):
//   - a function value is a zero-argument BINDING, re-run when its signals change;
//   - null/undefined clears the property or attribute;
//   - `on<event>` values are listeners, attached once (never a binding);
//   - `on:<name>`, `prop:<name>`, `attr:<name>` route by prefix (see EscapeHatchProps);
//   - `style` takes a cssText string or a camelCase/kebab-case object;
//   - anything else is assigned as a property when the element has one, else set as an attribute.
//
// Counts: 82 HTMLElement props, 112 HTML tags,
// 395 HTML delta props, 63 SVGElement props, 63 SVG tags,
// 9 SVG delta props, 107 events.

/** A prop value: the value itself, or a zero-argument binding that returns it.
 *  null/undefined (returned or given) clears the property or attribute (D6). */
export type Reactive<T> = T | null | undefined | (() => T | null | undefined)

/** `style`: a cssText string, or an object whose keys are camelCase or
 *  kebab-case CSS properties. Object values are diffed key by key (D7). */
export type StyleValue = string | Record<string, string | number | null | undefined>

/** Keys routed by prefix rather than by name (D8, D10). Template-literal
 *  index signatures only admit keys matching the pattern, so a misspelt
 *  plain key (`clas`) is still an excess-property error. */
export interface EscapeHatchProps {
  /** listener under the EXACT event name (custom events) */ [k: `on:${string}`]:
    | ((ev: Event) => void)
    | null
    | undefined
  /** assigned as a property, never reactive, never an attribute */ [k: `prop:${string}`]: unknown
  /** set as an attribute, never a property */ [k: `attr:${string}`]: unknown
  /** data-* attribute */ [k: `data-${string}`]: Reactive<string | number | boolean | null | undefined>
  /** aria-* attribute */ [k: `aria-${string}`]: Reactive<string | null | undefined>
}

/** `on<event>` listeners, typed from HTMLElementEventMap. Attached once with
 *  addEventListener; a non-function value is E-EVENT-VALUE (D8). */
export interface HTMLElementEventProps {
  onabort?: ((ev: UIEvent) => void) | null | undefined
  onanimationcancel?: ((ev: AnimationEvent) => void) | null | undefined
  onanimationend?: ((ev: AnimationEvent) => void) | null | undefined
  onanimationiteration?: ((ev: AnimationEvent) => void) | null | undefined
  onanimationstart?: ((ev: AnimationEvent) => void) | null | undefined
  onauxclick?: ((ev: PointerEvent) => void) | null | undefined
  onbeforeinput?: ((ev: InputEvent) => void) | null | undefined
  onbeforematch?: ((ev: Event) => void) | null | undefined
  onbeforetoggle?: ((ev: ToggleEvent) => void) | null | undefined
  onblur?: ((ev: FocusEvent) => void) | null | undefined
  oncancel?: ((ev: Event) => void) | null | undefined
  oncanplay?: ((ev: Event) => void) | null | undefined
  oncanplaythrough?: ((ev: Event) => void) | null | undefined
  onchange?: ((ev: Event) => void) | null | undefined
  onclick?: ((ev: PointerEvent) => void) | null | undefined
  onclose?: ((ev: Event) => void) | null | undefined
  oncompositionend?: ((ev: CompositionEvent) => void) | null | undefined
  oncompositionstart?: ((ev: CompositionEvent) => void) | null | undefined
  oncompositionupdate?: ((ev: CompositionEvent) => void) | null | undefined
  oncontextlost?: ((ev: Event) => void) | null | undefined
  oncontextmenu?: ((ev: PointerEvent) => void) | null | undefined
  oncontextrestored?: ((ev: Event) => void) | null | undefined
  oncopy?: ((ev: ClipboardEvent) => void) | null | undefined
  oncuechange?: ((ev: Event) => void) | null | undefined
  oncut?: ((ev: ClipboardEvent) => void) | null | undefined
  ondblclick?: ((ev: MouseEvent) => void) | null | undefined
  ondrag?: ((ev: DragEvent) => void) | null | undefined
  ondragend?: ((ev: DragEvent) => void) | null | undefined
  ondragenter?: ((ev: DragEvent) => void) | null | undefined
  ondragleave?: ((ev: DragEvent) => void) | null | undefined
  ondragover?: ((ev: DragEvent) => void) | null | undefined
  ondragstart?: ((ev: DragEvent) => void) | null | undefined
  ondrop?: ((ev: DragEvent) => void) | null | undefined
  ondurationchange?: ((ev: Event) => void) | null | undefined
  onemptied?: ((ev: Event) => void) | null | undefined
  onended?: ((ev: Event) => void) | null | undefined
  onerror?: ((ev: ErrorEvent) => void) | null | undefined
  onfocus?: ((ev: FocusEvent) => void) | null | undefined
  onfocusin?: ((ev: FocusEvent) => void) | null | undefined
  onfocusout?: ((ev: FocusEvent) => void) | null | undefined
  onformdata?: ((ev: FormDataEvent) => void) | null | undefined
  onfullscreenchange?: ((ev: Event) => void) | null | undefined
  onfullscreenerror?: ((ev: Event) => void) | null | undefined
  ongotpointercapture?: ((ev: PointerEvent) => void) | null | undefined
  oninput?: ((ev: Event) => void) | null | undefined
  oninvalid?: ((ev: Event) => void) | null | undefined
  onkeydown?: ((ev: KeyboardEvent) => void) | null | undefined
  onkeypress?: ((ev: KeyboardEvent) => void) | null | undefined
  onkeyup?: ((ev: KeyboardEvent) => void) | null | undefined
  onload?: ((ev: Event) => void) | null | undefined
  onloadeddata?: ((ev: Event) => void) | null | undefined
  onloadedmetadata?: ((ev: Event) => void) | null | undefined
  onloadstart?: ((ev: Event) => void) | null | undefined
  onlostpointercapture?: ((ev: PointerEvent) => void) | null | undefined
  onmousedown?: ((ev: MouseEvent) => void) | null | undefined
  onmouseenter?: ((ev: MouseEvent) => void) | null | undefined
  onmouseleave?: ((ev: MouseEvent) => void) | null | undefined
  onmousemove?: ((ev: MouseEvent) => void) | null | undefined
  onmouseout?: ((ev: MouseEvent) => void) | null | undefined
  onmouseover?: ((ev: MouseEvent) => void) | null | undefined
  onmouseup?: ((ev: MouseEvent) => void) | null | undefined
  onpaste?: ((ev: ClipboardEvent) => void) | null | undefined
  onpause?: ((ev: Event) => void) | null | undefined
  onplay?: ((ev: Event) => void) | null | undefined
  onplaying?: ((ev: Event) => void) | null | undefined
  onpointercancel?: ((ev: PointerEvent) => void) | null | undefined
  onpointerdown?: ((ev: PointerEvent) => void) | null | undefined
  onpointerenter?: ((ev: PointerEvent) => void) | null | undefined
  onpointerleave?: ((ev: PointerEvent) => void) | null | undefined
  onpointermove?: ((ev: PointerEvent) => void) | null | undefined
  onpointerout?: ((ev: PointerEvent) => void) | null | undefined
  onpointerover?: ((ev: PointerEvent) => void) | null | undefined
  onpointerrawupdate?: ((ev: Event) => void) | null | undefined
  onpointerup?: ((ev: PointerEvent) => void) | null | undefined
  onprogress?: ((ev: ProgressEvent) => void) | null | undefined
  onratechange?: ((ev: Event) => void) | null | undefined
  onreset?: ((ev: Event) => void) | null | undefined
  onresize?: ((ev: UIEvent) => void) | null | undefined
  onscroll?: ((ev: Event) => void) | null | undefined
  onscrollend?: ((ev: Event) => void) | null | undefined
  onsecuritypolicyviolation?: ((ev: SecurityPolicyViolationEvent) => void) | null | undefined
  onseeked?: ((ev: Event) => void) | null | undefined
  onseeking?: ((ev: Event) => void) | null | undefined
  onselect?: ((ev: Event) => void) | null | undefined
  onselectionchange?: ((ev: Event) => void) | null | undefined
  onselectstart?: ((ev: Event) => void) | null | undefined
  onslotchange?: ((ev: Event) => void) | null | undefined
  onstalled?: ((ev: Event) => void) | null | undefined
  onsubmit?: ((ev: SubmitEvent) => void) | null | undefined
  onsuspend?: ((ev: Event) => void) | null | undefined
  ontimeupdate?: ((ev: Event) => void) | null | undefined
  ontoggle?: ((ev: ToggleEvent) => void) | null | undefined
  ontouchcancel?: ((ev: TouchEvent) => void) | null | undefined
  ontouchend?: ((ev: TouchEvent) => void) | null | undefined
  ontouchmove?: ((ev: TouchEvent) => void) | null | undefined
  ontouchstart?: ((ev: TouchEvent) => void) | null | undefined
  ontransitioncancel?: ((ev: TransitionEvent) => void) | null | undefined
  ontransitionend?: ((ev: TransitionEvent) => void) | null | undefined
  ontransitionrun?: ((ev: TransitionEvent) => void) | null | undefined
  ontransitionstart?: ((ev: TransitionEvent) => void) | null | undefined
  onvolumechange?: ((ev: Event) => void) | null | undefined
  onwaiting?: ((ev: Event) => void) | null | undefined
  onwebkitanimationend?: ((ev: Event) => void) | null | undefined
  onwebkitanimationiteration?: ((ev: Event) => void) | null | undefined
  onwebkitanimationstart?: ((ev: Event) => void) | null | undefined
  onwebkittransitionend?: ((ev: Event) => void) | null | undefined
  onwheel?: ((ev: WheelEvent) => void) | null | undefined
}

/** SVGElementEventMap declares the same events as HTMLElementEventMap. */
export type SVGElementEventProps = HTMLElementEventProps

// ---------------------------------------------------------------------------
// HTML
// ---------------------------------------------------------------------------

/** Props every html tag accepts: attributes that are not IDL
 *  properties (hand-written), then every writable IDL property of HTMLElement. */
export interface HTMLElementProps extends HTMLElementEventProps, EscapeHatchProps {
  /** the class attribute (className is the IDL twin) */ class?: Reactive<string>
  /** <label for> / <output for> (htmlFor is the IDL twin) */ for?: Reactive<string>
  /** ARIA role */ role?: Reactive<string>
  /** cssText string, or an object diffed key by key (D7) */ style?: Reactive<StyleValue>
  /** the attribute form (tabIndex is the IDL twin) */ tabindex?: Reactive<number | string>
  accessKey?: Reactive<string>
  ariaActiveDescendantElement?: Reactive<Element | null>
  ariaAtomic?: Reactive<string | null>
  ariaAutoComplete?: Reactive<string | null>
  ariaBrailleLabel?: Reactive<string | null>
  ariaBrailleRoleDescription?: Reactive<string | null>
  ariaBusy?: Reactive<string | null>
  ariaChecked?: Reactive<string | null>
  ariaColCount?: Reactive<string | null>
  ariaColIndex?: Reactive<string | null>
  ariaColIndexText?: Reactive<string | null>
  ariaColSpan?: Reactive<string | null>
  ariaControlsElements?: Reactive<ReadonlyArray<Element> | null>
  ariaCurrent?: Reactive<string | null>
  ariaDescribedByElements?: Reactive<ReadonlyArray<Element> | null>
  ariaDescription?: Reactive<string | null>
  ariaDetailsElements?: Reactive<ReadonlyArray<Element> | null>
  ariaDisabled?: Reactive<string | null>
  ariaErrorMessageElements?: Reactive<ReadonlyArray<Element> | null>
  ariaExpanded?: Reactive<string | null>
  ariaFlowToElements?: Reactive<ReadonlyArray<Element> | null>
  ariaHasPopup?: Reactive<string | null>
  ariaHidden?: Reactive<string | null>
  ariaInvalid?: Reactive<string | null>
  ariaKeyShortcuts?: Reactive<string | null>
  ariaLabel?: Reactive<string | null>
  ariaLabelledByElements?: Reactive<ReadonlyArray<Element> | null>
  ariaLevel?: Reactive<string | null>
  ariaLive?: Reactive<string | null>
  ariaModal?: Reactive<string | null>
  ariaMultiLine?: Reactive<string | null>
  ariaMultiSelectable?: Reactive<string | null>
  ariaOrientation?: Reactive<string | null>
  ariaOwnsElements?: Reactive<ReadonlyArray<Element> | null>
  ariaPlaceholder?: Reactive<string | null>
  ariaPosInSet?: Reactive<string | null>
  ariaPressed?: Reactive<string | null>
  ariaReadOnly?: Reactive<string | null>
  ariaRelevant?: Reactive<string | null>
  ariaRequired?: Reactive<string | null>
  ariaRoleDescription?: Reactive<string | null>
  ariaRowCount?: Reactive<string | null>
  ariaRowIndex?: Reactive<string | null>
  ariaRowIndexText?: Reactive<string | null>
  ariaRowSpan?: Reactive<string | null>
  ariaSelected?: Reactive<string | null>
  ariaSetSize?: Reactive<string | null>
  ariaSort?: Reactive<string | null>
  ariaValueMax?: Reactive<string | null>
  ariaValueMin?: Reactive<string | null>
  ariaValueNow?: Reactive<string | null>
  ariaValueText?: Reactive<string | null>
  autocapitalize?: Reactive<string>
  autocorrect?: Reactive<boolean>
  autofocus?: Reactive<boolean>
  className?: Reactive<string>
  contentEditable?: Reactive<string>
  dir?: Reactive<string>
  draggable?: Reactive<boolean>
  enterKeyHint?: Reactive<string>
  hidden?: Reactive<boolean>
  id?: Reactive<string>
  inert?: Reactive<boolean>
  innerHTML?: Reactive<string>
  innerText?: Reactive<string>
  inputMode?: Reactive<string>
  lang?: Reactive<string>
  nodeValue?: Reactive<string | null>
  nonce?: Reactive<string>
  outerHTML?: Reactive<string>
  outerText?: Reactive<string>
  part?: Reactive<string>
  popover?: Reactive<string | null>
  scrollLeft?: Reactive<number>
  scrollTop?: Reactive<number>
  slot?: Reactive<string>
  spellcheck?: Reactive<boolean>
  tabIndex?: Reactive<number>
  textContent?: Reactive<string | null>
  title?: Reactive<string>
  translate?: Reactive<boolean>
  writingSuggestions?: Reactive<string>
}

/** Props of <a> (HTMLAnchorElement) beyond HTMLElementProps. */
export interface HTMLAnchorElementProps extends HTMLElementProps {
  charset?: Reactive<string>
  coords?: Reactive<string>
  download?: Reactive<string>
  hash?: Reactive<string>
  host?: Reactive<string>
  hostname?: Reactive<string>
  href?: Reactive<string>
  hreflang?: Reactive<string>
  name?: Reactive<string>
  password?: Reactive<string>
  pathname?: Reactive<string>
  ping?: Reactive<string>
  port?: Reactive<string>
  protocol?: Reactive<string>
  referrerPolicy?: Reactive<string>
  rel?: Reactive<string>
  relList?: Reactive<string>
  rev?: Reactive<string>
  search?: Reactive<string>
  shape?: Reactive<string>
  target?: Reactive<string>
  text?: Reactive<string>
  type?: Reactive<string>
  username?: Reactive<string>
}

/** Props of <area> (HTMLAreaElement) beyond HTMLElementProps. */
export interface HTMLAreaElementProps extends HTMLElementProps {
  alt?: Reactive<string>
  coords?: Reactive<string>
  download?: Reactive<string>
  hash?: Reactive<string>
  host?: Reactive<string>
  hostname?: Reactive<string>
  href?: Reactive<string>
  noHref?: Reactive<boolean>
  password?: Reactive<string>
  pathname?: Reactive<string>
  ping?: Reactive<string>
  port?: Reactive<string>
  protocol?: Reactive<string>
  referrerPolicy?: Reactive<string>
  rel?: Reactive<string>
  relList?: Reactive<string>
  search?: Reactive<string>
  shape?: Reactive<string>
  target?: Reactive<string>
  username?: Reactive<string>
}

/** Props of <audio> (HTMLAudioElement) beyond HTMLElementProps. */
export interface HTMLAudioElementProps extends HTMLElementProps {
  autoplay?: Reactive<boolean>
  controls?: Reactive<boolean>
  crossOrigin?: Reactive<string | null>
  currentTime?: Reactive<number>
  defaultMuted?: Reactive<boolean>
  defaultPlaybackRate?: Reactive<number>
  disableRemotePlayback?: Reactive<boolean>
  loop?: Reactive<boolean>
  muted?: Reactive<boolean>
  playbackRate?: Reactive<number>
  preload?: Reactive<"none" | "metadata" | "auto" | "">
  preservesPitch?: Reactive<boolean>
  src?: Reactive<string>
  srcObject?: Reactive<MediaProvider | null>
  volume?: Reactive<number>
}

/** Props of <base> (HTMLBaseElement) beyond HTMLElementProps. */
export interface HTMLBaseElementProps extends HTMLElementProps {
  href?: Reactive<string>
  target?: Reactive<string>
}

/** Props of <blockquote>, <q> (HTMLQuoteElement) beyond HTMLElementProps. */
export interface HTMLQuoteElementProps extends HTMLElementProps {
  cite?: Reactive<string>
}

/** Props of <body> (HTMLBodyElement) beyond HTMLElementProps. */
export interface HTMLBodyElementProps extends HTMLElementProps {
  aLink?: Reactive<string>
  background?: Reactive<string>
  bgColor?: Reactive<string>
  link?: Reactive<string>
  text?: Reactive<string>
  vLink?: Reactive<string>
}

/** Props of <br> (HTMLBRElement) beyond HTMLElementProps. */
export interface HTMLBRElementProps extends HTMLElementProps {
  clear?: Reactive<string>
}

/** Props of <button> (HTMLButtonElement) beyond HTMLElementProps. */
export interface HTMLButtonElementProps extends HTMLElementProps {
  disabled?: Reactive<boolean>
  formAction?: Reactive<string>
  formEnctype?: Reactive<string>
  formMethod?: Reactive<string>
  formNoValidate?: Reactive<boolean>
  formTarget?: Reactive<string>
  name?: Reactive<string>
  popoverTargetAction?: Reactive<string>
  popoverTargetElement?: Reactive<Element | null>
  type?: Reactive<"submit" | "reset" | "button">
  value?: Reactive<string>
}

/** Props of <canvas> (HTMLCanvasElement) beyond HTMLElementProps. */
export interface HTMLCanvasElementProps extends HTMLElementProps {
  height?: Reactive<number>
  width?: Reactive<number>
}

/** Props of <caption> (HTMLTableCaptionElement) beyond HTMLElementProps. */
export interface HTMLTableCaptionElementProps extends HTMLElementProps {
  align?: Reactive<string>
}

/** Props of <col>, <colgroup> (HTMLTableColElement) beyond HTMLElementProps. */
export interface HTMLTableColElementProps extends HTMLElementProps {
  align?: Reactive<string>
  ch?: Reactive<string>
  chOff?: Reactive<string>
  span?: Reactive<number>
  vAlign?: Reactive<string>
  width?: Reactive<string>
}

/** Props of <data> (HTMLDataElement) beyond HTMLElementProps. */
export interface HTMLDataElementProps extends HTMLElementProps {
  value?: Reactive<string>
}

/** Props of <del>, <ins> (HTMLModElement) beyond HTMLElementProps. */
export interface HTMLModElementProps extends HTMLElementProps {
  cite?: Reactive<string>
  dateTime?: Reactive<string>
}

/** Props of <details> (HTMLDetailsElement) beyond HTMLElementProps. */
export interface HTMLDetailsElementProps extends HTMLElementProps {
  name?: Reactive<string>
  open?: Reactive<boolean>
}

/** Props of <dialog> (HTMLDialogElement) beyond HTMLElementProps. */
export interface HTMLDialogElementProps extends HTMLElementProps {
  open?: Reactive<boolean>
  returnValue?: Reactive<string>
}

/** Props of <div> (HTMLDivElement) beyond HTMLElementProps. */
export interface HTMLDivElementProps extends HTMLElementProps {
  align?: Reactive<string>
}

/** Props of <dl> (HTMLDListElement) beyond HTMLElementProps. */
export interface HTMLDListElementProps extends HTMLElementProps {
  compact?: Reactive<boolean>
}

/** Props of <embed> (HTMLEmbedElement) beyond HTMLElementProps. */
export interface HTMLEmbedElementProps extends HTMLElementProps {
  align?: Reactive<string>
  height?: Reactive<string>
  name?: Reactive<string>
  src?: Reactive<string>
  type?: Reactive<string>
  width?: Reactive<string>
}

/** Props of <fieldset> (HTMLFieldSetElement) beyond HTMLElementProps. */
export interface HTMLFieldSetElementProps extends HTMLElementProps {
  disabled?: Reactive<boolean>
  name?: Reactive<string>
}

/** Props of <form> (HTMLFormElement) beyond HTMLElementProps. */
export interface HTMLFormElementProps extends HTMLElementProps {
  acceptCharset?: Reactive<string>
  action?: Reactive<string>
  autocomplete?: Reactive<AutoFillBase>
  encoding?: Reactive<string>
  enctype?: Reactive<string>
  method?: Reactive<string>
  name?: Reactive<string>
  noValidate?: Reactive<boolean>
  rel?: Reactive<string>
  relList?: Reactive<string>
  target?: Reactive<string>
}

/** Props of <h1>, <h2>, <h3>, <h4>, <h5>, <h6> (HTMLHeadingElement) beyond HTMLElementProps. */
export interface HTMLHeadingElementProps extends HTMLElementProps {
  align?: Reactive<string>
}

/** Props of <hr> (HTMLHRElement) beyond HTMLElementProps. */
export interface HTMLHRElementProps extends HTMLElementProps {
  align?: Reactive<string>
  color?: Reactive<string>
  noShade?: Reactive<boolean>
  size?: Reactive<string>
  width?: Reactive<string>
}

/** Props of <html> (HTMLHtmlElement) beyond HTMLElementProps. */
export interface HTMLHtmlElementProps extends HTMLElementProps {
  version?: Reactive<string>
}

/** Props of <iframe> (HTMLIFrameElement) beyond HTMLElementProps. */
export interface HTMLIFrameElementProps extends HTMLElementProps {
  align?: Reactive<string>
  allow?: Reactive<string>
  allowFullscreen?: Reactive<boolean>
  frameBorder?: Reactive<string>
  height?: Reactive<string>
  loading?: Reactive<"eager" | "lazy">
  longDesc?: Reactive<string>
  marginHeight?: Reactive<string>
  marginWidth?: Reactive<string>
  name?: Reactive<string>
  referrerPolicy?: Reactive<ReferrerPolicy>
  sandbox?: Reactive<string>
  scrolling?: Reactive<string>
  src?: Reactive<string>
  srcdoc?: Reactive<string>
  width?: Reactive<string>
}

/** Props of <img> (HTMLImageElement) beyond HTMLElementProps. */
export interface HTMLImageElementProps extends HTMLElementProps {
  align?: Reactive<string>
  alt?: Reactive<string>
  border?: Reactive<string>
  crossOrigin?: Reactive<string | null>
  decoding?: Reactive<"async" | "sync" | "auto">
  fetchPriority?: Reactive<"high" | "low" | "auto">
  height?: Reactive<number>
  hspace?: Reactive<number>
  isMap?: Reactive<boolean>
  loading?: Reactive<"eager" | "lazy">
  longDesc?: Reactive<string>
  lowsrc?: Reactive<string>
  name?: Reactive<string>
  referrerPolicy?: Reactive<string>
  sizes?: Reactive<string>
  src?: Reactive<string>
  srcset?: Reactive<string>
  useMap?: Reactive<string>
  vspace?: Reactive<number>
  width?: Reactive<number>
}

/** Props of <input> (HTMLInputElement) beyond HTMLElementProps. */
export interface HTMLInputElementProps extends HTMLElementProps {
  accept?: Reactive<string>
  align?: Reactive<string>
  alt?: Reactive<string>
  autocomplete?: Reactive<AutoFill>
  capture?: Reactive<string>
  checked?: Reactive<boolean>
  defaultChecked?: Reactive<boolean>
  defaultValue?: Reactive<string>
  dirName?: Reactive<string>
  disabled?: Reactive<boolean>
  files?: Reactive<FileList | null>
  formAction?: Reactive<string>
  formEnctype?: Reactive<string>
  formMethod?: Reactive<string>
  formNoValidate?: Reactive<boolean>
  formTarget?: Reactive<string>
  height?: Reactive<number>
  indeterminate?: Reactive<boolean>
  max?: Reactive<string>
  maxLength?: Reactive<number>
  min?: Reactive<string>
  minLength?: Reactive<number>
  multiple?: Reactive<boolean>
  name?: Reactive<string>
  pattern?: Reactive<string>
  placeholder?: Reactive<string>
  popoverTargetAction?: Reactive<string>
  popoverTargetElement?: Reactive<Element | null>
  readOnly?: Reactive<boolean>
  required?: Reactive<boolean>
  selectionDirection?: Reactive<"forward" | "backward" | "none" | null>
  selectionEnd?: Reactive<number | null>
  selectionStart?: Reactive<number | null>
  size?: Reactive<number>
  src?: Reactive<string>
  step?: Reactive<string>
  type?: Reactive<string>
  useMap?: Reactive<string>
  value?: Reactive<string>
  valueAsDate?: Reactive<Date | null>
  valueAsNumber?: Reactive<number>
  webkitdirectory?: Reactive<boolean>
  width?: Reactive<number>
}

/** Props of <label> (HTMLLabelElement) beyond HTMLElementProps. */
export interface HTMLLabelElementProps extends HTMLElementProps {
  htmlFor?: Reactive<string>
}

/** Props of <legend> (HTMLLegendElement) beyond HTMLElementProps. */
export interface HTMLLegendElementProps extends HTMLElementProps {
  align?: Reactive<string>
}

/** Props of <li> (HTMLLIElement) beyond HTMLElementProps. */
export interface HTMLLIElementProps extends HTMLElementProps {
  type?: Reactive<string>
  value?: Reactive<number>
}

/** Props of <link> (HTMLLinkElement) beyond HTMLElementProps. */
export interface HTMLLinkElementProps extends HTMLElementProps {
  as?: Reactive<string>
  blocking?: Reactive<string>
  charset?: Reactive<string>
  crossOrigin?: Reactive<string | null>
  disabled?: Reactive<boolean>
  fetchPriority?: Reactive<"high" | "low" | "auto">
  href?: Reactive<string>
  hreflang?: Reactive<string>
  imageSizes?: Reactive<string>
  imageSrcset?: Reactive<string>
  integrity?: Reactive<string>
  media?: Reactive<string>
  referrerPolicy?: Reactive<string>
  rel?: Reactive<string>
  relList?: Reactive<string>
  rev?: Reactive<string>
  sizes?: Reactive<string>
  target?: Reactive<string>
  type?: Reactive<string>
}

/** Props of <map> (HTMLMapElement) beyond HTMLElementProps. */
export interface HTMLMapElementProps extends HTMLElementProps {
  name?: Reactive<string>
}

/** Props of <menu> (HTMLMenuElement) beyond HTMLElementProps. */
export interface HTMLMenuElementProps extends HTMLElementProps {
  compact?: Reactive<boolean>
}

/** Props of <meta> (HTMLMetaElement) beyond HTMLElementProps. */
export interface HTMLMetaElementProps extends HTMLElementProps {
  content?: Reactive<string>
  httpEquiv?: Reactive<string>
  media?: Reactive<string>
  name?: Reactive<string>
  scheme?: Reactive<string>
}

/** Props of <meter> (HTMLMeterElement) beyond HTMLElementProps. */
export interface HTMLMeterElementProps extends HTMLElementProps {
  high?: Reactive<number>
  low?: Reactive<number>
  max?: Reactive<number>
  min?: Reactive<number>
  optimum?: Reactive<number>
  value?: Reactive<number>
}

/** Props of <object> (HTMLObjectElement) beyond HTMLElementProps. */
export interface HTMLObjectElementProps extends HTMLElementProps {
  align?: Reactive<string>
  archive?: Reactive<string>
  border?: Reactive<string>
  code?: Reactive<string>
  codeBase?: Reactive<string>
  codeType?: Reactive<string>
  data?: Reactive<string>
  declare?: Reactive<boolean>
  height?: Reactive<string>
  hspace?: Reactive<number>
  name?: Reactive<string>
  standby?: Reactive<string>
  type?: Reactive<string>
  useMap?: Reactive<string>
  vspace?: Reactive<number>
  width?: Reactive<string>
}

/** Props of <ol> (HTMLOListElement) beyond HTMLElementProps. */
export interface HTMLOListElementProps extends HTMLElementProps {
  compact?: Reactive<boolean>
  reversed?: Reactive<boolean>
  start?: Reactive<number>
  type?: Reactive<string>
}

/** Props of <optgroup> (HTMLOptGroupElement) beyond HTMLElementProps. */
export interface HTMLOptGroupElementProps extends HTMLElementProps {
  disabled?: Reactive<boolean>
  label?: Reactive<string>
}

/** Props of <option> (HTMLOptionElement) beyond HTMLElementProps. */
export interface HTMLOptionElementProps extends HTMLElementProps {
  defaultSelected?: Reactive<boolean>
  disabled?: Reactive<boolean>
  label?: Reactive<string>
  selected?: Reactive<boolean>
  text?: Reactive<string>
  value?: Reactive<string>
}

/** Props of <output> (HTMLOutputElement) beyond HTMLElementProps. */
export interface HTMLOutputElementProps extends HTMLElementProps {
  defaultValue?: Reactive<string>
  htmlFor?: Reactive<string>
  name?: Reactive<string>
  value?: Reactive<string>
}

/** Props of <p> (HTMLParagraphElement) beyond HTMLElementProps. */
export interface HTMLParagraphElementProps extends HTMLElementProps {
  align?: Reactive<string>
}

/** Props of <pre> (HTMLPreElement) beyond HTMLElementProps. */
export interface HTMLPreElementProps extends HTMLElementProps {
  width?: Reactive<number>
}

/** Props of <progress> (HTMLProgressElement) beyond HTMLElementProps. */
export interface HTMLProgressElementProps extends HTMLElementProps {
  max?: Reactive<number>
  value?: Reactive<number>
}

/** Props of <script> (HTMLScriptElement) beyond HTMLElementProps. */
export interface HTMLScriptElementProps extends HTMLElementProps {
  async?: Reactive<boolean>
  blocking?: Reactive<string>
  charset?: Reactive<string>
  crossOrigin?: Reactive<string | null>
  defer?: Reactive<boolean>
  event?: Reactive<string>
  fetchPriority?: Reactive<"high" | "low" | "auto">
  htmlFor?: Reactive<string>
  integrity?: Reactive<string>
  noModule?: Reactive<boolean>
  referrerPolicy?: Reactive<string>
  src?: Reactive<string>
  text?: Reactive<string>
  type?: Reactive<string>
}

/** Props of <select> (HTMLSelectElement) beyond HTMLElementProps. */
export interface HTMLSelectElementProps extends HTMLElementProps {
  autocomplete?: Reactive<AutoFill>
  disabled?: Reactive<boolean>
  length?: Reactive<number>
  multiple?: Reactive<boolean>
  name?: Reactive<string>
  required?: Reactive<boolean>
  selectedIndex?: Reactive<number>
  size?: Reactive<number>
  value?: Reactive<string>
}

/** Props of <slot> (HTMLSlotElement) beyond HTMLElementProps. */
export interface HTMLSlotElementProps extends HTMLElementProps {
  name?: Reactive<string>
}

/** Props of <source> (HTMLSourceElement) beyond HTMLElementProps. */
export interface HTMLSourceElementProps extends HTMLElementProps {
  height?: Reactive<number>
  media?: Reactive<string>
  sizes?: Reactive<string>
  src?: Reactive<string>
  srcset?: Reactive<string>
  type?: Reactive<string>
  width?: Reactive<number>
}

/** Props of <style> (HTMLStyleElement) beyond HTMLElementProps. */
export interface HTMLStyleElementProps extends HTMLElementProps {
  blocking?: Reactive<string>
  disabled?: Reactive<boolean>
  media?: Reactive<string>
  type?: Reactive<string>
}

/** Props of <table> (HTMLTableElement) beyond HTMLElementProps. */
export interface HTMLTableElementProps extends HTMLElementProps {
  align?: Reactive<string>
  bgColor?: Reactive<string>
  border?: Reactive<string>
  caption?: Reactive<HTMLTableCaptionElement | null>
  cellPadding?: Reactive<string>
  cellSpacing?: Reactive<string>
  frame?: Reactive<string>
  rules?: Reactive<string>
  summary?: Reactive<string>
  tFoot?: Reactive<HTMLTableSectionElement | null>
  tHead?: Reactive<HTMLTableSectionElement | null>
  width?: Reactive<string>
}

/** Props of <tbody>, <tfoot>, <thead> (HTMLTableSectionElement) beyond HTMLElementProps. */
export interface HTMLTableSectionElementProps extends HTMLElementProps {
  align?: Reactive<string>
  ch?: Reactive<string>
  chOff?: Reactive<string>
  vAlign?: Reactive<string>
}

/** Props of <td>, <th> (HTMLTableCellElement) beyond HTMLElementProps. */
export interface HTMLTableCellElementProps extends HTMLElementProps {
  abbr?: Reactive<string>
  align?: Reactive<string>
  axis?: Reactive<string>
  bgColor?: Reactive<string>
  ch?: Reactive<string>
  chOff?: Reactive<string>
  colSpan?: Reactive<number>
  headers?: Reactive<string>
  height?: Reactive<string>
  noWrap?: Reactive<boolean>
  rowSpan?: Reactive<number>
  scope?: Reactive<string>
  vAlign?: Reactive<string>
  width?: Reactive<string>
}

/** Props of <template> (HTMLTemplateElement) beyond HTMLElementProps. */
export interface HTMLTemplateElementProps extends HTMLElementProps {
  shadowRootClonable?: Reactive<boolean>
  shadowRootDelegatesFocus?: Reactive<boolean>
  shadowRootMode?: Reactive<string>
  shadowRootSerializable?: Reactive<boolean>
}

/** Props of <textarea> (HTMLTextAreaElement) beyond HTMLElementProps. */
export interface HTMLTextAreaElementProps extends HTMLElementProps {
  autocomplete?: Reactive<AutoFill>
  cols?: Reactive<number>
  defaultValue?: Reactive<string>
  dirName?: Reactive<string>
  disabled?: Reactive<boolean>
  maxLength?: Reactive<number>
  minLength?: Reactive<number>
  name?: Reactive<string>
  placeholder?: Reactive<string>
  readOnly?: Reactive<boolean>
  required?: Reactive<boolean>
  rows?: Reactive<number>
  selectionDirection?: Reactive<"forward" | "backward" | "none">
  selectionEnd?: Reactive<number>
  selectionStart?: Reactive<number>
  value?: Reactive<string>
  wrap?: Reactive<string>
}

/** Props of <time> (HTMLTimeElement) beyond HTMLElementProps. */
export interface HTMLTimeElementProps extends HTMLElementProps {
  dateTime?: Reactive<string>
}

/** Props of <title> (HTMLTitleElement) beyond HTMLElementProps. */
export interface HTMLTitleElementProps extends HTMLElementProps {
  text?: Reactive<string>
}

/** Props of <tr> (HTMLTableRowElement) beyond HTMLElementProps. */
export interface HTMLTableRowElementProps extends HTMLElementProps {
  align?: Reactive<string>
  bgColor?: Reactive<string>
  ch?: Reactive<string>
  chOff?: Reactive<string>
  vAlign?: Reactive<string>
}

/** Props of <track> (HTMLTrackElement) beyond HTMLElementProps. */
export interface HTMLTrackElementProps extends HTMLElementProps {
  default?: Reactive<boolean>
  kind?: Reactive<string>
  label?: Reactive<string>
  src?: Reactive<string>
  srclang?: Reactive<string>
}

/** Props of <ul> (HTMLUListElement) beyond HTMLElementProps. */
export interface HTMLUListElementProps extends HTMLElementProps {
  compact?: Reactive<boolean>
  type?: Reactive<string>
}

/** Props of <video> (HTMLVideoElement) beyond HTMLElementProps. */
export interface HTMLVideoElementProps extends HTMLElementProps {
  autoplay?: Reactive<boolean>
  controls?: Reactive<boolean>
  crossOrigin?: Reactive<string | null>
  currentTime?: Reactive<number>
  defaultMuted?: Reactive<boolean>
  defaultPlaybackRate?: Reactive<number>
  disablePictureInPicture?: Reactive<boolean>
  disableRemotePlayback?: Reactive<boolean>
  height?: Reactive<number>
  loop?: Reactive<boolean>
  muted?: Reactive<boolean>
  playbackRate?: Reactive<number>
  playsInline?: Reactive<boolean>
  poster?: Reactive<string>
  preload?: Reactive<"none" | "metadata" | "auto" | "">
  preservesPitch?: Reactive<boolean>
  src?: Reactive<string>
  srcObject?: Reactive<MediaProvider | null>
  volume?: Reactive<number>
  width?: Reactive<number>
}

/** Tag name → props type, one entry per key of HTMLElementTagNameMap. */
export interface TagPropsMap {
  a: HTMLAnchorElementProps
  abbr: HTMLElementProps
  address: HTMLElementProps
  area: HTMLAreaElementProps
  article: HTMLElementProps
  aside: HTMLElementProps
  audio: HTMLAudioElementProps
  b: HTMLElementProps
  base: HTMLBaseElementProps
  bdi: HTMLElementProps
  bdo: HTMLElementProps
  blockquote: HTMLQuoteElementProps
  body: HTMLBodyElementProps
  br: HTMLBRElementProps
  button: HTMLButtonElementProps
  canvas: HTMLCanvasElementProps
  caption: HTMLTableCaptionElementProps
  cite: HTMLElementProps
  code: HTMLElementProps
  col: HTMLTableColElementProps
  colgroup: HTMLTableColElementProps
  data: HTMLDataElementProps
  datalist: HTMLElementProps
  dd: HTMLElementProps
  del: HTMLModElementProps
  details: HTMLDetailsElementProps
  dfn: HTMLElementProps
  dialog: HTMLDialogElementProps
  div: HTMLDivElementProps
  dl: HTMLDListElementProps
  dt: HTMLElementProps
  em: HTMLElementProps
  embed: HTMLEmbedElementProps
  fieldset: HTMLFieldSetElementProps
  figcaption: HTMLElementProps
  figure: HTMLElementProps
  footer: HTMLElementProps
  form: HTMLFormElementProps
  h1: HTMLHeadingElementProps
  h2: HTMLHeadingElementProps
  h3: HTMLHeadingElementProps
  h4: HTMLHeadingElementProps
  h5: HTMLHeadingElementProps
  h6: HTMLHeadingElementProps
  head: HTMLElementProps
  header: HTMLElementProps
  hgroup: HTMLElementProps
  hr: HTMLHRElementProps
  html: HTMLHtmlElementProps
  i: HTMLElementProps
  iframe: HTMLIFrameElementProps
  img: HTMLImageElementProps
  input: HTMLInputElementProps
  ins: HTMLModElementProps
  kbd: HTMLElementProps
  label: HTMLLabelElementProps
  legend: HTMLLegendElementProps
  li: HTMLLIElementProps
  link: HTMLLinkElementProps
  main: HTMLElementProps
  map: HTMLMapElementProps
  mark: HTMLElementProps
  menu: HTMLMenuElementProps
  meta: HTMLMetaElementProps
  meter: HTMLMeterElementProps
  nav: HTMLElementProps
  noscript: HTMLElementProps
  object: HTMLObjectElementProps
  ol: HTMLOListElementProps
  optgroup: HTMLOptGroupElementProps
  option: HTMLOptionElementProps
  output: HTMLOutputElementProps
  p: HTMLParagraphElementProps
  picture: HTMLElementProps
  pre: HTMLPreElementProps
  progress: HTMLProgressElementProps
  q: HTMLQuoteElementProps
  rp: HTMLElementProps
  rt: HTMLElementProps
  ruby: HTMLElementProps
  s: HTMLElementProps
  samp: HTMLElementProps
  script: HTMLScriptElementProps
  search: HTMLElementProps
  section: HTMLElementProps
  select: HTMLSelectElementProps
  slot: HTMLSlotElementProps
  small: HTMLElementProps
  source: HTMLSourceElementProps
  span: HTMLElementProps
  strong: HTMLElementProps
  style: HTMLStyleElementProps
  sub: HTMLElementProps
  summary: HTMLElementProps
  sup: HTMLElementProps
  table: HTMLTableElementProps
  tbody: HTMLTableSectionElementProps
  td: HTMLTableCellElementProps
  template: HTMLTemplateElementProps
  textarea: HTMLTextAreaElementProps
  tfoot: HTMLTableSectionElementProps
  th: HTMLTableCellElementProps
  thead: HTMLTableSectionElementProps
  time: HTMLTimeElementProps
  title: HTMLTitleElementProps
  tr: HTMLTableRowElementProps
  track: HTMLTrackElementProps
  u: HTMLElementProps
  ul: HTMLUListElementProps
  var: HTMLElementProps
  video: HTMLVideoElementProps
  wbr: HTMLElementProps
}

// ---------------------------------------------------------------------------
// SVG
// ---------------------------------------------------------------------------

/** Props every svg tag accepts: attributes that are not IDL
 *  properties (hand-written), then every writable IDL property of SVGElement. */
export interface SVGElementProps extends SVGElementEventProps, EscapeHatchProps {
  /** the class attribute */ class?: Reactive<string>
  /** ARIA role */ role?: Reactive<string>
  /** cssText string, or an object diffed key by key (D7) */ style?: Reactive<StyleValue>
  /** the attribute form (tabIndex is the IDL twin) */ tabindex?: Reactive<number | string>
  viewBox?: Reactive<string | number>
  d?: Reactive<string | number>
  fill?: Reactive<string | number>
  stroke?: Reactive<string | number>
  strokeWidth?: Reactive<string | number>
  "stroke-width"?: Reactive<string | number>
  cx?: Reactive<string | number>
  cy?: Reactive<string | number>
  r?: Reactive<string | number>
  x?: Reactive<string | number>
  y?: Reactive<string | number>
  width?: Reactive<string | number>
  height?: Reactive<string | number>
  x1?: Reactive<string | number>
  y1?: Reactive<string | number>
  x2?: Reactive<string | number>
  y2?: Reactive<string | number>
  points?: Reactive<string | number>
  transform?: Reactive<string | number>
  opacity?: Reactive<string | number>
  href?: Reactive<string | number>
  "xlink:href"?: Reactive<string | number>
  preserveAspectRatio?: Reactive<string | number>
  pathLength?: Reactive<string | number>
  textAnchor?: Reactive<string | number>
  dominantBaseline?: Reactive<string | number>
  fontSize?: Reactive<string | number>
  fontFamily?: Reactive<string | number>
  ariaActiveDescendantElement?: Reactive<Element | null>
  ariaAtomic?: Reactive<string | null>
  ariaAutoComplete?: Reactive<string | null>
  ariaBrailleLabel?: Reactive<string | null>
  ariaBrailleRoleDescription?: Reactive<string | null>
  ariaBusy?: Reactive<string | null>
  ariaChecked?: Reactive<string | null>
  ariaColCount?: Reactive<string | null>
  ariaColIndex?: Reactive<string | null>
  ariaColIndexText?: Reactive<string | null>
  ariaColSpan?: Reactive<string | null>
  ariaControlsElements?: Reactive<ReadonlyArray<Element> | null>
  ariaCurrent?: Reactive<string | null>
  ariaDescribedByElements?: Reactive<ReadonlyArray<Element> | null>
  ariaDescription?: Reactive<string | null>
  ariaDetailsElements?: Reactive<ReadonlyArray<Element> | null>
  ariaDisabled?: Reactive<string | null>
  ariaErrorMessageElements?: Reactive<ReadonlyArray<Element> | null>
  ariaExpanded?: Reactive<string | null>
  ariaFlowToElements?: Reactive<ReadonlyArray<Element> | null>
  ariaHasPopup?: Reactive<string | null>
  ariaHidden?: Reactive<string | null>
  ariaInvalid?: Reactive<string | null>
  ariaKeyShortcuts?: Reactive<string | null>
  ariaLabel?: Reactive<string | null>
  ariaLabelledByElements?: Reactive<ReadonlyArray<Element> | null>
  ariaLevel?: Reactive<string | null>
  ariaLive?: Reactive<string | null>
  ariaModal?: Reactive<string | null>
  ariaMultiLine?: Reactive<string | null>
  ariaMultiSelectable?: Reactive<string | null>
  ariaOrientation?: Reactive<string | null>
  ariaOwnsElements?: Reactive<ReadonlyArray<Element> | null>
  ariaPlaceholder?: Reactive<string | null>
  ariaPosInSet?: Reactive<string | null>
  ariaPressed?: Reactive<string | null>
  ariaReadOnly?: Reactive<string | null>
  ariaRelevant?: Reactive<string | null>
  ariaRequired?: Reactive<string | null>
  ariaRoleDescription?: Reactive<string | null>
  ariaRowCount?: Reactive<string | null>
  ariaRowIndex?: Reactive<string | null>
  ariaRowIndexText?: Reactive<string | null>
  ariaRowSpan?: Reactive<string | null>
  ariaSelected?: Reactive<string | null>
  ariaSetSize?: Reactive<string | null>
  ariaSort?: Reactive<string | null>
  ariaValueMax?: Reactive<string | null>
  ariaValueMin?: Reactive<string | null>
  ariaValueNow?: Reactive<string | null>
  ariaValueText?: Reactive<string | null>
  autofocus?: Reactive<boolean>
  id?: Reactive<string>
  innerHTML?: Reactive<string>
  nodeValue?: Reactive<string | null>
  nonce?: Reactive<string>
  outerHTML?: Reactive<string>
  part?: Reactive<string>
  scrollLeft?: Reactive<number>
  scrollTop?: Reactive<number>
  slot?: Reactive<string>
  tabIndex?: Reactive<number>
  textContent?: Reactive<string | null>
}

/** Props of <a> (SVGAElement) beyond SVGElementProps. */
export interface SVGAElementProps extends SVGElementProps {
  rel?: Reactive<string>
  relList?: Reactive<string>
}

/** Props of <image> (SVGImageElement) beyond SVGElementProps. */
export interface SVGImageElementProps extends SVGElementProps {
  crossOrigin?: Reactive<string | null>
}

/** Props of <script> (SVGScriptElement) beyond SVGElementProps. */
export interface SVGScriptElementProps extends SVGElementProps {
  type?: Reactive<string>
}

/** Props of <style> (SVGStyleElement) beyond SVGElementProps. */
export interface SVGStyleElementProps extends SVGElementProps {
  disabled?: Reactive<boolean>
  media?: Reactive<string>
  title?: Reactive<string>
  type?: Reactive<string>
}

/** Props of <svg> (SVGSVGElement) beyond SVGElementProps. */
export interface SVGSVGElementProps extends SVGElementProps {
  currentScale?: Reactive<number>
}

/** Tag name → props type, one entry per key of SVGElementTagNameMap. */
export interface SvgTagPropsMap {
  a: SVGAElementProps
  animate: SVGElementProps
  animateMotion: SVGElementProps
  animateTransform: SVGElementProps
  circle: SVGElementProps
  clipPath: SVGElementProps
  defs: SVGElementProps
  desc: SVGElementProps
  ellipse: SVGElementProps
  feBlend: SVGElementProps
  feColorMatrix: SVGElementProps
  feComponentTransfer: SVGElementProps
  feComposite: SVGElementProps
  feConvolveMatrix: SVGElementProps
  feDiffuseLighting: SVGElementProps
  feDisplacementMap: SVGElementProps
  feDistantLight: SVGElementProps
  feDropShadow: SVGElementProps
  feFlood: SVGElementProps
  feFuncA: SVGElementProps
  feFuncB: SVGElementProps
  feFuncG: SVGElementProps
  feFuncR: SVGElementProps
  feGaussianBlur: SVGElementProps
  feImage: SVGElementProps
  feMerge: SVGElementProps
  feMergeNode: SVGElementProps
  feMorphology: SVGElementProps
  feOffset: SVGElementProps
  fePointLight: SVGElementProps
  feSpecularLighting: SVGElementProps
  feSpotLight: SVGElementProps
  feTile: SVGElementProps
  feTurbulence: SVGElementProps
  filter: SVGElementProps
  foreignObject: SVGElementProps
  g: SVGElementProps
  image: SVGImageElementProps
  line: SVGElementProps
  linearGradient: SVGElementProps
  marker: SVGElementProps
  mask: SVGElementProps
  metadata: SVGElementProps
  mpath: SVGElementProps
  path: SVGElementProps
  pattern: SVGElementProps
  polygon: SVGElementProps
  polyline: SVGElementProps
  radialGradient: SVGElementProps
  rect: SVGElementProps
  script: SVGScriptElementProps
  set: SVGElementProps
  stop: SVGElementProps
  style: SVGStyleElementProps
  svg: SVGSVGElementProps
  switch: SVGElementProps
  symbol: SVGElementProps
  text: SVGElementProps
  textPath: SVGElementProps
  title: SVGElementProps
  tspan: SVGElementProps
  use: SVGElementProps
  view: SVGElementProps
}

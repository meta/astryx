// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file transientCopy.ts
 * @input The DOM
 * @output Exports `isCopyable`, `inertCopy`, `visiblePartCopy`, `placeOver`,
 *   `paintedBackground` and `wrapText`: how Core makes, lays out and fades one
 *   transient copy of old content
 * @position Motion foundation, internal to core; the copy mechanism the
 *   in-place swap uses (`spec:AST-105` FR8,
 *   `architecture:component-style-authoring` INV7). Only
 *   motion/animatedLayout.ts imports it.
 *
 * A copy takes no part in the page: it is inert and hidden from assistive
 * technology, carries no ids or test ids, joins no form or radio group (a
 * copied checked radio would uncheck the live one), and its frames and media
 * load nothing. Laying it out changes no ancestor's position, and a scaled
 * host draws it at the old size. Laid in a host outside the element's own
 * ancestors, it keeps what it inherited from them: its inherited properties
 * and custom properties that differ from the host's are written on it.
 * Limits: a rule keyed on a removed `id`, or matched through an ancestor
 * between the host and the element (`.collapsed .label`), does not style the
 * copy as it styled the element; and content holding a canvas whose pixels read back
 * empty is not copied, so the new content enters without an old copy: a
 * canvas that cannot be read back (a WebGL canvas without
 * `preserveDrawingBuffer`, a tainted one) or a blank one.
 *
 * SYNC: When modified, update /packages/core/src/motion/animatedLayout.ts
 */

/** Above this many elements, old content is not copied: the new one enters. */
const MAX_COPIED_ELEMENTS = 1500;

/** Whether `element` is small enough to copy. */
export function isCopyable(element: Element): boolean {
  return element.getElementsByTagName('*').length <= MAX_COPIED_ELEMENTS;
}

/**
 * Paints `canvas` with `source`'s pixels at its own size; false when they
 * read back empty: unreadable (a WebGL canvas without
 * `preserveDrawingBuffer`, a tainted one) or blank.
 */
function paintCanvas(
  canvas: HTMLCanvasElement,
  source: HTMLCanvasElement,
): boolean {
  if (canvas.width === 0 || canvas.height === 0) {
    return true;
  }
  const context = canvas.getContext('2d', {willReadFrequently: true});
  if (context == null) {
    // No 2D canvas here (a test environment): nothing to paint or tell.
    return true;
  }
  try {
    context.drawImage(source, 0, 0);
    const {data} = context.getImageData(0, 0, canvas.width, canvas.height);
    for (let index = 3; index < data.length; index += 4) {
      if (data[index] !== 0) {
        return true;
      }
    }
    return false;
  } catch {
    return false;
  }
}

/** Inherited properties a copy carries when laid outside its ancestors. */
const INHERITED_PROPERTIES = [
  'color',
  'cursor',
  'direction',
  'font-family',
  'font-feature-settings',
  'font-size',
  'font-stretch',
  'font-style',
  'font-variant',
  'font-variation-settings',
  'font-weight',
  'hyphens',
  'letter-spacing',
  'line-height',
  'list-style-type',
  'overflow-wrap',
  'tab-size',
  'text-align',
  'text-indent',
  'text-shadow',
  'text-transform',
  'visibility',
  'white-space',
  'word-break',
  'word-spacing',
  'writing-mode',
];

/** Each copy's inherited values, read from its element when it was made. */
const inheritedValues = new WeakMap<Element, Map<string, string>>();

/** A computed line-height over its font size, or null for `normal`. */
function lineHeightFactor(style: CSSStyleDeclaration): number | null {
  const lineHeight = parseFloat(style.getPropertyValue('line-height'));
  const fontSize = parseFloat(style.getPropertyValue('font-size'));
  return Number.isFinite(lineHeight) && fontSize > 0
    ? Math.round((lineHeight / fontSize) * 1000) / 1000
    : null;
}

/** The element's inherited properties and custom properties, as computed. */
function readInherited(element: Element): Map<string, string> {
  const values = new Map<string, string>();
  const style = getComputedStyle(element);
  for (const name of INHERITED_PROPERTIES) {
    values.set(name, style.getPropertyValue(name));
  }
  // A unitless line-height inherits as its factor, but the computed style
  // reports it in pixels. The typed style map tells a factor from a length
  // (a length stays its pixels); without one, the pixels over the font size
  // stand for the factor.
  if (typeof element.computedStyleMap === 'function') {
    const lineHeight = element.computedStyleMap().get('line-height');
    if (
      lineHeight != null &&
      'unit' in lineHeight &&
      lineHeight.unit === 'number' &&
      'value' in lineHeight
    ) {
      values.set('line-height', String(lineHeight.value));
    }
  } else {
    const factor = lineHeightFactor(style);
    if (factor != null) {
      values.set('line-height', String(factor));
    }
  }
  for (let index = 0; index < style.length; index++) {
    const name = style[index];
    if (name.startsWith('--')) {
      values.set(name, style.getPropertyValue(name));
    }
  }
  return values;
}

/** Scroll offsets a copy restores once laid out (a clone carries none). */
const scrollOffsets = new WeakMap<
  HTMLElement,
  ReadonlyArray<readonly [Element, number, number]>
>();

/**
 * A copy that takes no part: no ids or test ids, no form or radio group (a
 * copied checked radio would uncheck the live one), no label for a live
 * control, and copied frames and media load nothing. Scrolled descendants
 * keep their offsets once the copy is laid out (`placeOver`).
 */
export function inertCopy(element: HTMLElement): HTMLElement | null {
  const copy = element.cloneNode(true) as HTMLElement;
  const sourceNodes = [element, ...element.querySelectorAll('*')];
  const copyNodes = [copy, ...copy.querySelectorAll('*')];
  const offsets: [Element, number, number][] = [];
  sourceNodes.forEach((source, index) => {
    if (source.scrollTop !== 0 || source.scrollLeft !== 0) {
      offsets.push([copyNodes[index], source.scrollTop, source.scrollLeft]);
    }
  });
  scrollOffsets.set(copy, offsets);
  inheritedValues.set(copy, readInherited(element));
  for (const node of copyNodes) {
    for (const name of [
      'id',
      'data-testid',
      'name',
      'form',
      'for',
      'autofocus',
    ]) {
      node.removeAttribute(name);
    }
  }
  for (const node of copy.querySelectorAll(
    'iframe, video, audio, source, embed, object',
  )) {
    for (const name of ['src', 'srcdoc', 'data', 'autoplay']) {
      node.removeAttribute(name);
    }
  }
  // A clone's canvas is blank: paint each with its source's pixels. Content
  // with a canvas that reads back empty is not copied.
  const sources = element.querySelectorAll('canvas');
  const canvases = Array.from(copy.querySelectorAll('canvas'));
  if (!canvases.every((canvas, index) => paintCanvas(canvas, sources[index]))) {
    return null;
  }
  copy.setAttribute('aria-hidden', 'true');
  copy.setAttribute('inert', '');
  copy.style.pointerEvents = 'none';
  return copy;
}

/** The background `element` shows: its own, or the nearest ancestor's. */
export function paintedBackground(element: Element): string {
  for (let node: Element | null = element; node; node = node.parentElement) {
    const color = getComputedStyle(node).backgroundColor;
    if (color !== 'transparent' && !/^rgba\(.*,\s*0\)$/.test(color)) {
      return color;
    }
  }
  return 'Canvas';
}

/**
 * Lay `element` over `rect` (viewport coordinates), absolutely, as the last
 * child of `host`, wherever its containing block is: no ancestor's position
 * changes.
 */
export function placeOver(
  element: HTMLElement,
  host: Element,
  rect: DOMRect,
): void {
  Object.assign(element.style, {
    position: 'absolute',
    boxSizing: 'border-box',
    margin: '0px',
    left: '0px',
    top: '0px',
    width: `${rect.width}px`,
    height: `${rect.height}px`,
  });
  host.appendChild(element);
  // What it inherited where it was, where the host passes something else.
  const hostStyle = getComputedStyle(host);
  for (const [name, value] of inheritedValues.get(element) ?? []) {
    // A line-height is always written: the host may pass the same number as
    // the other kind (a factor against a length), which descendants inherit
    // differently.
    if (
      value !== '' &&
      (name === 'line-height' || hostStyle.getPropertyValue(name) !== value)
    ) {
      element.style.setProperty(name, value);
    }
  }
  // The origin, and the host's scale: the rect is in viewport pixels, the
  // copy's styles in the host's own.
  // The rendered size over the layout size, as the glide's `scaleOf` reads
  // it, so a size the copy's own CSS imposes is not taken for a scale.
  // The layout size rounds to whole pixels: within a pixel of the requested
  // size, the requested size is the layout size.
  const origin = element.getBoundingClientRect();
  const layoutWidth =
    Math.abs(element.offsetWidth - rect.width) < 1
      ? rect.width
      : element.offsetWidth;
  const layoutHeight =
    Math.abs(element.offsetHeight - rect.height) < 1
      ? rect.height
      : element.offsetHeight;
  const scaleX =
    origin.width > 0 && layoutWidth > 0 ? origin.width / layoutWidth : 1;
  const scaleY =
    origin.height > 0 && layoutHeight > 0 ? origin.height / layoutHeight : 1;
  element.style.width = `${rect.width / scaleX}px`;
  element.style.height = `${rect.height / scaleY}px`;
  element.style.left = `${(rect.left - origin.left) / scaleX}px`;
  element.style.top = `${(rect.top - origin.top) / scaleY}px`;
  for (const [node, top, left] of scrollOffsets.get(element) ?? []) {
    // At once, whatever the element's own `scroll-behavior`.
    if (typeof node.scrollTo === 'function') {
      node.scrollTo({top, left, behavior: 'instant'});
    } else {
      node.scrollTop = top;
      node.scrollLeft = left;
    }
  }
}

/**
 * `element`'s visible part as a copy: its content scrolled as it was, in a
 * holder the size of the visible part (a scroll container), and where that
 * part showed, in viewport coordinates.
 */
export function visiblePartCopy(element: HTMLElement): {
  copy: HTMLElement;
  rect: DOMRect;
} | null {
  const content = inertCopy(element);
  if (content == null) {
    return null;
  }
  content.removeAttribute('role');
  content.removeAttribute('tabindex');
  Object.assign(content.style, {
    position: 'absolute',
    top: `${-element.scrollTop}px`,
    left: `${-element.scrollLeft}px`,
    boxSizing: 'border-box',
    width: `${element.clientWidth}px`,
    height: 'auto',
    padding: getComputedStyle(element).padding,
    // The holder is the visible part, inside the border.
    borderWidth: '0px',
    margin: '0px',
    overflow: 'visible',
    translate: 'none',
  });
  const holder = element.ownerDocument.createElement('div');
  holder.setAttribute('aria-hidden', 'true');
  holder.setAttribute('inert', '');
  Object.assign(holder.style, {overflow: 'hidden', pointerEvents: 'none'});
  holder.appendChild(content);
  // The content's own offset is its position; its scrolled descendants
  // restore theirs when the holder is laid out.
  scrollOffsets.set(
    holder,
    (scrollOffsets.get(content) ?? []).filter(([node]) => node !== content),
  );
  const values = inheritedValues.get(content);
  if (values != null) {
    inheritedValues.set(holder, values);
  }
  const box = element.getBoundingClientRect();
  return {
    copy: holder,
    rect: DOMRect.fromRect({
      x: box.left + element.clientLeft,
      y: box.top + element.clientTop,
      width: element.clientWidth,
      height: element.clientHeight,
    }),
  };
}

const SVG = 'http://www.w3.org/2000/svg';

/**
 * The elements that let a copy's text fade: each run of HTML text wrapped in
 * its own span, and each SVG `text` element as it is (a span does not render
 * inside SVG).
 */
export function wrapText(copy: HTMLElement): Element[] {
  const walker = copy.ownerDocument.createTreeWalker(copy, 4);
  const texts: Text[] = [];
  while (walker.nextNode()) {
    if (walker.currentNode.textContent?.trim()) {
      texts.push(walker.currentNode as Text);
    }
  }
  const faded = new Set<Element>();
  for (const text of texts) {
    const parent = text.parentElement;
    // Text that is not rendered as text (a style sheet, a script, a
    // textarea's default value, a title) stays where it is.
    if (parent?.closest('style, script, textarea, title, noscript') != null) {
      continue;
    }
    if (parent?.namespaceURI === SVG) {
      const svgText = parent.closest('text');
      if (svgText != null) {
        faded.add(svgText);
      }
      continue;
    }
    const span = copy.ownerDocument.createElement('span');
    text.replaceWith(span);
    span.appendChild(text);
    faded.add(span);
  }
  return [...faded];
}

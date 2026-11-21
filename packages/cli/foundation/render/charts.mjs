// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Charts in a rendered page. A recharts chart draws only after its
 * effects run, and a ResponsiveContainer measures its parent in a browser, so
 * a server render leaves them empty. The render worker draws each one again
 * in a small document and puts the drawing in its place: a container chart
 * at each of a set of widths, of which CSS shows the one nearest the box.
 *
 * @input The chart elements the server render set aside.
 * @output Their sizes, the CSS that shows a drawn chart at its box's size,
 *   the heights the page gives the boxes charts fill, and the SVG drawings
 *   whose text gets too small on a phone.
 * @position foundation/render — read by page-worker.mjs and render-page.mjs.
 */

import {scanHtml} from './html-reader.mjs';

/** The global the render worker installs to set charts aside. SYNC: page-worker.mjs assigns it by this name. */
export const CHART_GLOBAL = '__astryxRenderChart';

/** The recharts exports that draw a chart, besides ResponsiveContainer. */
export const CHART_ROOTS = new Set([
  'AreaChart',
  'BarChart',
  'ComposedChart',
  'FunnelChart',
  'LineChart',
  'PieChart',
  'RadarChart',
  'RadialBarChart',
  'Sankey',
  'ScatterChart',
  'SunburstChart',
  'Treemap',
]);

/**
 * The narrowest and widest boxes a chart sized by its container is drawn
 * for: a sparkline in a narrow table cell, and a chart across a wide
 * desktop screen.
 */
const NARROWEST_CHART = 60;
const WIDEST_CHART = 1920;

/**
 * The ratio between one drawing's width and the next. A reader sees the
 * drawing nearest the box's width, so the drawing scales by at most the
 * square root of this step either way: 2 ** (1/4), about 1.19, keeps text
 * within a fifth of its own size, and each doubling of width costs two
 * drawings.
 */
const CHART_WIDTH_STEP = Math.SQRT2;

/** The widths a chart sized by its container is drawn at, narrowest first. */
export const CHART_WIDTHS = Array.from(
  {length: Math.round(Math.log(WIDEST_CHART / NARROWEST_CHART) / Math.log(CHART_WIDTH_STEP)) + 1},
  (_, k) => Math.round(NARROWEST_CHART * CHART_WIDTH_STEP ** k),
);

/** Height of a chart whose height its page does not give. */
const CHART_HEIGHT = 300;

/**
 * @param {unknown} value
 * @returns {number | null} the value as a positive number of pixels, or null
 */
const pixels = value => (typeof value === 'number' && value > 0 ? value : null);

/**
 * @param {unknown} value
 * @returns {number | null} the value as a fraction of its box, from a
 *   percentage such as `"100%"`, or null
 */
function fraction(value) {
  const match = typeof value === 'string' ? /^\s*([\d.]+)%\s*$/.exec(value) : null;
  const n = match ? Number(match[1]) / 100 : NaN;
  return n > 0 ? n : null;
}

/**
 * How a ResponsiveContainer is drawn without a browser to measure its box,
 * so a reader at any width sees a drawing near the box's own size.
 *
 * A container with its own width is drawn once, at that width. A container
 * whose width follows its box is drawn at each of {@link CHART_WIDTHS}, and
 * {@link CHART_CSS} shows the drawing nearest the box's width. Each drawing
 * keeps the height the page gives: a number, the width over the aspect, or
 * the share of its box's height when the box states that height
 * (`boxHeight`). Otherwise it is drawn {@link CHART_HEIGHT} high, and fits
 * the box the reader's browser gives it. The box's style is the one the
 * container gives itself in a browser.
 * @param {{width?: unknown, height?: unknown, aspect?: unknown, minWidth?: unknown, minHeight?: unknown, maxHeight?: unknown}} props
 * @param {number | null} [boxHeight] the height in pixels that the box the container fills states, when it states one
 * @returns {{sizes: {width: number, height: number}[], style: Record<string, number | string>, follows: boolean}}
 *   `follows` when the drawings follow the box's width
 */
export function chartDrawings(props, boxHeight = null) {
  const {width = '100%', height = '100%', aspect, minWidth, minHeight, maxHeight} = props;
  const ratio = pixels(aspect);
  const ownWidth = pixels(width);
  const ownHeight = pixels(height);
  const share = fraction(height);
  const low = pixels(minHeight) ?? 0;
  const high = pixels(maxHeight) ?? Infinity;
  /** @param {number} w */
  const heightAt = w =>
    Math.round(
      Math.min(high, Math.max(low, ratio ? w / ratio : (ownHeight ?? (share && boxHeight ? share * boxHeight : CHART_HEIGHT)))),
    );
  const widths = ownWidth ? [ownWidth] : CHART_WIDTHS;
  /** @type {Record<string, number | string>} */
  const style = {width: ownWidth ?? (typeof width === 'string' ? width : '100%')};
  if (ratio) Object.assign(style, {height: 'auto', aspectRatio: ratio});
  else style.height = ownHeight ?? (typeof height === 'string' ? height : '100%');
  if (pixels(minWidth)) style.minWidth = /** @type {number} */ (pixels(minWidth));
  if (low) style.minHeight = low;
  if (high !== Infinity) style.maxHeight = high;
  return {sizes: widths.map(w => ({width: w, height: heightAt(w)})), style, follows: !ownWidth};
}

/**
 * The width up to which each drawing in {@link CHART_WIDTHS} is the nearest:
 * the geometric mean of its width and the next one's, so a drawing scales
 * as far down as the next one scales up.
 */
const nearestUpTo = CHART_WIDTHS.map((w, k) =>
  k + 1 < CHART_WIDTHS.length ? Math.round(Math.sqrt(w * CHART_WIDTHS[k + 1])) : Infinity,
);

/** The attribute that marks a container drawn at each of {@link CHART_WIDTHS}. */
export const FOLLOWS_WIDTH = 'data-astryx-chart-widths';

const CONTAINER = '.recharts-responsive-container';
const DRAWING = `${CONTAINER}>.recharts-wrapper`;

/**
 * A container chart fills the box the page gives it and its drawing fits
 * that box whole, so it never overflows or clips. A drawing as high as its
 * box scales down when the box is narrower and never grows past its own
 * size; a drawing that keeps an aspect scales with its box both ways. Its
 * legend is part of the drawing (see {@link foldLegends}), so it scales with
 * it. A container drawn at several widths shows only the drawing nearest its
 * width, so that scale stays within the fourth root of two.
 */
export const CHART_CSS =
  `${CONTAINER}{max-width:100%}` +
  `${DRAWING}{width:100%!important;height:100%!important}` +
  `${DRAWING}>svg.recharts-surface{width:100%;height:100%;display:block}` +
  `${CONTAINER}[${FOLLOWS_WIDTH}]{container-type:inline-size}` +
  `${CONTAINER}[${FOLLOWS_WIDTH}]>.recharts-wrapper{display:none}` +
  nearestUpTo
    .map((upTo, k) => {
      const from = k > 0 ? `${nearestUpTo[k - 1]}px < ` : '';
      const to = upTo === Infinity ? '' : `width <= ${upTo}px`;
      const query = from && to ? `(${from}${to})` : from ? `(width > ${nearestUpTo[k - 1]}px)` : `(${to})`;
      return `@container ${query}{${CONTAINER}[${FOLLOWS_WIDTH}]>.recharts-wrapper:nth-child(${k + 1}){display:block}}`;
    })
    .join('');

/** The properties that place and size a legend in the layer above a picture. */
const LEGEND_PLACEMENT = new Set(['position', 'left', 'right', 'top', 'bottom', 'width', 'height']);

/**
 * A legend's own style without the properties that place and size it, so it
 * keeps the rest (`wrapperStyle`'s font, say) inside the picture.
 * @param {string} style
 * @returns {string[]} its other declarations
 */
const placement = style =>
  style
    .split(';')
    .map(d => d.trim())
    .filter(d => d && !LEGEND_PLACEMENT.has(d.slice(0, d.indexOf(':')).trim().toLowerCase()));

/**
 * Put each container chart's legend inside its picture, where recharts
 * placed it, so the legend scales with the drawing when the drawing fits a
 * box of another size. recharts places a legend in a layer above the
 * picture, by its edges, and keeps room for it in the picture. The legend's
 * box is the one recharts kept room for (see {@link legendBox}).
 * @param {any} root the element the charts were drawn in
 */
export function foldLegends(root) {
  for (const wrapper of root.querySelectorAll(`${DRAWING}`)) {
    const legend = wrapper.querySelector(':scope > .recharts-legend-wrapper');
    const svg = wrapper.querySelector(':scope > svg.recharts-surface');
    if (!legend || !svg) continue;
    const [, , width, height] = String(svg.getAttribute('viewBox') ?? '')
      .split(/[\s,]+/)
      .map(Number);
    if (!(width > 0 && height > 0)) continue;
    const style = legend.getAttribute('style') ?? '';
    /** @param {string} edge */
    const at = edge => {
      const n = Number(new RegExp(`(?:^|;)\\s*${edge}\\s*:\\s*(-?[\\d.]+)px`).exec(style)?.[1]);
      return Number.isFinite(n) ? n : null;
    };
    const estimate = legendBox(legend);
    const w = at('width') ?? estimate.width;
    const h = estimate.height;
    const left = at('left');
    const right = at('right');
    const top = at('top');
    const bottom = at('bottom');
    const x = left ?? (right !== null ? width - right - w : 0);
    const y = top ?? (bottom !== null ? height - bottom - h : 0);
    const object = root.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'foreignObject');
    for (const [name, value] of Object.entries({x, y, width: w, height: h, overflow: 'visible'})) {
      object.setAttribute(name, String(value));
    }
    legend.setAttribute('style', [...placement(style), 'width:100%'].join(';'));
    object.appendChild(legend);
    svg.appendChild(object);
  }
}

/** Attributes that name other elements by their ids, separated by spaces. */
const ID_LISTS = ['for', 'aria-labelledby', 'aria-describedby', 'aria-controls', 'aria-owns', 'aria-activedescendant'];

/**
 * Give each drawing of a chart drawn at several widths its own ids. Every
 * drawing renders the page's chart children again, so an id the page writes
 * inside the chart (a `<linearGradient id>` its areas fill with, say) would
 * appear once per drawing, and `url(#…)` would find the copy in the first
 * drawing, which the reader may not see. Two charts can write the same id
 * too (one chart component used twice). Each id takes the chart's place and
 * the drawing's width as a suffix, and each reference inside that drawing
 * (`url(#…)`, `href`, and the attributes that list ids) follows it. Ids from
 * outside the chart are left as they are.
 * @param {any} root the element the charts were drawn in
 * @param {number} [first] the place of the first chart in `root` among the page's charts
 */
export function separateIds(root, first = 0) {
  const containers = [...root.querySelectorAll(`${CONTAINER}[${FOLLOWS_WIDTH}]`)];
  for (const wrapper of root.querySelectorAll(`${CONTAINER}[${FOLLOWS_WIDTH}] > .recharts-wrapper`)) {
    const place = first + containers.indexOf(wrapper.parentElement);
    const width = String(wrapper.querySelector(':scope > svg.recharts-surface')?.getAttribute('viewBox') ?? '').split(/[\s,]+/)[2];
    const elements = [wrapper, ...wrapper.querySelectorAll('*')];
    /** @type {Map<string, string>} */
    const own = new Map();
    for (const el of elements) {
      const id = el.getAttribute('id');
      if (!id) continue;
      own.set(id, `${id}-chart${place}-at-${width}`);
      el.setAttribute('id', /** @type {string} */ (own.get(id)));
    }
    if (own.size === 0) continue;
    /** @param {string} id */
    const renamed = id => own.get(id) ?? id;
    for (const el of elements) {
      for (const {name, value} of [...el.attributes]) {
        let next = value.replace(/url\(\s*(['"]?)#([^'")\s]+)\1\s*\)/g, (/** @type {string} */ _, /** @type {string} */ q, /** @type {string} */ id) => `url(${q}#${renamed(id)}${q})`);
        if ((name === 'href' || name === 'xlink:href') && next.startsWith('#')) next = `#${renamed(next.slice(1))}`;
        if (ID_LISTS.includes(name)) next = next.split(/\s+/).map(renamed).join(' ');
        if (next !== value) el.setAttribute(name, next);
      }
    }
  }
}

/** The SVG attributes that place and shape what a chart draws. */
const GEOMETRY = ['d', 'points', 'x', 'y', 'x1', 'y1', 'x2', 'y2', 'cx', 'cy', 'r', 'rx', 'ry', 'width', 'height', 'transform'];

/**
 * Decimal places a drawing's coordinates keep: a hundredth of a pixel, finer
 * than any screen shows, where recharts writes up to sixteen digits.
 */
const COORDINATE_PLACES = 2;

/**
 * Round the coordinates of each chart in `root` drawn at several widths, so
 * its drawings take less room in the file. Text, and a chart drawn once, are
 * left as recharts draws them.
 * @param {any} root the element the charts were drawn in
 */
export function roundCoordinates(root) {
  const long = new RegExp(`-?\\d+\\.\\d{${COORDINATE_PLACES + 1},}`, 'g');
  /** @param {string} n */
  const round = n => String(Number(Number(n).toFixed(COORDINATE_PLACES)));
  const surface = `${CONTAINER}[${FOLLOWS_WIDTH}] svg.recharts-surface`;
  for (const el of root.querySelectorAll(`${surface}, ${surface} *`)) {
    for (const name of GEOMETRY) {
      const value = el.getAttribute(name);
      if (value === null) continue;
      const rounded = value.replace(long, round);
      if (rounded !== value) el.setAttribute(name, rounded);
    }
  }
}

/**
 * The height each chart's box states, by the chart's place in the server
 * markup: the pixel height in the style of the element that holds it. A
 * ResponsiveContainer with a percentage height takes that share of it in a
 * browser.
 * @param {string} markup the server markup, with a placeholder per chart
 * @returns {Promise<(number | null)[]>}
 */
export async function boxHeights(markup) {
  const {parseHTML} = await import('linkedom');
  const {document} = parseHTML(`<!doctype html><html><body>${markup}</body></html>`);
  /** @type {(number | null)[]} */
  const heights = [];
  for (const el of document.querySelectorAll('astryx-chart[data-chart]')) {
    const style = el.parentElement?.getAttribute('style') ?? '';
    const height = Number(/(?:^|;)\s*height\s*:\s*([\d.]+)px/.exec(style)?.[1]);
    heights[Number(el.getAttribute('data-chart'))] = height > 0 ? height : null;
  }
  return heights;
}

/**
 * The box a legend would measure in a browser, estimated from its items, so
 * a chart keeps room for it where its props place it: rows for a horizontal
 * legend, one line per item for a vertical one.
 * @param {any} el the legend wrapper
 */
function legendBox(el) {
  const items = [...el.querySelectorAll('.recharts-legend-item')];
  const widths = items.map(item => 14 + 4 + 7 * (item.textContent ?? '').length + 10);
  const vertical = items.some(item => /display:\s*block/.test(item.getAttribute('style') ?? ''));
  if (vertical) return box(Math.max(0, ...widths), 20 * items.length + 10);
  // A row as wide as the legend's own width holds the items it can; the rest
  // wrap onto more rows.
  const total = widths.reduce((a, b) => a + b, 0);
  const room = Number(/(?:^|;)\s*width\s*:\s*([\d.]+)px/.exec(el.getAttribute('style') ?? '')?.[1]);
  const rows = room > 0 ? Math.max(1, Math.ceil(total / room)) : 1;
  return box(Math.min(total, room > 0 ? room : total), 24 * rows);
}

/** @param {number} width @param {number} height */
const box = (width, height) => ({x: 0, y: 0, top: 0, left: 0, right: width, bottom: height, width, height});

/** Font size of text that names none, as an axis tick's. */
const TEXT_SIZE = 14;

/**
 * The box recharts' measurement span would measure: its text at its font
 * size, about 0.6 em per character and 1.2 em high.
 * @param {any} el
 */
function textBox(el) {
  const fromStyle = el.style?.fontSize ?? /(?:^|;)\s*font-size\s*:\s*([^;]+)/.exec(el.getAttribute?.('style') ?? '')?.[1];
  const size = Number.parseFloat(String(fromStyle ?? '')) || TEXT_SIZE;
  return box(Math.round(String(el.textContent ?? '').length * size * 0.6), Math.round(size * 1.2));
}

/**
 * Make this document's inline styles keep a custom property's name as it
 * is written: CSS custom properties are case-sensitive, and React sets a
 * StyleX dynamic style (`--x-aspectRatio`) with `style.setProperty`, which
 * linkedom's style object hyphenates (`--x-aspect-ratio`) like a standard
 * property, so no rule would read it. The style text itself keeps the name.
 * @param {any} document
 */
function keepCustomPropertyNames(document) {
  const proto = Object.getPrototypeOf(document.createElement('div').style);
  if (!proto || proto.__keepsCustomNames) return;
  const {setProperty, getPropertyValue, removeProperty} = proto;
  /** The declarations of a style text but one name. @param {string} text @param {string} name */
  const without = (text, name) =>
    text
      .split(';')
      .filter(
        rule => rule.trim() && rule.slice(0, rule.indexOf(':')).trim() !== name,
      );
  Object.defineProperties(proto, {
    __keepsCustomNames: {value: true},
    setProperty: {
      value(/** @type {string} */ name, /** @type {unknown} */ value) {
        if (!String(name).startsWith('--'))
          return setProperty.call(this, name, value);
        const rules = without(this.cssText, name);
        if (value != null && value !== '') rules.push(`${name}:${value}`);
        this.cssText = rules.join(';');
      },
    },
    removeProperty: {
      value(/** @type {string} */ name) {
        if (!String(name).startsWith('--'))
          return removeProperty.call(this, name);
        const was = this.getPropertyValue(name);
        this.cssText = without(this.cssText, name).join(';');
        return was;
      },
    },
    getPropertyValue: {
      value(/** @type {string} */ name) {
        if (!String(name).startsWith('--'))
          return getPropertyValue.call(this, name);
        const rule = String(this.cssText)
          .split(';')
          .find(r => r.slice(0, r.indexOf(':')).trim() === name);
        return rule ? rule.slice(rule.indexOf(':') + 1).trim() : '';
      },
    },
  });
}

/**
 * Give this thread the small document a chart draws in: no layout, no
 * motion, and no frames to wait for.
 * @returns {Promise<void>}
 */
export async function chartDocument() {
  const {parseHTML} = await import('linkedom');
  const {window} = parseHTML('<!doctype html><html><head></head><body></body></html>');
  keepCustomPropertyNames(window.document);
  const g = /** @type {any} */ (globalThis);
  const quiet = () => ({
    matches: true,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
  });
  Object.assign(window, {
    matchMedia: quiet,
    // Every style property reads as empty, as for an element with no CSS.
    getComputedStyle: () => new Proxy({getPropertyValue: () => ''}, {get: (o, k) => (k in o ? /** @type {any} */ (o)[k] : '')}),
    requestAnimationFrame: (/** @type {(t: number) => void} */ cb) => setTimeout(() => cb(Date.now()), 0),
    cancelAnimationFrame: (/** @type {any} */ id) => clearTimeout(id),
    ResizeObserver: class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  });
  g.window = window;
  g.document = window.document;
  g.matchMedia = window.matchMedia;
  g.getComputedStyle = window.getComputedStyle;
  g.requestAnimationFrame = window.requestAnimationFrame;
  g.cancelAnimationFrame = window.cancelAnimationFrame;
  g.ResizeObserver = window.ResizeObserver;
  // Nothing is laid out, so every box measures zero, except a legend's and
  // the span recharts measures text with, which are estimated: the chart
  // keeps room for its legend, and lays out its axis labels as in a browser.
  Object.defineProperty(window.Element.prototype, 'getBoundingClientRect', {
    configurable: true,
    writable: true,
    value() {
      if (this.getAttribute?.('id') === 'recharts_measurement_span') return textBox(this);
      return String(this.getAttribute?.('class') ?? '').includes('recharts-legend-wrapper') ? legendBox(this) : box(0, 0);
    },
  });
}

/** A 375 px phone screen less a 16 px margin on each side: the width a page's drawing fills there. */
const PHONE_DRAWING_WIDTH = 343;
/** Text smaller than this on a phone is hard to read. */
const SMALLEST_READABLE_TEXT = 10;
/** The text size an SVG uses when the drawing states none. */
const DEFAULT_TEXT_SIZE = 16;

/**
 * @param {string | undefined} style an element's `style` attribute
 * @param {string} property a CSS property name
 * @returns {string | undefined} the property's value in the style, trimmed
 */
const styleValue = (style, property) =>
  new RegExp(`(?:^|;)\\s*${property}\\s*:\\s*([^;]+)`, 'i').exec(style ?? '')?.[1].trim();

/**
 * The width an SVG drawing fills on a phone when it scales to its box, or
 * null when it keeps a fixed width. A width in `style` wins over the `width`
 * attribute. A drawing with no width, or `auto`, fills its box unless a pixel
 * height fixes its size; a percentage width fills that share of it; a
 * percentage `max-width` shrinks a wider drawing to its box. Any other width
 * is fixed. Recharts surfaces are skipped: the render draws those charts at
 * the widths a reader sees, so their text keeps its size.
 * @param {Record<string, string>} attrs the `svg` element's attributes
 * @returns {number | null}
 */
function phoneDrawingWidth(attrs) {
  if (/(?:^|\s)recharts-surface(?:\s|$)/.test(attrs.class ?? '')) return null;
  const width = styleValue(attrs.style, 'width') ?? attrs.width?.trim();
  const ownWidth = width == null ? null : pixelLength(width);
  const maxWidth = fraction(styleValue(attrs.style, 'max-width'));
  if (maxWidth) return Math.min(ownWidth ?? Infinity, PHONE_DRAWING_WIDTH * Math.min(1, maxWidth));
  if (width == null || width === '' || width === 'auto') {
    const height = styleValue(attrs.style, 'height') ?? attrs.height?.trim();
    return height != null && pixelLength(height) != null ? null : PHONE_DRAWING_WIDTH;
  }
  const share = fraction(width);
  return share ? PHONE_DRAWING_WIDTH * Math.min(1, share) : null;
}

/**
 * @param {string} value a CSS or SVG length
 * @returns {number | null} the length in pixels when it is a plain number or
 *   a `px` value, else null
 */
function pixelLength(value) {
  const match = /^\s*([\d.]+)(?:px)?\s*$/.exec(value);
  const n = match ? Number(match[1]) : NaN;
  return n > 0 ? n : null;
}

/**
 * SVG drawings whose text gets too small on a phone. A drawing with a viewBox
 * that scales to its box scales its text with it: on a phone the text shows
 * at its own size times the drawing's width there over the viewBox width.
 * @param {string} markup the page's server markup
 * @returns {{count: number, px: number} | null} how many drawings show text
 *   under 10 px on a phone, and the smallest such size, rounded; null when
 *   none does
 */
export function smallSvgText(markup) {
  let count = 0;
  let smallest = Infinity;
  /** @type {{units: number, drawn: number, sizes: number[], hasText: boolean, depth: number} | null} */
  let open = null;
  for (const token of scanHtml(markup)) {
    if (token.kind === 'start') {
      const attrs = Object.fromEntries(
        token.attrs.map(([name, value]) => [name.toLowerCase(), value]),
      );
      if (open) {
        if (token.tag === 'svg' && !token.selfClosing) open.depth += 1;
        if (token.tag === 'text') open.hasText = true;
        const size =
          Number(/^\s*([\d.]+)(?:px)?\s*$/.exec(attrs['font-size'] ?? '')?.[1]) ||
          Number(/font-size:\s*([\d.]+)px/.exec(attrs.style ?? '')?.[1]);
        if (size > 0) open.sizes.push(size);
        continue;
      }
      if (token.tag !== 'svg' || token.selfClosing) continue;
      const units = Number(
        /^\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)/.exec(attrs.viewbox ?? '')?.[1],
      );
      const drawn = phoneDrawingWidth(attrs);
      if (drawn == null || !(units > drawn)) continue;
      const size =
        Number(/^\s*([\d.]+)(?:px)?\s*$/.exec(attrs['font-size'] ?? '')?.[1]) ||
        Number(/font-size:\s*([\d.]+)px/.exec(attrs.style ?? '')?.[1]);
      open = {units, drawn, sizes: size > 0 ? [size] : [], hasText: false, depth: 0};
    } else if (open && token.kind === 'end' && token.tag === 'svg') {
      if (open.depth > 0) {
        open.depth -= 1;
        continue;
      }
      if (open.hasText) {
        const textSize = open.sizes.length > 0 ? Math.min(...open.sizes) : DEFAULT_TEXT_SIZE;
        const px = (textSize * open.drawn) / open.units;
        if (px < SMALLEST_READABLE_TEXT) {
          count += 1;
          smallest = Math.min(smallest, px);
        }
      }
      open = null;
    }
  }
  return count > 0 ? {count, px: Math.round(smallest)} : null;
}

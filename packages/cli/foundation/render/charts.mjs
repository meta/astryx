// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Charts in a rendered page. A recharts chart draws only after its
 * effects run, and a ResponsiveContainer measures its parent in a browser, so
 * a server render leaves them empty. The render worker draws each one again
 * in a small document, at the size the container starts at, and puts the
 * drawing in its place.
 *
 * @input The chart elements the server render set aside.
 * @output Their markup, and the CSS that lets a drawn chart fit its width.
 * @position foundation/render — read by page-worker.mjs and render-page.mjs.
 */

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

/** Widest starting size for a chart its page lets fill the width. */
const CHART_MAX_WIDTH = 800;

/** Height of a chart that names none. */
const CHART_HEIGHT = 300;

/** Height up to which a chart counts as a sparkline. */
const SPARKLINE_HEIGHT = 60;

/**
 * The size a ResponsiveContainer starts at: its own numbers where it has
 * them. Otherwise the width follows the height: six times it for a
 * sparkline, which sits in a narrow card or a table cell, and two and a half
 * times it for a taller chart. The drawing then scales to the width the
 * page gives it, so its text stays near its own size in most layouts.
 * @param {{width?: unknown, height?: unknown, aspect?: unknown}} props
 * @returns {{width: number, height: number}}
 */
export function chartSize({width, height, aspect}) {
  const ratio = typeof aspect === 'number' && aspect > 0 ? aspect : null;
  const w = typeof width === 'number' && width > 0 ? width : null;
  const h =
    typeof height === 'number' && height > 0
      ? height
      : ratio
        ? (w ?? CHART_MAX_WIDTH) / ratio
        : CHART_HEIGHT;
  return {
    width:
      w ??
      (ratio
        ? h * ratio
        : Math.min(CHART_MAX_WIDTH, Math.round(h * (h <= SPARKLINE_HEIGHT ? 6 : 2.5)))),
    height: h,
  };
}

/**
 * A chart drawn at its starting size scales to the width the page gives it
 * and keeps its shape, so it never overflows its card. Its legend stays out
 * of the scaled picture, so its text never covers the chart however narrow
 * the page is. A horizontal legend takes its own row under the picture, or
 * above it when it asks for the top. A vertical legend on one side sits
 * beside the picture, on that side.
 */
export const CHART_CSS =
  '.recharts-responsive-container{width:100%}' +
  '.recharts-responsive-container>.recharts-wrapper{width:100%!important;height:auto!important;display:flex;flex-direction:column}' +
  // Only the chart's own picture scales; a legend's icons keep their size.
  '.recharts-responsive-container>.recharts-wrapper>svg.recharts-surface{width:100%!important;height:auto!important}' +
  '.recharts-responsive-container>.recharts-wrapper>.recharts-legend-wrapper{position:static!important;width:auto!important;height:auto!important}' +
  '.recharts-responsive-container>.recharts-wrapper:not([data-legend-side])>.recharts-legend-wrapper[style*="bottom"]{order:1}' +
  '.recharts-responsive-container>.recharts-wrapper[data-legend-side]{flex-direction:row;align-items:flex-start}' +
  // A side is physical, as in a chart of fixed size: a right-to-left page
  // reverses the row so the legend stays on the side it asked for.
  '.recharts-responsive-container>.recharts-wrapper[data-legend-side]:dir(rtl){flex-direction:row-reverse}' +
  '.recharts-responsive-container>.recharts-wrapper[data-legend-side][data-legend-middle]{align-items:center}' +
  '.recharts-responsive-container>.recharts-wrapper[data-legend-side][data-legend-bottom]{align-items:flex-end}' +
  '.recharts-responsive-container>.recharts-wrapper[data-legend-side]>svg.recharts-surface{flex:1 1 0;min-width:0}' +
  '.recharts-responsive-container>.recharts-wrapper[data-legend-side]>.recharts-legend-wrapper{flex:none}' +
  // recharts puts the legend before the picture; one on the right goes after it.
  '.recharts-responsive-container>.recharts-wrapper[data-legend-side="right"]>.recharts-legend-wrapper{order:1}';

/**
 * Mark each container chart whose legend is vertical and on one side with
 * that side, and whether it sits at the bottom or the middle, for
 * {@link CHART_CSS}. A vertically centered legend has a `top` near the
 * middle (no room is kept for it in a container chart). A vertical legend
 * centered across takes its own row, as a horizontal one does.
 * @param {any} root the element the charts were drawn in
 */
export function markLegends(root) {
  for (const wrapper of root.querySelectorAll('.recharts-responsive-container > .recharts-wrapper')) {
    const legend = wrapper.querySelector(':scope > .recharts-legend-wrapper');
    if (!legend) continue;
    const vertical = [...legend.querySelectorAll('.recharts-legend-item')].some(item =>
      /display:\s*block/.test(item.getAttribute('style') ?? ''),
    );
    if (!vertical) continue;
    const style = legend.getAttribute('style') ?? '';
    // recharts places a right-aligned legend with `right`, a left-aligned one
    // at the chart's left margin, and a centered one half way across.
    const width = Number(wrapper.getAttribute('width'));
    const left = Number(/(?:^|;)\s*left\s*:\s*(-?[\d.]+)px/.exec(style)?.[1]);
    const side = /(?:^|;)\s*right\s*:/.test(style)
      ? 'right'
      : Number.isFinite(left) && width > 0 && left < width * 0.2
        ? 'left'
        : null;
    if (!side) continue;
    wrapper.setAttribute('data-legend-side', side);
    const top = Number(/(?:^|;)\s*top\s*:\s*(-?[\d.]+)px/.exec(style)?.[1]);
    const height = Number(wrapper.getAttribute('height'));
    if (/(?:^|;)\s*bottom\s*:/.test(style)) wrapper.setAttribute('data-legend-bottom', '');
    else if (top > 0 && height > 0 && top > height * 0.2) wrapper.setAttribute('data-legend-middle', '');
  }
}

/**
 * The box a legend would measure in a browser, estimated from its items, so
 * a chart of fixed size keeps room for it where its props place it: rows for
 * a horizontal legend, one line per item for a vertical one. A chart sized by
 * its container keeps no room, because its legend takes its own row.
 * @param {any} el the legend wrapper
 */
function legendBox(el) {
  if (el.closest?.('.recharts-responsive-container')) return box(0, 0);
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
 * Give this thread the small document a chart draws in: no layout, no
 * motion, and no frames to wait for.
 * @returns {Promise<void>}
 */
export async function chartDocument() {
  const {parseHTML} = await import('linkedom');
  const {window} = parseHTML('<!doctype html><html><head></head><body></body></html>');
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

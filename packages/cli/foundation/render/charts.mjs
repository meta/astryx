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
 * and keeps its shape, so it never overflows its card.
 */
export const CHART_CSS =
  '.recharts-responsive-container{width:100%}' +
  // The wrapper keeps the starting shape (its aspect-ratio is set when the
  // chart is drawn), so a legend placed in percent stays where it was put.
  '.recharts-responsive-container>.recharts-wrapper{width:100%!important;height:auto!important}' +
  // Only the chart's own picture scales; a legend's icons keep their size.
  '.recharts-responsive-container>.recharts-wrapper>svg.recharts-surface{width:100%!important;height:auto!important}';

/**
 * The box a legend would measure in a browser, estimated from its items, so
 * recharts keeps room for it where its props place it: one row for a
 * horizontal legend, one line per item for a vertical one.
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

/**
 * Turn a drawn container chart's legend position from pixels into percent of
 * the starting size, and give its wrapper that shape, so the legend keeps its
 * place when the drawing scales.
 * @param {any} root the element the chart was drawn in
 */
export function fitLegends(root) {
  for (const wrapper of root.querySelectorAll('.recharts-responsive-container > .recharts-wrapper')) {
    const width = Number(wrapper.getAttribute('width'));
    const height = Number(wrapper.getAttribute('height'));
    if (!(width > 0 && height > 0)) continue;
    wrapper.setAttribute('style', `${wrapper.getAttribute('style') ?? ''};aspect-ratio:${width} / ${height}`);
    for (const legend of wrapper.querySelectorAll(':scope > .recharts-legend-wrapper')) {
      const style = (legend.getAttribute('style') ?? '').replace(
        /\b(left|right|width|top|bottom|height)\s*:\s*(-?[\d.]+)px/g,
        (/** @type {string} */ _, /** @type {string} */ prop, /** @type {string} */ px) =>
          `${prop}:${((Number(px) / (/left|right|width/.test(prop) ? width : height)) * 100).toFixed(3)}%`,
      );
      legend.setAttribute('style', style);
    }
  }
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
  // Nothing is laid out, so every box measures zero, except a legend's, which
  // is estimated so the chart keeps room for it.
  Object.defineProperty(window.Element.prototype, 'getBoundingClientRect', {
    configurable: true,
    writable: true,
    value() {
      return String(this.getAttribute?.('class') ?? '').includes('recharts-legend-wrapper') ? legendBox(this) : box(0, 0);
    },
  });
}

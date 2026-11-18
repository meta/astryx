// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Tests for the sizes a render draws a recharts ResponsiveContainer at,
 * the CSS that shows the drawing nearest its box, and the box heights a page
 * states.
 */

import {describe, expect, it} from 'vitest';
import {parseHTML} from 'linkedom';
import {CHART_CSS, CHART_WIDTHS, FOLLOWS_WIDTH, boxHeights, chartDrawings, roundCoordinates, separateIds} from './charts.mjs';

/** The width ranges the CSS shows each drawing in, from its container queries. */
function bands() {
  return [...CHART_CSS.matchAll(/@container \(([^)]*)\)\{[^{]*:nth-child\((\d+)\)/g)].map(m => {
    const lower = /^([\d.]+)px < width|width > ([\d.]+)px/.exec(m[1]);
    const upper = /width <= ([\d.]+)px/.exec(m[1]);
    return {
      child: Number(m[2]),
      from: lower ? Number(lower[1] ?? lower[2]) : 0,
      to: upper ? Number(upper[1]) : Infinity,
    };
  });
}

describe('CHART_WIDTHS', () => {
  it('runs from a narrow table cell to a wide screen, each width about the square root of two times the one before', () => {
    expect(CHART_WIDTHS[0]).toBe(60);
    expect(CHART_WIDTHS.at(-1)).toBe(1920);
    for (let k = 1; k < CHART_WIDTHS.length; k++) {
      expect(CHART_WIDTHS[k] / CHART_WIDTHS[k - 1]).toBeCloseTo(Math.SQRT2, 1);
    }
  });
});

describe('chartDrawings', () => {
  it('draws a container that follows its box at every width, at the height it gives', () => {
    const {sizes, style, follows} = chartDrawings({width: '100%', height: 200});
    expect(follows).toBe(true);
    expect(sizes).toEqual(CHART_WIDTHS.map(width => ({width, height: 200})));
    expect(style).toEqual({width: '100%', height: 200});
  });

  it("draws a container with its own width once, at that width, as a chart of fixed size", () => {
    expect(chartDrawings({width: 320, height: 180})).toEqual({
      sizes: [{width: 320, height: 180}],
      style: {width: 320, height: 180},
      follows: false,
    });
  });

  it('follows an aspect ratio at each width, and lets the box keep that shape', () => {
    const {sizes, style} = chartDrawings({width: '100%', aspect: 2});
    expect(sizes).toEqual(CHART_WIDTHS.map(width => ({width, height: Math.round(width / 2)})));
    expect(style).toEqual({width: '100%', height: 'auto', aspectRatio: 2});
    expect(chartDrawings({width: 400, aspect: 2}).sizes).toEqual([{width: 400, height: 200}]);
  });

  it("takes a percentage height as that share of the height its box states", () => {
    expect(chartDrawings({width: '100%', height: '100%'}, 280).sizes[0]).toEqual({width: 60, height: 280});
    expect(chartDrawings({width: '100%', height: '50%'}, 280).sizes[0]).toEqual({width: 60, height: 140});
    // The box keeps the share, so a browser gives it the height of its box.
    expect(chartDrawings({width: '100%', height: '100%'}, 280).style).toEqual({width: '100%', height: '100%'});
  });

  it('draws a chart 300 pixels high when neither it nor its box gives a height', () => {
    expect(chartDrawings({}).sizes[0]).toEqual({width: 60, height: 300});
    expect(chartDrawings({}).style).toEqual({width: '100%', height: '100%'});
    expect(chartDrawings({width: '100%', height: '100%'}, null).sizes[0].height).toBe(300);
  });

  it('keeps each height inside the minimum and maximum the container gives, and gives its box the same limits', () => {
    const {sizes, style} = chartDrawings({width: '100%', aspect: 2, minHeight: 100, maxHeight: 400, minWidth: 200});
    expect(sizes[0].height).toBe(100);
    expect(sizes.at(-1)?.height).toBe(400);
    expect(style).toEqual({width: '100%', height: 'auto', aspectRatio: 2, minWidth: 200, minHeight: 100, maxHeight: 400});
  });
});

describe('CHART_CSS', () => {
  it('shows exactly one drawing at every box width, the one nearest that width', () => {
    const shown = bands();
    expect(shown.map(b => b.child)).toEqual(CHART_WIDTHS.map((_, k) => k + 1));
    // The ranges meet end to end, from no width up to any width.
    expect(shown[0].from).toBe(0);
    expect(shown.at(-1)?.to).toBe(Infinity);
    for (let k = 1; k < shown.length; k++) expect(shown[k].from).toBe(shown[k - 1].to);
    // Each drawing scales by at most the fourth root of two either way.
    for (const [k, {from, to}] of shown.entries()) {
      const width = CHART_WIDTHS[k];
      if (k > 0) expect(width / from).toBeLessThanOrEqual(2 ** 0.25 + 0.01);
      if (to !== Infinity) expect(to / width).toBeLessThanOrEqual(2 ** 0.25 + 0.01);
    }
  });

  it('hides the drawings only in a container drawn at several widths, which it measures by its width', () => {
    expect(CHART_CSS).toContain(`.recharts-responsive-container[${FOLLOWS_WIDTH}]{container-type:inline-size}`);
    expect(CHART_CSS).toContain(`.recharts-responsive-container[${FOLLOWS_WIDTH}]>.recharts-wrapper{display:none}`);
  });

  it('fits the drawing whole in its box, which never grows past the width the page gives it', () => {
    expect(CHART_CSS).toContain('.recharts-responsive-container{max-width:100%}');
    expect(CHART_CSS).toContain('.recharts-responsive-container>.recharts-wrapper{width:100%!important;height:100%!important}');
    expect(CHART_CSS).toContain('.recharts-responsive-container>.recharts-wrapper>svg.recharts-surface{width:100%;height:100%;display:block}');
  });
});

describe('boxHeights', () => {
  it('reads the pixel height in the style of the element that holds each chart', async () => {
    const markup =
      '<div style="height:280px"><astryx-chart data-chart="0"></astryx-chart></div>' +
      '<div style="min-height:120px;padding:4px"><astryx-chart data-chart="1"></astryx-chart></div>' +
      '<section style="line-height:2;height: 90.5px"><astryx-chart data-chart="2"></astryx-chart></section>' +
      '<astryx-chart data-chart="3"></astryx-chart>';
    expect(await boxHeights(markup)).toEqual([280, null, 90.5, null]);
  });
});

describe('roundCoordinates', () => {
  it("rounds the coordinates of a chart drawn at several widths to a hundredth of a pixel, and leaves its text and a chart drawn once", () => {
    const path = '<path d="M5,206.66666666666669L60.123456,-3.3333333333333335" class="recharts-curve"></path>';
    const text = '<text x="12.3456" y="4"><tspan>3.14159</tspan></text>';
    const {document} = parseHTML(
      `<!doctype html><html><body><div ${FOLLOWS_WIDTH}="" class="recharts-responsive-container"><div class="recharts-wrapper"><svg class="recharts-surface">${path}${text}</svg></div></div>` +
        `<div class="recharts-wrapper"><svg class="recharts-surface">${path}</svg></div></body></html>`,
    );
    roundCoordinates(document.body);
    const [several, once] = [...document.querySelectorAll('svg.recharts-surface')];
    expect(several.querySelector('path')?.getAttribute('d')).toBe('M5,206.67L60.12,-3.33');
    expect(several.querySelector('text')?.getAttribute('x')).toBe('12.35');
    expect(several.querySelector('tspan')?.textContent).toBe('3.14159');
    expect(once.querySelector('path')?.getAttribute('d')).toBe('M5,206.66666666666669L60.123456,-3.3333333333333335');
  });
});

describe('separateIds', () => {
  it("gives each drawing of a chart drawn at several widths, and each such chart, its own ids, and points its references at them", () => {
    /** @param {number} width */
    const drawing = width =>
      `<div class="recharts-wrapper"><svg viewBox="0 0 ${width} 200" class="recharts-surface"><defs><linearGradient id="fade"></linearGradient></defs>` +
      `<path fill="url(#fade)" style="stroke:url('#fade')"></path><use href="#fade"></use><path fill="url(#page-wide)"></path><text id="t" aria-labelledby="t other">x</text></svg></div>`;
    const {document} = parseHTML(
      `<!doctype html><html><body><div ${FOLLOWS_WIDTH}="" class="recharts-responsive-container">${drawing(60)}${drawing(85)}</div>` +
        `<div class="recharts-responsive-container">${drawing(320)}</div>` +
        `<div ${FOLLOWS_WIDTH}="" class="recharts-responsive-container">${drawing(60)}</div></body></html>`,
    );
    separateIds(document.body);
    const [narrow, wide, once, second] = [...document.querySelectorAll('svg')];
    expect(narrow.querySelector('linearGradient')?.getAttribute('id')).toBe('fade-chart0-at-60');
    expect(wide.querySelector('linearGradient')?.getAttribute('id')).toBe('fade-chart0-at-85');
    // A second chart that writes the same id keeps its own.
    expect(second.querySelector('linearGradient')?.getAttribute('id')).toBe('fade-chart1-at-60');
    expect(second.querySelector('path')?.getAttribute('fill')).toBe('url(#fade-chart1-at-60)');
    const paths = wide.querySelectorAll('path');
    expect(paths[0].getAttribute('fill')).toBe('url(#fade-chart0-at-85)');
    expect(paths[0].getAttribute('style')).toBe("stroke:url('#fade-chart0-at-85')");
    expect(wide.querySelector('use')?.getAttribute('href')).toBe('#fade-chart0-at-85');
    expect(wide.querySelector('text')?.getAttribute('aria-labelledby')).toBe('t-chart0-at-85 other');
    // An id from outside the chart, and a chart drawn once, are left as they are.
    expect(paths[1].getAttribute('fill')).toBe('url(#page-wide)');
    expect(once.querySelector('linearGradient')?.getAttribute('id')).toBe('fade');
    // A chart drawn by itself takes the place it is given.
    const alone = parseHTML(`<!doctype html><html><body><div ${FOLLOWS_WIDTH}="" class="recharts-responsive-container">${drawing(60)}</div></body></html>`).document;
    separateIds(alone.body, 4);
    expect(alone.querySelector('linearGradient')?.getAttribute('id')).toBe('fade-chart4-at-60');
  });
});

// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A rendered page with charts sized by their containers, shown in
 * Chromium at a phone's, a tablet's and a desktop's width with no
 * JavaScript: each chart shows one drawing, which fits its box whole and
 * keeps the box's height, and its text stays near its own size. CI runs it
 * in node-browser-contracts' "Render chart browser case" step.
 */

import * as fs from 'node:fs';
import {createRequire} from 'node:module';
import * as path from 'node:path';
import {pathToFileURL} from 'node:url';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {render} from './render.mjs';
import {makeLinkedFixture, removeLinkedFixture} from '../../test-utils/linked-fixture.mjs';

// The case runs only in node-browser-contracts' "Render chart browser case"
// step, after the Chromium install; the Node shards list it as skipped.
const BROWSER_STEP = process.env.ASTRYX_RENDER_CHART_BROWSER === '1';
const {chromium} = createRequire(import.meta.url)('playwright');

/** The widths a reader sees the page at: a phone, a tablet and a desktop. */
const READER_WIDTHS = [390, 800, 1280];

/**
 * How far a drawing may scale from its own size: the fourth root of two,
 * as far as the drawing nearest a box's width scales (charts.mjs).
 */
const MOST_SCALE = 2 ** 0.25;

const PAGE = `import '@astryxdesign/core/astryx.css';
import {ResponsiveContainer, LineChart, Line, XAxis, YAxis, Legend, BarChart, Bar, AreaChart, Area} from 'recharts';
const data = [
  {m: 'Jan', a: 40, b: 24, c: 10}, {m: 'Feb', a: 30, b: 13, c: 22}, {m: 'Mar', a: 20, b: 58, c: 29},
  {m: 'Apr', a: 27, b: 39, c: 20}, {m: 'May', a: 18, b: 48, c: 21}, {m: 'Jun', a: 23, b: 38, c: 25},
];
const lines = [<XAxis key="x" dataKey="m" />, <YAxis key="y" />, <Legend key="l" />,
  <Line key="a" dataKey="a" stroke="#c00" />, <Line key="b" dataKey="b" stroke="#0a0" />, <Line key="c" dataKey="c" stroke="#00c" />];
// One chart component used twice, so both charts write the same gradient id.
function Faded() {
  return (
    <ResponsiveContainer width="100%" height={200}>
      <AreaChart data={data}>
        <defs><linearGradient id="fade" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#36c" /><stop offset="100%" stopColor="#36c" stopOpacity={0} /></linearGradient></defs>
        <XAxis dataKey="m" /><Area dataKey="a" fill="url(#fade)" />
      </AreaChart>
    </ResponsiveContainer>
  );
}
export default function Page() {
  return (
    <main style={{padding: 16}}>
      <div data-case="fills-box" style={{height: 280}}>
        <ResponsiveContainer width="100%" height="100%"><LineChart data={data}>{lines}</LineChart></ResponsiveContainer>
      </div>
      <div data-case="own-height">
        <ResponsiveContainer width="100%" height={240}><LineChart data={data}>{lines}</LineChart></ResponsiveContainer>
      </div>
      <div data-case="aspect">
        <ResponsiveContainer width="100%" aspect={3}><LineChart data={data}>{lines}</LineChart></ResponsiveContainer>
      </div>
      <div data-case="gradient"><Faded /></div>
      <div data-case="gradient-twin" style={{width: 300}}><Faded /></div>
      <div data-case="fixed">
        <BarChart width={300} height={150} data={data}><XAxis dataKey="m" /><Bar dataKey="a" /></BarChart>
      </div>
    </main>
  );
}
`;

describe.runIf(BROWSER_STEP)('a rendered chart at a reader’s width', () => {
  /** @type {string} */
  let dir;
  /** @type {any} */
  let browser;

  beforeAll(async () => {
    dir = makeLinkedFixture('astryx-render-charts-browser-', ['@astryxdesign', 'react', 'react-dom', 'recharts']);
    fs.writeFileSync(path.join(dir, 'charts.tsx'), PAGE);
    await render('charts.tsx', {cwd: dir});
    const executablePath = chromium.executablePath();
    if (!fs.existsSync(executablePath))
      throw new Error(`Playwright's Chromium is not installed at ${executablePath}: run npx playwright install chromium`);
    browser = await chromium.launch();
  }, 120_000);

  afterAll(async () => {
    await browser?.close();
    if (dir) removeLinkedFixture(dir);
  });

  it.each(READER_WIDTHS)(
    'at %i px, shows one drawing per chart that fits its box and keeps its text near its size',
    async width => {
      const page = await browser.newPage({viewport: {width, height: 900}, javaScriptEnabled: false});
      try {
        await page.goto(pathToFileURL(path.join(dir, 'charts.html')).href);
        const cases = await page.evaluate(() => {
          // This runs in the page, where the browser's globals are.
          const {document, getComputedStyle} = /** @type {any} */ (globalThis);
          return Object.fromEntries(
            [...document.querySelectorAll('[data-case]')].map((/** @type {any} */ box) => {
              const rect = box.getBoundingClientRect();
              const shown = [...box.querySelectorAll('.recharts-wrapper')].filter((/** @type {any} */ w) => getComputedStyle(w).display !== 'none');
              const svg = shown[0]?.querySelector(':scope > svg.recharts-surface');
              // The drawing's own boxes: its wrapper and its picture, which
              // clips what it paints, its legend included. A glyph's box
              // depends on the font, so it is not one of them.
              const parts = shown
                .flatMap((/** @type {any} */ w) => [w, w.querySelector(':scope > svg.recharts-surface')])
                .filter(Boolean)
                .map((/** @type {any} */ e) => e.getBoundingClientRect());
              const fits = parts.every(
                (/** @type {any} */ b) => b.top >= rect.top - 1 && b.bottom <= rect.bottom + 1 && b.left >= rect.left - 1 && b.right <= rect.right + 1,
              );
              const tick = svg?.querySelector('.recharts-cartesian-axis-tick-value');
              // The gradient an area fills with is the one in the drawing shown.
              const fill = /url\(#([^)]+)\)/.exec(svg?.querySelector('.recharts-area-area')?.getAttribute('fill') ?? '')?.[1];
              const paint = fill ? document.getElementById(fill) : null;
              return [
                box.getAttribute('data-case'),
                {
                  shown: shown.length,
                  fits,
                  boxWidth: rect.width,
                  boxHeight: rect.height,
                  scale: svg?.getScreenCTM()?.a ?? 0,
                  // A tick's text measured on the screen, against its own font size.
                  textScale: tick ? tick.getBoundingClientRect().height / tick.getBBox().height : 0,
                  fillShown: paint ? paint.closest('.recharts-wrapper') === shown[0] : null,
                },
              ];
            }),
          );
        });
        expect(cases.gradient.fillShown).toBe(true);
        expect(cases['gradient-twin'].fillShown).toBe(true);
        for (const name of ['fills-box', 'own-height', 'aspect', 'gradient', 'gradient-twin', 'fixed']) {
          const shown = cases[name];
          expect(shown.shown, name).toBe(1);
          expect(shown.fits, name).toBe(true);
        }
        // A chart keeps the height its box or its own props give it.
        expect(Math.round(cases['fills-box'].boxHeight)).toBe(280);
        expect(Math.round(cases['own-height'].boxHeight)).toBe(240);
        expect(cases.aspect.boxHeight).toBeCloseTo(cases.aspect.boxWidth / 3, 0);
        for (const name of ['fills-box', 'own-height', 'aspect']) {
          const {scale, textScale} = cases[name];
          expect(scale, name).toBeGreaterThanOrEqual(1 / MOST_SCALE - 0.01);
          expect(scale, name).toBeLessThanOrEqual(MOST_SCALE + 0.01);
          expect(textScale, name).toBeCloseTo(scale, 1);
        }
        // A chart of fixed size shows as its props give it.
        expect(cases.fixed.scale).toBe(1);
      } finally {
        await page.close();
      }
    },
    60_000,
  );
});

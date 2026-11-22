// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Tests for render() (`astryx experimental export`): charts.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {describe, expect, it} from 'vitest';
import {render} from './render.mjs';
import {CHART_WIDTHS} from '../../foundation/render/charts.mjs';
import {renderedMarkupOf} from '../../foundation/render/source-block.mjs';
import {dir, put, useRenderFixture} from '../../test-utils/render-fixture.mjs';

useRenderFixture();

describe('render(): charts', () => {
  const DATA = "const data = [{d: 'a', v: 1}, {d: 'b', v: 3}, {d: 'c', v: 2}];";
  /**
   * Each drawing in a page, in order: its picture's size and its markup.
   * @param {string} html
   */
  const drawingsIn = html =>
    html
      .split(/(?=<div\b[^>]*class="recharts-wrapper")/)
      .slice(1)
      .map(part => {
        const surface = /<svg\b(?![^>]*legend icon)[^>]*class="recharts-surface"[^>]*>/.exec(part)?.[0] ?? '';
        const [, width, height] = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(surface) ?? [];
        return {width: Number(width), height: Number(height), html: part};
      });
  /**
   * Each container chart's drawings, by the container's place in the page.
   * @param {string} html
   */
  const containersIn = html =>
    html
      .split(/(?=<div\b[^>]*class="recharts-responsive-container")/)
      .slice(1)
      .map(part => drawingsIn(part).slice(0, CHART_WIDTHS.length));

  it('draws a chart sized by its container at each width, and a chart of fixed size once', async () => {
    put(
      'charts.tsx',
      `import {ResponsiveContainer, LineChart, Line, XAxis, BarChart, Bar} from 'recharts';
${DATA}
export default function Page() {
  return (
    <div>
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={data}><XAxis dataKey="d" /><Line dataKey="v" /></LineChart>
      </ResponsiveContainer>
      <BarChart width={300} height={120} data={data}><Bar dataKey="v" /></BarChart>
    </div>
  );
}
import '@astryxdesign/core/astryx.css';
`,
    );
    const result = /** @type {any} */ (await render('charts.tsx', {cwd: dir}));
    expect(result.data.warnings.map((/** @type {any} */ w) => w.code)).not.toContain('chart-size');
    const html = fs.readFileSync(path.join(dir, 'charts.html'), 'utf8');
    expect(html).toContain('recharts-line-curve');
    expect(html).toContain('recharts-bar-rectangle');
    // The container is drawn at each width, all 200 pixels high, in a box
    // with the size the container gives itself in a browser.
    const [container] = containersIn(html);
    expect(container.map(d => [d.width, d.height])).toEqual(CHART_WIDTHS.map(w => [w, 200]));
    expect(html).toContain('<div data-astryx-chart-widths="" style="width:100%;height:200px" class="recharts-responsive-container">');
    // The chart of fixed size is drawn once, as its props give it.
    expect(drawingsIn(html).map(d => [d.width, d.height]).slice(-1)).toEqual([[300, 120]]);
    expect(html).toContain('@container (width <= 71px)');
    expect(html).not.toContain('<astryx-chart');
  }, 60_000);

  it('draws a chart that fills its box at the height the box states', async () => {
    put(
      'charts-box.tsx',
      `import {ResponsiveContainer, LineChart, Line, XAxis} from 'recharts';
${DATA}
export default function Page() {
  return (
    <div>
      <div style={{height: 280}}>
        <ResponsiveContainer width="100%" height="100%"><LineChart data={data}><XAxis dataKey="d" /><Line dataKey="v" /></LineChart></ResponsiveContainer>
      </div>
      <section>
        <ResponsiveContainer width="100%" height="50%"><LineChart data={data}><XAxis dataKey="d" /><Line dataKey="v" /></LineChart></ResponsiveContainer>
      </section>
    </div>
  );
}
import '@astryxdesign/core/astryx.css';
`,
    );
    await render('charts-box.tsx', {cwd: dir});
    const [fills, unstated] = containersIn(fs.readFileSync(path.join(dir, 'charts-box.html'), 'utf8'));
    expect(new Set(fills.map(d => d.height))).toEqual(new Set([280]));
    // A box that states no height gives none to share: the chart is drawn
    // 300 high and fits the box a browser gives it.
    expect(new Set(unstated.map(d => d.height))).toEqual(new Set([300]));
  }, 60_000);

  it('gives each drawing of a container chart its own ids, so a gradient the page defines in it fills every drawing', async () => {
    put(
      'charts-gradient.tsx',
      `import {ResponsiveContainer, AreaChart, Area, XAxis} from 'recharts';
${DATA}
export default function Page() {
  return (
    <ResponsiveContainer width="100%" height={200}>
      <AreaChart data={data}>
        <defs><linearGradient id="fade" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#36c" /><stop offset="100%" stopColor="#36c" stopOpacity={0} /></linearGradient></defs>
        <XAxis dataKey="d" /><Area dataKey="v" fill="url(#fade)" />
      </AreaChart>
    </ResponsiveContainer>
  );
}
import '@astryxdesign/core/astryx.css';
`,
    );
    await render('charts-gradient.tsx', {cwd: dir});
    const [container] = containersIn(renderedMarkupOf(fs.readFileSync(path.join(dir, 'charts-gradient.html'), 'utf8')) ?? '');
    for (const {width, html: part} of container) {
      expect(part).toMatch(new RegExp(`<linearGradient\\b[^>]*\\bid="fade-chart0-at-${width}"`));
      expect(part).toContain(`fill="url(#fade-chart0-at-${width})"`);
      expect(part).not.toMatch(/id="fade"|url\(#fade\)/);
    }
  }, 60_000);

  it("keeps room for a chart's legend where its props place it, and puts a container chart's legend inside its picture", async () => {
    put(
      'charts-legend.tsx',
      `import {ResponsiveContainer, LineChart, Line, XAxis, Legend} from 'recharts';
${DATA}
export default function Page() {
  return (
    <div>
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={data}><XAxis dataKey="d" /><Line dataKey="v" /><Legend /></LineChart>
      </ResponsiveContainer>
      <LineChart width={400} height={200} data={data}><XAxis dataKey="d" /><Line dataKey="v" /><Legend /></LineChart>
      <LineChart width={550} height={220} data={data}><XAxis dataKey="d" /><Line dataKey="v" name="Visits" /><Legend layout="vertical" align="right" verticalAlign="middle" /></LineChart>
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={data}><XAxis dataKey="d" /><Line dataKey="v" name="Visits" /><Legend layout="vertical" align="right" verticalAlign="middle" /></LineChart>
      </ResponsiveContainer>
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={data}><XAxis dataKey="d" /><Line dataKey="v" name="Wins" /><Legend layout="vertical" align="left" verticalAlign="bottom" /></LineChart>
      </ResponsiveContainer>
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={data}><XAxis dataKey="d" /><Line dataKey="v" name="Bold" /><Legend wrapperStyle={{fontSize: 12, fontWeight: 700}} /></LineChart>
      </ResponsiveContainer>
    </div>
  );
}
import '@astryxdesign/core/astryx.css';
`,
    );
    const result = /** @type {any} */ (await render('charts-legend.tsx', {cwd: dir}));
    expect(result.data.warnings.map((/** @type {any} */ w) => w.code)).not.toContain('chart-size');
    const html = fs.readFileSync(path.join(dir, 'charts-legend.html'), 'utf8');
    /** @param {string} part */
    const axis = part => {
      const line = /<line\b[^>]*class="recharts-cartesian-axis-line"[^>]*>/.exec(part)?.[0] ?? '';
      return {y: Number(/\by1="([\d.]+)"/.exec(line)?.[1]), x2: Number(/\bx2="([\d.]+)"/.exec(line)?.[1])};
    };
    /** @param {string} part */
    const legendBox = part => {
      const tag = /<foreignObject\b[^>]*>/.exec(part)?.[0] ?? '';
      /** @param {string} name */
      const n = name => Number(new RegExp(`\\b${name}="([\\d.]+)"`).exec(tag)?.[1]);
      return {x: n('x'), y: n('y'), width: n('width'), height: n('height')};
    };
    const fixed = drawingsIn(html);
    const [bottom, right, left, styled] = containersIn(html);
    const wide = bottom.find(d => d.width === 960);
    // Each chart keeps a row for a bottom legend: 200 - 5 - 24 - 30 = 141.
    expect(axis(/** @type {any} */ (wide).html).y).toBe(141);
    expect(axis(fixed.find(d => d.width === 400)?.html ?? '').y).toBe(141);
    // A container chart's legend sits in that row, inside the picture, so it
    // scales with the drawing and never covers it.
    expect(legendBox(/** @type {any} */ (wide).html)).toEqual({x: 5, y: 200 - 5 - 24, width: 950, height: 24});
    expect(/** @type {any} */ (wide).html).toMatch(/<foreignObject\b[^>]*><div style="width:100%" class="recharts-legend-wrapper">/);
    // A legend at the side keeps room there: the plot ends before it, and
    // the legend sits at that edge, at the height recharts gives it.
    const sided = /** @type {any} */ (right.find(d => d.width === 960));
    expect(axis(sided.html).x2).toBeLessThan(960 - 40);
    const box = legendBox(sided.html);
    expect(box.x + box.width).toBe(960 - 5);
    const low = legendBox(/** @type {any} */ (left.find(d => d.width === 960)).html);
    expect(low.x).toBe(5);
    expect(low.y + low.height).toBe(220 - 5);
    // Inside the picture a legend keeps the rest of its own style.
    const styledLegend = /<div style="([^"]*)" class="recharts-legend-wrapper">/.exec(/** @type {any} */ (styled.find(d => d.width === 960)).html)?.[1];
    expect(styledLegend).toContain('font-size:12px');
    expect(styledLegend).toContain('font-weight:700');
    expect(styledLegend).toContain('width:100%');
    expect(styledLegend).not.toMatch(/position|left|bottom/);
    // A chart of fixed size keeps its legend in the layer recharts puts it in.
    expect(fixed.find(d => d.width === 550)?.html).not.toContain('<foreignObject');
    expect(html).not.toContain('data-legend-side');
  }, 60_000);

  it("draws a chart's parts in the React context the page gives them", async () => {
    put(
      'charts-context.tsx',
      `import {createContext, useContext} from 'react';
import {BarChart, Bar, XAxis} from 'recharts';
${DATA}
const Units = createContext('items');
function Tick(props: any) {
  const units = useContext(Units);
  return <text x={props.x} y={props.y + 12}>{props.payload.value} {units}</text>;
}
export default function Page() {
  return (
    <Units.Provider value="km">
      <BarChart width={300} height={150} data={data}><XAxis dataKey="d" tick={<Tick />} /><Bar dataKey="v" /></BarChart>
    </Units.Provider>
  );
}
import '@astryxdesign/core/astryx.css';
`,
    );
    await render('charts-context.tsx', {cwd: dir});
    const html = fs.readFileSync(path.join(dir, 'charts-context.html'), 'utf8');
    expect(html).toContain('a km');
    expect(html).not.toContain('a items');
  }, 60_000);

  it('draws inside a page that uses Core scrolling components, so context still reaches the chart', async () => {
    put(
      'charts-core.tsx',
      `import {createContext, useContext} from 'react';
import {ScrollableArea} from '@astryxdesign/core/ScrollableArea';
import {BarChart, Bar, XAxis} from 'recharts';
${DATA}
const Units = createContext('items');
function Tick(props: any) {
  return <text x={props.x} y={props.y + 12}>{props.payload.value} {useContext(Units)}</text>;
}
export default function Page() {
  console.log('rendered once');
  return (
    <Units.Provider value="km">
      <ScrollableArea>
        <BarChart width={300} height={150} data={data}><XAxis dataKey="d" tick={<Tick />} /><Bar dataKey="v" /></BarChart>
      </ScrollableArea>
    </Units.Provider>
  );
}
`,
    );
    const result = /** @type {any} */ (await render('charts-core.tsx', {cwd: dir}));
    const html = fs.readFileSync(path.join(dir, 'charts-core.html'), 'utf8');
    expect(html).toContain('a km');
    expect(result.data.warnings.map((/** @type {any} */ w) => w.code)).not.toContain('chart-size');
    // What the page prints is reported once, from the server render.
    const printed = result.data.warnings.filter((/** @type {any} */ w) => w.code === 'page-output');
    expect(printed.filter((/** @type {any} */ w) => w.message.includes('rendered once'))).toHaveLength(1);
  }, 60_000);

  it("logs no render timings while it draws a chart, so a chart's props are never copied into them", async () => {
    put(
      'charts-timings.tsx',
      `import {BarChart, Bar, XAxis} from 'recharts';
${DATA}
// React's development build logs each render with console.timeStamp when it can.
let timings = 0;
const timeStamp = console.timeStamp;
console.timeStamp = (...args: any[]) => {
  timings += 1;
  return timeStamp?.apply(console, args);
};
function Tick(props: any) {
  return <text x={props.x} y={props.y + 12}>{props.payload.value} timings {timings}</text>;
}
function OnlyOnServer() {
  // Throws once a document exists, so each chart is drawn by itself, one after the other.
  if (typeof document !== 'undefined') throw new Error('drawn alone');
  return null;
}
export default function Page() {
  return (
    <div>
      <OnlyOnServer />
      <BarChart width={300} height={150} data={data}><XAxis dataKey="d" tick={<Tick />} /><Bar dataKey="v" /></BarChart>
      <BarChart width={300} height={150} data={data}><XAxis dataKey="d" tick={<Tick />} /><Bar dataKey="v" /></BarChart>
    </div>
  );
}
import '@astryxdesign/core/astryx.css';
`,
    );
    await render('charts-timings.tsx', {cwd: dir});
    const html = fs.readFileSync(path.join(dir, 'charts-timings.html'), 'utf8');
    expect(html.match(/a timings \d+/g)).toEqual(['a timings 0', 'a timings 0']);
  }, 60_000);

  it('says so when it draws each chart by itself', async () => {
    put(
      'charts-alone.tsx',
      `import {BarChart, Bar} from 'recharts';
${DATA}
function OnlyOnServer() {
  // Throws only once a document exists, so the page draws on the server but not again.
  if (typeof document !== 'undefined') throw new Error('no second draw');
  return null;
}
export default function Page() {
  return <div><OnlyOnServer /><BarChart width={300} height={150} data={data}><Bar dataKey="v" /></BarChart></div>;
}
import '@astryxdesign/core/astryx.css';
`,
    );
    const result = /** @type {any} */ (await render('charts-alone.tsx', {cwd: dir}));
    const html = fs.readFileSync(path.join(dir, 'charts-alone.html'), 'utf8');
    expect(html).toContain('recharts-bar-rectangle');
    const warning = result.data.warnings.find((/** @type {any} */ w) => w.code === 'chart-size');
    expect(warning?.message).toContain('each chart was drawn by itself');
  }, 60_000);

  it('draws charts as the first render gives them, not as the page\'s effects change it', async () => {
    put(
      'charts-effects.tsx',
      `import {useEffect, useState} from 'react';
import {BarChart, Bar, XAxis} from 'recharts';
${DATA}
export default function Page() {
  const [rows, setRows] = useState<string[]>([]);
  useEffect(() => setRows(['order one']), []);
  return (
    <div>
      <p>{rows.length === 0 ? 'No orders yet' : rows.join(', ')}</p>
      {rows.length === 0 ? null : <BarChart width={300} height={150} data={data}><XAxis dataKey="d" /><Bar dataKey="v" /></BarChart>}
      <BarChart width={300} height={150} data={data}><XAxis dataKey="d" /><Bar dataKey="v" /></BarChart>
    </div>
  );
}
import '@astryxdesign/core/astryx.css';
`,
    );
    const result = /** @type {any} */ (await render('charts-effects.tsx', {cwd: dir}));
    const html = fs.readFileSync(path.join(dir, 'charts-effects.html'), 'utf8');
    expect(html).toContain('No orders yet');
    expect(html.match(/<svg[^>]*class="recharts-surface"/g)).toHaveLength(1);
    const warning = result.data.warnings.find((/** @type {any} */ w) => w.code === 'chart-size');
    expect(warning?.message).toContain('once its effects ran');
  }, 60_000);

  it('draws a chart as the first render gave it when an effect changes state a closure in it reads', async () => {
    put(
      'charts-effect-closure.tsx',
      `import {useEffect, useState} from 'react';
import {BarChart, Bar, XAxis} from 'recharts';
const data = [{d: 'Mon', v: 1}, {d: 'Tue', v: 2}];
export default function Page() {
  const [unit, setUnit] = useState('items');
  useEffect(() => setUnit('km'), []);
  return (
    <div>
      <p>Unit: {unit}</p>
      <BarChart width={300} height={150} data={data}><XAxis dataKey="d" tickFormatter={(v: string) => v + ' ' + unit} /><Bar dataKey="v" /></BarChart>
    </div>
  );
}
import '@astryxdesign/core/astryx.css';
`,
    );
    const result = /** @type {any} */ (await render('charts-effect-closure.tsx', {cwd: dir}));
    const html = fs.readFileSync(path.join(dir, 'charts-effect-closure.html'), 'utf8');
    expect(html).toContain('Unit: items');
    expect(html).toContain('Mon items');
    expect(html).not.toContain('Mon km');
    expect(result.data.warnings.find((/** @type {any} */ w) => w.code === 'chart-size')?.message).toContain('A component that makes a chart rendered again');
  }, 60_000);

  it('names a re-render as the cause when a chart\'s maker only re-renders in an effect', async () => {
    put(
      'charts-effect-mounted.tsx',
      `import {useEffect, useState} from 'react';
import {BarChart, Bar} from 'recharts';
const data = [{v: 1}, {v: 2}];
export default function Page() {
  const [, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return <BarChart width={300} height={150} data={data}><Bar dataKey="v" /></BarChart>;
}
import '@astryxdesign/core/astryx.css';
`,
    );
    const result = /** @type {any} */ (await render('charts-effect-mounted.tsx', {cwd: dir}));
    const message = result.data.warnings.find((/** @type {any} */ w) => w.code === 'chart-size')?.message ?? '';
    expect(message).toContain('A component that makes a chart rendered again');
    expect(message).not.toContain('changed its charts');
  }, 60_000);

  it('keeps first-render data and props, and lets a context an effect changes reach the chart', async () => {
    // The guide promises a chart's data and props from the first render; a
    // value its parts read from a context that an effect changes may show its
    // later value.
    put(
      'charts-effect-provider.tsx',
      `import {createContext, useContext, useEffect, useState} from 'react';
import {BarChart, Bar, XAxis} from 'recharts';
const data = [{d: 'a', v: 1}, {d: 'b', v: 2}];
const Units = createContext('items');
function UnitsProvider({children}: {children: any}) {
  const [unit, setUnit] = useState('items');
  useEffect(() => setUnit('km'), []);
  return <Units.Provider value={unit}><p>Unit: {unit}</p>{children}</Units.Provider>;
}
function Tick(props: any) {
  return <text x={props.x} y={props.y + 12}>{props.payload.value} {useContext(Units)}</text>;
}
export default function Page() {
  return (
    <UnitsProvider>
      <BarChart width={300} height={150} data={data}><XAxis dataKey="d" tick={<Tick />} /><Bar dataKey="v" /></BarChart>
    </UnitsProvider>
  );
}
import '@astryxdesign/core/astryx.css';
`,
    );
    await render('charts-effect-provider.tsx', {cwd: dir});
    const html = renderedMarkupOf(fs.readFileSync(path.join(dir, 'charts-effect-provider.html'), 'utf8')) ?? '';
    expect(html).toContain('Unit: items');
    expect(html.match(/\brecharts-bar-rectangle\b(?!s)/g)).toHaveLength(2);
    expect(html).toMatch(/a (items|km)/);
  }, 60_000);

  it('draws a chart with the data of the first render when an effect replaces it', async () => {
    put(
      'charts-effect-data.tsx',
      `import {useEffect, useState} from 'react';
import {BarChart, Bar, XAxis} from 'recharts';
export default function Page() {
  const [data, setData] = useState([{d: 'first', v: 1}]);
  useEffect(() => setData([{d: 'later', v: 2}]), []);
  return <BarChart width={300} height={150} data={data}><XAxis dataKey="d" /><Bar dataKey="v" /></BarChart>;
}
import '@astryxdesign/core/astryx.css';
`,
    );
    const result = /** @type {any} */ (await render('charts-effect-data.tsx', {cwd: dir}));
    const html = fs.readFileSync(path.join(dir, 'charts-effect-data.html'), 'utf8');
    expect(html).toContain('>first<');
    expect(html).not.toContain('>later<');
    expect(result.data.warnings.find((/** @type {any} */ w) => w.code === 'chart-size')?.message).toContain('once its effects ran');
  }, 60_000);

  it('keeps room for a legend that wraps onto more rows', async () => {
    put(
      'charts-wrap.tsx',
      `import {LineChart, Line, XAxis, Legend} from 'recharts';
const data = [{d: 'Mon', a: 1, b: 2, c: 3, e: 4, f: 5}, {d: 'Tue', a: 2, b: 3, c: 1, e: 2, f: 3}];
export default function Page() {
  return (
    <LineChart width={480} height={240} data={data}>
      <XAxis dataKey="d" />
      <Line dataKey="a" name="Northern region" /><Line dataKey="b" name="Southern region" />
      <Line dataKey="c" name="Eastern region" /><Line dataKey="e" name="Western region" />
      <Line dataKey="f" name="Central region" />
      <Legend />
    </LineChart>
  );
}
import '@astryxdesign/core/astryx.css';
`,
    );
    await render('charts-wrap.tsx', {cwd: dir});
    const html = fs.readFileSync(path.join(dir, 'charts-wrap.html'), 'utf8');
    const axis = /<line\b[^>]*class="recharts-cartesian-axis-line"[^>]*>/.exec(html)?.[0] ?? '';
    // Five names of about 120 px each wrap into two rows in 470 px, so the
    // axis sits two legend rows up: 240 - 5 - 48 - 30 = 157.
    expect(Number(/\by1="([\d.]+)"/.exec(axis)?.[1])).toBe(157);
    // A container chart drawn 480 wide keeps the same room.
    put('charts-wrap-rc.tsx', fs.readFileSync(path.join(dir, 'charts-wrap.tsx'), 'utf8')
      .replace("import {LineChart,", "import {ResponsiveContainer, LineChart,")
      .replace('<LineChart width={480} height={240} data={data}>', '<ResponsiveContainer width="100%" height={240}><LineChart data={data}>')
      .replace('</LineChart>', '</LineChart></ResponsiveContainer>'));
    await render('charts-wrap-rc.tsx', {cwd: dir});
    const rc = fs.readFileSync(path.join(dir, 'charts-wrap-rc.html'), 'utf8');
    const at480 = drawingsIn(rc).find(d => d.width === 480)?.html ?? '';
    const rcAxis = /<line\b[^>]*class="recharts-cartesian-axis-line"[^>]*>/.exec(at480)?.[0] ?? '';
    expect(Number(/\by1="([\d.]+)"/.exec(rcAxis)?.[1])).toBe(157);
    expect(rc).toContain('recharts-legend-wrapper');
  }, 60_000);

  it('lays out axis labels as a browser does: the last label stays inside, and crowded labels thin out', async () => {
    const times = Array.from({length: 25}, (_, i) => `Apr ${1 + Math.floor((14 + i) / 24)} ${String((14 + i) % 24).padStart(2, '0')}:00`);
    const cats = Array.from({length: 24}, (_, i) => `Category ${String(i + 1).padStart(2, '0')}`);
    put(
      'charts-axis.tsx',
      `import {ResponsiveContainer, LineChart, Line, XAxis, BarChart, Bar} from 'recharts';
const times = ${JSON.stringify(times)}.map((t, i) => ({t, v: i}));
const cats = ${JSON.stringify(cats)}.map((c, i) => ({c, v: i}));
export default function Page() {
  return (
    <div>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={times}><XAxis dataKey="t" /><Line dataKey="v" /></LineChart>
      </ResponsiveContainer>
      <BarChart width={400} height={200} data={cats}><XAxis dataKey="c" /><Bar dataKey="v" /></BarChart>
    </div>
  );
}
import '@astryxdesign/core/astryx.css';
`,
    );
    await render('charts-axis.tsx', {cwd: dir});
    const html = fs.readFileSync(path.join(dir, 'charts-axis.html'), 'utf8');
    /** @param {string} part */
    const ticksIn = part =>
      [...part.matchAll(/<text\b([^>]*class="recharts-text recharts-cartesian-axis-tick-value"[^>]*)>\s*<tspan[^>]*>([^<]*)/g)].map(m => ({
        x: Number(/\bx="([\d.]+)"/.exec(m[1])?.[1]),
        anchor: /text-anchor="(\w+)"/.exec(m[1])?.[1],
        text: m[2],
      }));
    const drawings = drawingsIn(html);
    // In each drawing of the container chart, the last label stays inside:
    // an 11-character label at 14 px is about 92 wide. A drawing too narrow
    // for one label shows none, as a browser that narrow does.
    for (const {width, html: part} of drawings.filter(d => d.width !== 400)) {
      const timeTicks = ticksIn(part).filter(t => t.text.startsWith('Apr'));
      const last = timeTicks[timeTicks.length - 1];
      if (width < 240 && !last) continue;
      expect(last.anchor).toBe('middle');
      expect(last.x + Math.round(last.text.length * 14 * 0.6) / 2).toBeLessThanOrEqual(width);
      expect(timeTicks.length).toBeLessThan(25);
    }
    // A narrower drawing shows fewer labels, as a narrower browser does.
    const count = (/** @type {number} */ w) => ticksIn(drawings.find(d => d.width === w)?.html ?? '').length;
    expect(count(339)).toBeLessThan(count(1358));
    const ticks = ticksIn(drawings.find(d => d.width === 400)?.html ?? '');
    const catTicks = ticks.filter(t => t.text.startsWith('Category'));
    expect(catTicks.length).toBeGreaterThan(1);
    expect(catTicks.length).toBeLessThan(24);
  }, 60_000);

  it("keeps a StrictMode page's context in its charts", async () => {
    put(
      'charts-strict.tsx',
      `import {StrictMode, createContext, useContext} from 'react';
import {BarChart, Bar, XAxis} from 'recharts';
${DATA}
const Units = createContext('items');
function Tick(props: any) {
  return <text x={props.x} y={props.y + 12}>{props.payload.value} {useContext(Units)}</text>;
}
export default function Page() {
  return (
    <StrictMode>
      <Units.Provider value="km">
        <BarChart width={300} height={150} data={data}><XAxis dataKey="d" tick={<Tick />} /><Bar dataKey="v" /></BarChart>
      </Units.Provider>
    </StrictMode>
  );
}
import '@astryxdesign/core/astryx.css';
`,
    );
    const result = /** @type {any} */ (await render('charts-strict.tsx', {cwd: dir}));
    const html = fs.readFileSync(path.join(dir, 'charts-strict.html'), 'utf8');
    expect(html).toContain('a km');
    expect(result.data.warnings.map((/** @type {any} */ w) => w.code)).not.toContain('chart-size');
  }, 60_000);

  it('names a chart of fixed size it cannot draw', async () => {
    put(
      'charts-ns-fixed.tsx',
      `import * as R from 'recharts';
${DATA}
export default function Page() {
  return <R.BarChart width={300} height={120} data={data}><R.Bar dataKey="v" /></R.BarChart>;
}
import '@astryxdesign/core/astryx.css';
`,
    );
    const result = /** @type {any} */ (await render('charts-ns-fixed.tsx', {cwd: dir}));
    const warning = result.data.warnings.find((/** @type {any} */ w) => w.code === 'chart-size');
    expect(warning?.message).toContain("from recharts by name");
    expect(warning?.message).not.toContain('fixed width');
  }, 60_000);

  it('warns about a chart it cannot draw', async () => {
    put(
      'charts-ns.tsx',
      `import * as R from 'recharts';
${DATA}
export default function Page() {
  return (
    <R.ResponsiveContainer width="100%" height={200}>
      <R.LineChart data={data}><R.Line dataKey="v" /></R.LineChart>
    </R.ResponsiveContainer>
  );
}
import '@astryxdesign/core/astryx.css';
`,
    );
    const result = /** @type {any} */ (await render('charts-ns.tsx', {cwd: dir}));
    expect(result.data.warnings.map((/** @type {any} */ w) => w.code)).toContain('chart-size');
  }, 60_000);

  it('gives back a page with charts byte for byte', async () => {
    const source = fs.readFileSync(path.join(dir, 'charts.tsx'), 'utf8');
    const back = /** @type {any} */ (await render('charts.html', {cwd: dir, reverse: true, out: 'charts-back/charts.tsx'}));
    expect(back.data.exact).toBe(true);
    expect(fs.readFileSync(path.join(dir, 'charts-back', 'charts.tsx'), 'utf8')).toBe(source);
  }, 60_000);
});

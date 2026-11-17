// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `astryx docs visualization/data-colors-in-renderers`: pass Astryx
 * data-color tokens to chart renderers by rendering model: SVG and DOM
 * renderers such as Recharts and D3, Canvas, and configuration-driven
 * renderers such as Vega-Lite.
 */

/** @type {import('@astryxdesign/cli/authoring').ReferenceDoc} */

export const docs = {
  type: 'generic',
  name: 'data-colors-in-renderers',
  title: 'Use Astryx data colors in chart renderers',
  placement: {parent: 'namespace:visualization', slot: 'guides', order: 10},
  category: 'guide',
  description:
    'Give chart renderers the Astryx data colors: `dataVars` or raw CSS variables for SVG and DOM renderers such as Recharts and D3, and resolved values from `useTheme().token()` for Canvas and configuration-driven renderers such as Vega-Lite.',
  keywords: [
    'dataVars',
    'data tokens',
    'chart colors',
    'dark mode',
    'tree-shaking',
    'recharts theme',
    'd3 color',
    'canvas chart colors',
    'vega-lite colors',
    'chart theme colors',
    'configuration-driven renderer',
    'third-party charts',
  ],

  sections: [
    {
      id: 'choose-a-path',
      title: 'Choose how your chart renderer reads data colors',
      content: [
        {
          type: 'prose',
          text: 'SVG and DOM renderers, such as Recharts and D3, read CSS variables: `dataVars`, or raw `var(--color-data-*)` with prebuilt `astryx.css`. Canvas and configuration-driven renderers, such as Vega-Lite, need concrete colors from `useTheme().token()`.',
        },
        {
          type: 'prose',
          text: 'Astryx has three groups of data colors: 10 categorical colors, 1 neutral, and 9 sequential ramps with 5 steps each. {@link generic:tokens-data} lists every name and its current value.',
        },
        {
          type: 'table',
          headers: ['Rendering model', 'Read data colors with', 'Section'],
          rows: [
            [
              'SVG and DOM renderers (for example Recharts and D3), in an app that compiles StyleX from source',
              '`dataVars`',
              '`use-datavars`',
            ],
            [
              'SVG and DOM renderers, in an app that loads prebuilt `@astryxdesign/core/astryx.css`',
              '`dataVars`, or raw `var(--color-data-*)` in CSS',
              '`use-raw-css-variables`',
            ],
            [
              'Canvas (the Canvas 2D API)',
              '`useTheme().token()` in React, `resolveThemeTokens()` outside React',
              '`draw-canvas-with-resolved-colors`',
            ],
            [
              'Configuration-driven renderers: libraries that take colors in a config or spec object (for example Vega-Lite)',
              '`useTheme().token()` in React, `resolveThemeTokens()` outside React',
              '`configure-vega-lite`',
            ],
            ['WebGL or another GPU color input', 'Not covered yet', ''],
          ],
        },
        {
          type: 'prose',
          text: 'The browser resolves a CSS variable only where it applies CSS to an element. A string that you give to the [Canvas 2D API](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/fillStyle), put in a config object, or pass to code that computes with colors in JavaScript stays the text `var(...)`, which is not a color.',
        },
        {
          type: 'prose',
          text: "The examples in this guide pick tokens only to show how a value reaches the renderer. Which token suits which part of a chart is not covered yet. Axes, grid lines, and tick and axis labels (the chart chrome) are not covered yet either, so the examples keep each library's default chrome.",
        },
        {
          type: 'list',
          style: 'dont',
          items: [
            'Give a `dataVars` value or a `var()` string to an API that needs a concrete color. It does not paint the token color.',
            'Expect a theme stylesheet to define the data-color defaults. A theme emits only the data colors it sets, and every other data color comes from Core.',
          ],
        },
      ],
    },
    {
      id: 'use-datavars',
      title: 'Color SVG charts with dataVars',
      content: [
        {
          type: 'prose',
          text: 'Import `dataVars` from `@astryxdesign/core/theme/dataTokens.stylex` and pass a key to the prop or attribute that sets an SVG or DOM color, such as `fill` on a Recharts `Bar`. Each value is the `var(--color-data-*)` reference for that token.',
        },
        {
          type: 'code',
          lang: 'tsx',
          label: 'Recharts bars that use dataVars',
          code: `import {Bar, BarChart, XAxis, YAxis} from 'recharts';
import {dataVars} from '@astryxdesign/core/theme/dataTokens.stylex';

const quarters = [
  {quarter: 'Q1', revenue: 128, costs: 82, other: 40},
  {quarter: 'Q2', revenue: 156, costs: 94, other: 52},
  {quarter: 'Q3', revenue: 143, costs: 101, other: 47},
  {quarter: 'Q4', revenue: 184, costs: 112, other: 61},
];

export function QuarterlyRechartsChart() {
  return (
    <BarChart width={480} height={240} data={quarters}>
      <XAxis dataKey="quarter" />
      <YAxis />
      <Bar dataKey="revenue" fill={dataVars['--color-data-categorical-blue']} />
      <Bar dataKey="costs" fill={dataVars['--color-data-categorical-orange']} />
      <Bar dataKey="other" fill={dataVars['--color-data-categorical-purple']} />
    </BarChart>
  );
}`,
        },
        {
          type: 'prose',
          text: 'Where the data-color definitions come from depends on how your app builds Astryx:',
        },
        {
          type: 'list',
          style: 'unordered',
          items: [
            'Prebuilt `astryx.css` defines all 56 data colors. This is also the setup when StyleX compiles only your own code.',
            'Next.js with `withAstryx()` from `@astryxdesign/build`, under webpack or Turbopack, and the `@astryxdesign/build` PostCSS plugin always define all 56, inside `@layer astryx-base`, below theme overrides.',
            'A graph-based source build, such as the `@astryxdesign/build` Vite plugin or a bare StyleX transform, gets the data colors only from a `dataVars` import. StyleX keeps them as one group: when your code imports any `dataVars` key, the build includes all 56, and when it imports none, the build includes none. It does not keep only the keys you use. The Vite plugin puts the group in `@layer astryx-base`.',
            "A bare StyleX transform with no layer wrapper emits the group with no layer. On the document root, that unlayered default beats a theme's data-color override, so content that inherits from the root, such as a portal, shows the default color instead of the theme's.",
          ],
        },
        {
          type: 'prose',
          text: 'For a source build, use the supported setup in {@link generic:styling-overview} and the [`@astryxdesign/build` README](https://github.com/meta/astryx/tree/main/packages/build#readme).',
        },
        {
          type: 'prose',
          text: 'The browser resolves each reference for the current theme and color mode, so the chart follows a theme or mode change with no update code.',
        },
        {
          type: 'list',
          style: 'dont',
          items: [
            'Write a `var(--color-data-*)` string by hand in a graph-based source build. Without a `dataVars` import, that build does not define the variable.',
          ],
        },
      ],
    },
    {
      id: 'use-raw-css-variables',
      title: 'Color SVG charts with raw CSS variables and prebuilt CSS',
      content: [
        {
          type: 'prose',
          text: 'When the app loads prebuilt `@astryxdesign/core/astryx.css`, CSS can read `var(--color-data-*)` with no fallback, because that stylesheet defines all 56 data colors. In any other setup, give each reference an explicit fallback.',
        },
        {
          type: 'code',
          lang: 'css',
          label: 'chart.css: series colors for D3 bars',
          code: `/* The app loads @astryxdesign/core/astryx.css. */
.bar-revenue {
  fill: var(--color-data-categorical-blue);
}
.bar-costs {
  fill: var(--color-data-categorical-orange);
}
.bar-other {
  fill: var(--color-data-categorical-purple);
}`,
        },
        {
          type: 'code',
          lang: 'css',
          label: 'A reference with a fallback, for apps without astryx.css',
          code: `.bar-revenue {
  fill: var(--color-data-categorical-blue, <your fallback color>);
}`,
        },
        {
          type: 'prose',
          text: 'Replace the placeholder with a color of your own, or with the current default from {@link generic:tokens-data}.',
        },
        {
          type: 'code',
          lang: 'ts',
          label: 'D3 bars that use the CSS classes',
          code: `import {select} from 'd3-selection';
import {scaleBand, scaleLinear} from 'd3-scale';

type Row = {
  quarter: string;
  series: 'revenue' | 'costs' | 'other';
  value: number;
};

export function drawQuarterlyBars(svg: SVGSVGElement, rows: Row[]) {
  const width = 480;
  const height = 240;
  const x = scaleBand()
    .domain(['Q1', 'Q2', 'Q3', 'Q4'])
    .range([0, width])
    .padding(0.2);
  const series = scaleBand()
    .domain(['revenue', 'costs', 'other'])
    .range([0, x.bandwidth()]);
  const y = scaleLinear().domain([0, 200]).range([height, 0]);

  select(svg)
    .attr('viewBox', \`0 0 \${width} \${height}\`)
    .attr('role', 'img')
    .attr('aria-label', 'Revenue, costs, and other spending by quarter')
    .selectAll('rect')
    .data(rows)
    .join('rect')
    .attr('class', row => \`bar-\${row.series}\`)
    .attr('x', row => (x(row.quarter) ?? 0) + (series(row.series) ?? 0))
    .attr('width', series.bandwidth())
    .attr('y', row => y(row.value))
    .attr('height', row => height - y(row.value));
}`,
        },
        {
          type: 'prose',
          text: 'Like `dataVars`, these references follow theme and mode changes in the browser. When D3 must compute with a color, for example with `d3-interpolate` or `color()` from `d3-color`, it needs a color string that `d3-color` can parse.',
        },
        {
          type: 'prose',
          text: '[`d3-color`](https://d3js.org/d3-color) reads CSS Color Module Level 3 strings, such as hex, comma-separated `rgb(r, g, b)`, and named colors. It returns `null` for `var(...)` and for newer syntax, such as `oklch(...)` or `rgb(0 90 78)`. A resolved value from `useTheme().token()` keeps the syntax the theme wrote, so check that `color()` does not return `null` before D3 computes with it.',
        },
      ],
    },
    {
      id: 'draw-canvas-with-resolved-colors',
      title: 'Color Canvas charts in light and dark mode',
      content: [
        {
          type: 'prose',
          text: 'In a React component, call `useTheme()` and read each data color with `token()`. It returns the concrete value for the nearest Theme and its color mode. Draw again when that value changes.',
        },
        {
          type: 'code',
          lang: 'tsx',
          label: 'Canvas bars that use resolved colors',
          code: `'use client';

import {useEffect, useRef} from 'react';
import {useTheme} from '@astryxdesign/core/theme';

const revenue = [128, 156, 143, 184];
const target = 150;

export function QuarterlyCanvasChart() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const {token} = useTheme();
  const barColor = token('--color-data-categorical-blue');
  const targetColor = token('--color-data-categorical-purple');

  // Synchronize the canvas bitmap with the resolved colors.
  useEffect(() => {
    const context = canvasRef.current?.getContext('2d');
    if (!context) {
      return;
    }
    context.clearRect(0, 0, 480, 240);
    context.fillStyle = barColor;
    revenue.forEach((value, index) => {
      context.fillRect(40 + index * 110, 240 - value, 60, value);
    });
    context.fillStyle = targetColor;
    context.fillRect(0, 240 - target, 480, 2);
  }, [barColor, targetColor]);

  return (
    <canvas
      ref={canvasRef}
      width={480}
      height={240}
      role="img"
      aria-label="Revenue by quarter: Q1 128, Q2 156, Q3 143, Q4 184. Target 150."
    />
  );
}`,
        },
        {
          type: 'prose',
          text: 'A resolved value is a copy for one theme and one mode. `useTheme()` returns a new `token` function and `tokens` object when the theme or mode changes, so an effect that depends on the colors runs again. A canvas keeps its old pixels until you draw again ([Canvas API](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API)).',
        },
        {
          type: 'prose',
          text: "Resolved values are the theme's root values: the theme's `adaptations` (rules for viewport width, pointer, contrast, or motion) do not change them. Outside React, call `resolveThemeTokens()` with the theme and the mode, and call it again when the mode changes. {@link generic:non-css-processing} shows both resolvers.",
        },
      ],
    },
    {
      id: 'configure-vega-lite',
      title: 'Give configuration-driven renderers resolved colors',
      content: [
        {
          type: 'prose',
          text: 'A configuration-driven renderer takes colors as strings in a config or spec object, where the browser does not resolve CSS variables. Give it resolved values from `useTheme().token()`, as this Vega-Lite example does in `config.range.category`.',
        },
        {
          type: 'prose',
          text: 'How a renderer applies changed colors depends on the library. Vega-Lite reads `config` when it compiles a spec, so the example compiles again and creates a new Vega `View` when the colors change.',
        },
        {
          type: 'code',
          lang: 'tsx',
          label: 'Vega-Lite bars that use resolved colors',
          code: `'use client';

import {useEffect, useMemo, useRef} from 'react';
import {parse, View} from 'vega';
import {compile, type TopLevelSpec} from 'vega-lite';
import {useTheme} from '@astryxdesign/core/theme';

const spec: TopLevelSpec = {
  $schema: 'https://vega.github.io/schema/vega-lite/v6.json',
  description: 'Revenue, costs, and other spending for Q1 and Q2',
  width: 400,
  height: 200,
  data: {
    values: [
      {quarter: 'Q1', series: 'revenue', value: 128},
      {quarter: 'Q1', series: 'costs', value: 82},
      {quarter: 'Q1', series: 'other', value: 40},
      {quarter: 'Q2', series: 'revenue', value: 156},
      {quarter: 'Q2', series: 'costs', value: 94},
      {quarter: 'Q2', series: 'other', value: 52},
    ],
  },
  mark: 'bar',
  encoding: {
    x: {field: 'quarter', type: 'nominal'},
    xOffset: {field: 'series', sort: ['revenue', 'costs', 'other']},
    y: {field: 'value', type: 'quantitative'},
    color: {
      field: 'series',
      type: 'nominal',
      sort: ['revenue', 'costs', 'other'],
    },
  },
};

export function QuarterlyVegaChart() {
  const containerRef = useRef<HTMLDivElement>(null);
  const {token} = useTheme();
  const config = useMemo(
    () => ({
      range: {
        category: [
          token('--color-data-categorical-blue'),
          token('--color-data-categorical-orange'),
          token('--color-data-categorical-purple'),
        ],
      },
    }),
    [token],
  );

  // Synchronize the Vega view with the compiled spec and its colors.
  useEffect(() => {
    if (!containerRef.current) {
      return;
    }
    const view = new View(parse(compile(spec, {config}).spec), {
      container: containerRef.current,
      renderer: 'canvas',
    });
    view.runAsync();
    return () => {
      view.finalize();
    };
  }, [config]);

  return <div ref={containerRef} />;
}`,
        },
        {
          type: 'prose',
          text: "Vega-Lite merges `config` into the Vega spec that [`compile()`](https://vega.github.io/vega-lite/usage/compile.html) returns, and a running `View` has no call to replace it. Call [`view.finalize()`](https://vega.github.io/vega/docs/api/view/#view_finalize) on the old view. A new view starts with new signal values, so restore any zoom or selection your product keeps in Vega signals. As with Canvas, the colors are the theme's root values.",
        },
        {
          type: 'prose',
          text: "The spec's top-level `description` gives the chart its accessible name: Vega sets it as the `aria-label` of the view's container element ([Vega specification](https://vega.github.io/vega/docs/specification/)).",
        },
      ],
    },
  ],
};

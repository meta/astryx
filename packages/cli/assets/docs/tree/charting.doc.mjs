// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `astryx docs cli/visualization/charting`: build theme-aware SVG, Canvas, GPU, exported, and third-party charts.
 */

/** @type {import('@astryxdesign/cli/authoring').ReferenceDoc} */
export const docs = {
  type: 'generic',
  name: 'charting',
  placement: {parent: 'namespace:visualization', slot: 'guides', order: 10},
  title: 'Theme chart components',
  category: 'guide',
  description:
    'Use existing Astryx theme tokens in editable SVG, Canvas, configuration-driven, and GPU charts.',
  keywords: [
    'data visualization',
    'chart theme',
    'chart color picker',
    'SVG chart',
    'Canvas chart',
    'WebGL chart',
    'Recharts',
    'Vega',
  ],
  sections: [
    {
      id: 'start-here',
      title: 'Start with the existing theme APIs',
      content: [
        {
          type: 'prose',
          text: 'Use Astryx’s existing theme tokens to style charts. Keep renderer settings and saved user choices with the chart so each renderer can update predictably.',
        },
        {
          type: 'prose',
          text: 'Use the whole guide when people can customize a chart, save their choices, or show the same chart with more than one renderer, such as Recharts, Vega-Lite, or Canvas.',
        },
        {
          type: 'prose',
          text: 'For a fixed chart with no color controls, use the token and renderer guidance and skip the sections about color pickers and saved choices.',
        },
        {
          type: 'prose',
          text: 'If Astryx is not set up in the app yet, follow the public {@link generic:getting-started} guide for Core, CSS, and build setup. Then run `astryx docs theme` to choose a published or product-owned theme. This chart guide works with whichever active `<Theme>` the app uses. Add the renderer package used by the chart: `npm install recharts` for Recharts, or `npm install vega vega-lite` for Vega-Lite.',
        },
        {
          type: 'prose',
          text: 'Use `astryx docs tokens` to browse token names, `astryx docs icons` to browse semantic icons, and `astryx docs theme` for published themes, custom themes, and server rendering.',
        },
      ],
    },
    {
      id: 'choose-transport',
      title: 'Choose the color format where it is consumed',
      content: [
        {
          type: 'table',
          headers: ['Consumption point', 'Use', 'Theme update'],
          rows: [
            [
              'Verified live DOM or SVG paint with no library parsing',
              'A retained Astryx CSS token reference',
              'Let the CSS cascade repaint the existing node',
            ],
            [
              'Options, color math, Canvas, serialized config, workers, SSR, or export',
              'A concrete color from the active theme resolver',
              'Update the existing options or drawing state and redraw',
            ],
            [
              'GPU uniform or buffer',
              'A product-owned conversion to the channel format the GPU API expects',
              'Update the existing uniform or buffer',
            ],
            [
              'Gradient, pattern, image, or renderer runtime object',
              'A renderer-owned object built locally',
              'Rebuild only that paint resource',
            ],
          ],
        },
        {
          type: 'prose',
          text: 'Do not assume that every SVG renderer accepts CSS variables. Some libraries parse colors in JavaScript before creating SVG. Verify the exact property and renderer path you use.',
        },
      ],
    },
    {
      id: 'map-chart-roles',
      title: 'Map chart roles to existing Astryx tokens',
      content: [
        {
          type: 'table',
          headers: ['Visualization role', 'Astryx source'],
          rows: [
            [
              'Series fill or stroke',
              'Categorical data tokens for named series; sequential, diverging, or heatmap scale tokens for ordered values',
            ],
            [
              'Series identity beyond color',
              'Renderer-owned shapes, patterns, dash styles, or direct labels with a text equivalent',
            ],
            [
              'Plot grid lines',
              '`--color-border` or another verified structural token',
            ],
            [
              'Axis and tick lines',
              '`--color-border-emphasized` or another verified structural token',
            ],
            [
              'Axis, legend, and annotation text',
              'Typography from the active theme and semantic text-color tokens',
            ],
            [
              'Hover-detail or popover surface',
              'Background, border, text, `--radius-element`, and shadow tokens',
            ],
            [
              'Container surface',
              '`--radius-container` when it owns a surface',
            ],
            [
              'Action icons and controls',
              'Astryx `Icon` or `IconButton`, semantic foreground tokens, and established icon sizes',
            ],
            [
              'Spacing around actions, legends, and hover details',
              'Spacing tokens for toolbar, legend, tooltip, and control gaps; renderer-owned plot geometry',
            ],
            ['Focus', 'Focus outline tokens'],
            [
              'Hover or active series',
              'The same series color mixed with `--color-tint-hover`, plus a non-color cue',
            ],
            [
              'Selected, muted, forecast, or disabled series',
              'The same series identity plus a border, pattern, label, marker, or line-style change',
            ],
          ],
        },
        {
          type: 'prose',
          text: 'Use the same public Astryx controls around a chart that you would use elsewhere in the product; do not build chart-specific substitutes. Use `Button` or `IconButton` for commands such as Download or Reset zoom, `Selector` or `SegmentedControl` for one choice such as metric or time range, `MultiSelector` for several filters or visible series, `Switch` for an independent on/off setting, and `Field` for labels, help, and validation around a control. Astryx supplies the control behavior, appearance, and accessibility; connect its value or handler to the chart or renderer state the product owns. Run `astryx component <Name> --dense` for the current API.',
        },
        {
          type: 'code',
          lang: 'tsx',
          code: `import {Icon} from '@astryxdesign/core/Icon';
import {IconButton} from '@astryxdesign/core/IconButton';

type ChartDownloadActionProps = {
  onDownload: () => void;
};

// DownloadGlyph is a product-owned SVG component. The caller owns the export.
export function ChartDownloadAction({onDownload}: ChartDownloadActionProps) {
  return (
    <IconButton
      icon={<Icon icon={DownloadGlyph} />}
      label="Download quarterly performance chart"
      onClick={onDownload}
      tooltip="Download chart"
      variant="ghost"
    />
  );
}`,
        },
        {
          type: 'prose',
          text: 'Use spacing tokens for application chrome around the plot. In StyleX code, import `spacingVars` from `@astryxdesign/core/theme/tokens.stylex`; current names use the numeric step scale such as `--spacing-2`, `--spacing-3`, and `--spacing-4`, not a `100` or `400` scale. Resolve the same verified tokens with `token()` when a non-CSS API needs concrete spacing. Plot margins, tick gaps, hit geometry, and data-density decisions stay local to the renderer. A compact treatment still needs readable labels and usable pointer and touch targets.',
        },
        {
          type: 'prose',
          text: 'Do not rely on color alone to tell series or states apart. Give each one another recognizable cue, such as a direct label, marker shape, line style, pattern, or border, and repeat that cue wherever the series appears: in the plotted mark, legend, tooltip or direct label, and export. A legend symbol does not help identify the plotted marks unless those marks use the same symbol.',
        },
        {
          type: 'prose',
          text: 'For Canvas or exported output, draw renderer-owned icon paths or images with concrete resolved colors. Do not serialize React icon components or document-dependent CSS references.',
        },
        {
          type: 'prose',
          text: 'Keep data, scales, interactions, events, and renderer compatibility in the chart component. Use Astryx tokens for visual roles instead of inventing library-named tokens such as `--recharts-grid-color`.',
        },
      ],
    },
    {
      id: 'store-product-owned-intent',
      title: 'Save color choices in your chart',
      content: [
        {
          type: 'table',
          headers: ['Choice', 'What to save', 'Response to mode changes'],
          rows: [
            [
              'Automatic (use chart default)',
              'Save no manual color override',
              'The chart uses the product default from the active theme',
            ],
            [
              'Astryx color token',
              'Save the product’s stable token choice',
              'The resolved color follows the active theme and mode',
            ],
            [
              'Custom color',
              'Save a validated portable color owned by the product',
              'The exact color stays fixed until the person changes it',
            ],
          ],
        },
        {
          type: 'prose',
          text: 'Reset deletes the manual choice and returns control to the chart default. Choose a saved shape that fits your product, validate it before use, and show a clear recovery message when saved input is invalid.',
        },
        {
          type: 'code',
          lang: 'ts',
          code: `// Illustrative product state, not an Astryx public type.
type ProductSeriesColor =
  | {kind: 'theme'; token: string}
  | {kind: 'custom'; color: string};

type StoredSeries = {
  id: string;
  color?: ProductSeriesColor; // absent means Automatic
};

function resetSeriesColor(series: StoredSeries): StoredSeries {
  const {color: _removed, ...automatic} = series;
  return automatic;
}`,
        },
        {
          type: 'prose',
          text: 'Astryx does not define a persisted color format. If your product accepts custom colors, choose and document a JSON-safe format. For example, a product could accept normalized opaque six-digit sRGB hex (`#RRGGBB`). Supporting alpha, named colors, functional syntax, or wider color spaces is a product decision.',
        },
        {
          type: 'prose',
          text: 'Validate saved settings before using them. Allow only token IDs offered by the picker, reject invalid custom colors, and return an affected series to Automatic with a clear message instead of passing an invalid string to CSS, Canvas, or the renderer.',
        },
      ],
    },
    {
      id: 'build-product-picker',
      title: 'Build a theme-color picker',
      content: [
        {
          type: 'prose',
          text: 'Curate a small set of chart-safe categorical tokens for the product. Keep the token name as the product’s stable identity and resolve a fresh preview from the active theme. Do not expose every general UI color or raw generated palette stop by default.',
        },
        {
          type: 'code',
          lang: 'tsx',
          code: `'use client';

import {useMemo} from 'react';
import {useTheme} from '@astryxdesign/core/theme';

const productChartColors = [
  '--color-data-categorical-blue',
  '--color-data-categorical-orange',
  '--color-data-categorical-purple',
  '--color-data-categorical-green',
] as const;

export function useProductChartColorOptions() {
  const {token} = useTheme();
  return useMemo(
    () =>
      productChartColors.map(id => ({
        id,
        preview: token(id),
      })),
    [token],
  );
}`,
        },
        {
          type: 'prose',
          text: 'The product supplies visible labels, accessible names, grouping, search terms, custom-color validation, and picker layout. A generated palette remains theme-authoring material: map selected values to stable data tokens when defining the theme instead of inspecting raw palette stops at runtime.',
        },
      ],
    },
    {
      id: 'use-direct-css-paint',
      title: 'Use CSS token references only for direct paint',
      content: [
        {
          type: 'prose',
          text: 'For a verified live DOM or SVG paint property, import `dataVars` and pass the value directly only when the referenced variable is available from the app’s compiled StyleX data group, an explicitly authored value in the active built theme, or an explicit local fallback. When the app’s StyleX build compiles the import, it retains the complete atomic data-variable group once for the app; it does not create a stylesheet for every chart. The prebuilt `astryx.css` does not declare the canonical data-color group, and a built theme supplies only the data colors it explicitly authors. In an app that uses only prebuilt CSS, verify that the built theme authors the selected color; otherwise pass the concrete value from `useTheme().token()` or provide a local fallback.',
        },
        {
          type: 'code',
          lang: 'tsx',
          code: `import {dataVars} from '@astryxdesign/core/theme/dataTokens.stylex';

export function SeriesMark() {
  return (
    <circle
      cx={12}
      cy={12}
      r={8}
      fill={dataVars['--color-data-categorical-blue']}
    />
  );
}`,
        },
        {
          type: 'prose',
          text: 'Do not construct `var(--color-data-*)` strings by hand. Importing the published token maps keeps the reference tied to Astryx’s public token names and lets CSS repaint it when the active theme changes.',
        },
      ],
    },
    {
      id: 'resolve-concrete-values',
      title: 'Resolve concrete values for Canvas and configuration APIs',
      content: [
        {
          type: 'code',
          lang: 'tsx',
          code: `'use client';

import {useEffect, useRef} from 'react';
import {useTheme} from '@astryxdesign/core/theme';

function cssLengthToPixels(value: string): number {
  const probe = document.createElement('div');
  probe.style.blockSize = '0';
  probe.style.inlineSize = value;
  probe.style.position = 'fixed';
  probe.style.visibility = 'hidden';
  if (!probe.style.inlineSize) return 0;
  document.body.appendChild(probe);
  const pixels = probe.getBoundingClientRect().width;
  probe.remove();
  return Number.isFinite(pixels) ? pixels : 0;
}

export function CanvasSeries() {
  const ref = useRef<HTMLCanvasElement>(null);
  const {token} = useTheme();
  const color = token('--color-data-categorical-blue');
  const fontFamily = token('--font-family-body');
  const fontSize = token('--text-supporting-size');
  const radius = token('--radius-element');

  useEffect(() => {
    const context = ref.current?.getContext('2d');
    if (!context) return;
    const radiusPixels = cssLengthToPixels(radius);
    context.clearRect(0, 0, 320, 160);
    context.fillStyle = color;
    context.beginPath();
    context.roundRect(32, 32, 64, 112, [
      radiusPixels,
      radiusPixels,
      0,
      0,
    ]);
    context.fill();
    context.fillStyle = token('--color-text-secondary');
    context.font = \`\${fontSize} \${fontFamily}\`;
    context.fillText('Q1', 48, 152);
  }, [color, fontFamily, fontSize, radius, token]);

  return <canvas ref={ref} width={320} height={160} />;
}`,
        },
        {
          type: 'prose',
          text: 'Resolved values can still include a unit such as `rem`. Preserve the token string when an API accepts CSS syntax, as `context.font` does. When an API requires numeric pixels, convert supported units deliberately; `Number.parseFloat` alone is not safe for `rem`, `em`, percentages, or calculated lengths.',
        },
        {
          type: 'prose',
          text: 'Choose one coherent accessibility path for Canvas. A concise chart may use `role="img"` with an accessible name and description. If a complete adjacent table or text summary is the primary alternative, the Canvas may be `aria-hidden="true"`; label the surrounding figure and keep the alternative in the accessibility tree. Do not attach ARIA descriptions to an `aria-hidden` Canvas.',
        },
      ],
    },
    {
      id: 'resolve-outside-react',
      title: 'Resolve outside React and during export',
      content: [
        {
          type: 'code',
          lang: 'ts',
          code: `import {resolveThemeTokens} from '@astryxdesign/core/theme/tokens';
import {productTheme} from './productTheme';

const tokens = resolveThemeTokens(productTheme, {mode: 'dark'});
const exportConfig = {
  fill: tokens['--color-data-categorical-blue'],
  textColor: tokens['--color-text-primary'],
};

JSON.stringify(exportConfig);`,
        },
        {
          type: 'prose',
          text: 'Server rendering and export require an explicit theme and light or dark mode. Do not infer a client’s system preference. A worker should receive only the concrete values it uses. When the product changes theme or mode, send a fresh payload; do not send hooks, document-dependent CSS references, callbacks, or the full theme object.',
        },
        {
          type: 'prose',
          text: 'Define an export’s logical dimensions, pixel ratio, background transparency, format, filename, locale, and mode explicitly. Paint the background when the file must be opaque, and verify that patterns, labels, borders, and typography survive the exported output.',
        },
      ],
    },
    {
      id: 'apply-to-recharts',
      title: 'Apply the direct-paint path to Recharts',
      content: [
        {
          type: 'prose',
          text: 'Recharts passes the demonstrated bar, grid, axis, tooltip, and legend text values to live SVG or HTML properties. Use `dataVars` for those verified properties when each referenced data color is available from the app’s compiled StyleX data group, an explicitly authored value in the active built theme, or an explicit local fallback. An app that uses only prebuilt `astryx.css` plus a built theme should not assume every data variable exists: for a color the built theme does not explicitly author, pass the concrete `useTheme().token()` value instead or provide a local fallback. This example does not imply that every Recharts prop or future release accepts CSS references.',
        },
        {
          type: 'code',
          lang: 'tsx',
          code: `'use client';

import {useLayoutEffect, useState} from 'react';
import {useTheme} from '@astryxdesign/core/theme';
import {dataVars} from '@astryxdesign/core/theme/dataTokens.stylex';
import {
  colorVars,
  radiusVars,
  shadowVars,
  typographyVars,
  typeScaleVars,
} from '@astryxdesign/core/theme/tokens.stylex';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

function cssLengthToPixels(value: string): number {
  if (typeof document === 'undefined' || !document.body) return 0;
  const probe = document.createElement('div');
  probe.style.blockSize = '0';
  probe.style.inlineSize = value;
  probe.style.pointerEvents = 'none';
  probe.style.position = 'fixed';
  probe.style.visibility = 'hidden';
  if (!probe.style.inlineSize) return 0;
  document.body.appendChild(probe);
  const pixels = probe.getBoundingClientRect().width;
  probe.remove();
  return Number.isFinite(pixels) ? pixels : 0;
}

function useCssLengthInPixels(value: string): number {
  const [pixels, setPixels] = useState(0);
  useLayoutEffect(() => setPixels(cssLengthToPixels(value)), [value]);
  return pixels;
}

type RevenueDatum = {
  quarter: string;
  revenue: number;
};

type RevenueChartProps = {
  data: RevenueDatum[];
};

const revenueColor = dataVars['--color-data-categorical-blue'];
const revenueHover =
  'color-mix(in srgb, ' +
  revenueColor +
  ' 85%, ' +
  colorVars['--color-tint-hover'] +
  ')';

export function RevenueChart({data}: RevenueChartProps) {
  const {token} = useTheme();
  const barRadius = useCssLengthInPixels(token('--radius-element'));
  const tick = {
    fill: colorVars['--color-text-secondary'],
    fontFamily: typographyVars['--font-family-body'],
    fontSize: typeScaleVars['--text-supporting-size'],
  };

  return (
    <div style={{height: 320, width: '100%'}}>
      <ResponsiveContainer>
        <BarChart
          accessibilityLayer
          data={data}
          desc="Quarterly revenue"
          title="Quarterly performance">
          <CartesianGrid stroke={colorVars['--color-border']} />
          <XAxis
            axisLine={{stroke: colorVars['--color-border-emphasized']}}
            dataKey="quarter"
            tick={tick}
            tickLine={{stroke: colorVars['--color-border-emphasized']}}
          />
          <YAxis
            axisLine={{stroke: colorVars['--color-border-emphasized']}}
            tick={tick}
            tickLine={{stroke: colorVars['--color-border-emphasized']}}
          />
          <Tooltip
            contentStyle={{
              background: colorVars['--color-background-card'],
              borderColor: colorVars['--color-border'],
              borderRadius: radiusVars['--radius-element'],
              boxShadow: shadowVars['--shadow-med'],
              color: colorVars['--color-text-primary'],
            }}
            itemStyle={{color: colorVars['--color-text-primary']}}
            cursor={{
              fill: colorVars['--color-tint-hover'],
              fillOpacity: 0.05,
            }}
          />
          <Legend
            formatter={value => (
              <span style={{color: colorVars['--color-text-secondary']}}>
                {value}
              </span>
            )}
            wrapperStyle={{
              fontFamily: typographyVars['--font-family-body'],
              fontSize: typeScaleVars['--text-supporting-size'],
            }}
          />
          <Bar
            activeBar={{fill: revenueHover}}
            dataKey="revenue"
            fill={revenueColor}
            isAnimationActive={false}
            radius={[barRadius, barRadius, 0, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}`,
        },
        {
          type: 'prose',
          text: "`ResponsiveContainer` needs a parent with a definite height. Keep that height and chart margins renderer-owned; use Astryx spacing tokens only for chrome around the plot. Use `radiusVars['--radius-element']` for CSS-valued tooltip radius. Recharts bar radius needs a number, so this example resolves the active theme’s radius and measures the CSS length before paint instead of hardcoding a renderer-specific value. The active state changes the series fill without adding a heavy outline; add a border only when it carries necessary non-color meaning, and use an appropriate semantic border role rather than a text color. This fixed example disables series animation; if motion communicates meaningful change, connect it to the product’s reduced-motion handling.",
        },
        {
          type: 'prose',
          text: 'The default Recharts legend mainly mirrors series color. When a pattern, marker shape, or dash style carries series identity, pass a renderer through `Legend.content` and draw the same cue in each legend key. For example, a line chart can use a solid Revenue line and a dashed Costs line in both places:',
        },
        {
          type: 'code',
          lang: 'tsx',
          code: `import {dataVars} from '@astryxdesign/core/theme/dataTokens.stylex';
import {Legend, Line} from 'recharts';

const lineSeries = [
  {key: 'revenue', label: 'Revenue', color: dataVars['--color-data-categorical-blue'], dash: undefined},
  {key: 'costs', label: 'Costs', color: dataVars['--color-data-categorical-orange'], dash: '6 4'},
] as const;

function SeriesLegend() {
  return (
    <ul aria-label="Chart series">
      {lineSeries.map(series => (
        <li key={series.key}>
          <svg aria-hidden="true" width="24" height="12">
            <line
              x1="0" x2="24" y1="6" y2="6"
              stroke={series.color}
              strokeDasharray={series.dash}
              strokeWidth="2"
            />
          </svg>
          {series.label}
        </li>
      ))}
    </ul>
  );
}

<Legend content={() => <SeriesLegend />} />
{lineSeries.map(series => (
  <Line
    key={series.key}
    dataKey={series.key}
    name={series.label}
    stroke={series.color}
    strokeDasharray={series.dash}
  />
))}`,
        },
        {
          type: 'prose',
          text: 'Set `Tooltip.cursor` explicitly. Recharts otherwise paints its own opaque gray category band; using the Astryx hover tint at low opacity matches the subtle overlay used by Astryx surfaces. If a tooltip also identifies series, use a custom `Tooltip.content` renderer to repeat the cue there; `contentStyle` changes only the default tooltip surface. Keep SVG pattern IDs unique across the whole document: `url(#id)` resolves document-wide, so derive pattern IDs per chart instance with React’s `useId`.',
        },
        {
          type: 'prose',
          text: 'SVG tick text uses `fill`; HTML legend and tooltip text use `color`. Keep separate style objects instead of reusing an HTML text style for axis ticks.',
        },
        {
          type: 'prose',
          text: '`accessibilityLayer`, `title`, and `desc` improve the chart’s keyboard and descriptive surface, but they do not automatically expose every data value or interaction. If people need exact values, provide a visible table or concise text summary, or another tested equivalent. Avoid repeating the same long description in both the chart and its alternative.',
        },
        {
          type: 'prose',
          text: 'For a visible exact-value alternative, use the public Astryx `Table` component or a semantic HTML table. Run `astryx component Table --dense` for the current columns and cell-rendering API.',
        },
      ],
    },
    {
      id: 'apply-to-vega',
      title: 'Apply the concrete-value path to Vega-Lite',
      content: [
        {
          type: 'prose',
          text: 'Configuration-driven renderers need concrete, serializable values rather than retained CSS references. Build a Vega-Lite configuration from the active resolver and pass it through the configuration option owned by your Vega integration.',
        },
        {
          type: 'code',
          lang: 'tsx',
          code: `'use client';

import {useMemo} from 'react';
import {useTheme} from '@astryxdesign/core/theme';
import type {Config} from 'vega-lite';

export function useVegaLiteThemeConfig(): Config {
  const {token} = useTheme();
  return useMemo(
    () => ({
      background: token('--color-background-card'),
      axis: {
        domainColor: token('--color-border-emphasized'),
        gridColor: token('--color-border'),
        labelColor: token('--color-text-secondary'),
        labelFont: token('--font-family-body'),
        titleColor: token('--color-text-primary'),
        titleFont: token('--font-family-heading'),
      },
      legend: {
        labelColor: token('--color-text-secondary'),
        labelFont: token('--font-family-body'),
        titleColor: token('--color-text-primary'),
        titleFont: token('--font-family-heading'),
      },
      range: {
        category: [
          token('--color-data-categorical-blue'),
          token('--color-data-categorical-orange'),
          token('--color-data-categorical-purple'),
          token('--color-data-categorical-green'),
        ],
      },
      title: {
        color: token('--color-text-primary'),
        font: token('--font-family-heading'),
      },
      view: {stroke: null},
    }),
    [token],
  );
}`,
        },
        {
          type: 'prose',
          text: 'The returned object is concrete and JSON-safe. Supply it to Vega-Lite compilation through your integration’s config option; do not also duplicate the same values inside the spec. Product-specific mark radii, tooltips, data updates, and interaction state remain local to that integration.',
        },
        {
          type: 'prose',
          text: "`token` follows the nearest Astryx `Theme`; import the provider with `import {Theme} from '@astryxdesign/core/theme';`. To switch modes on the same page, keep `mode` in product state and update `<Theme theme={productTheme} mode={mode}>`. Keep the chart at the same component position instead of keying it by mode.",
        },
        {
          type: 'prose',
          text: 'Compile the final Vega-Lite spec and inspect its warnings and emitted legend/order behavior. Encodings of the same field can merge: for example, adding an opacity encoding with `legend: null` can suppress the color legend too, and conflicting sort declarations can discard a requested series order. Keep one intentional series legend, set a consistent domain/order, and verify the compiled result instead of assuming the source config wins.',
        },
        {
          type: 'prose',
          text: 'A Vega-Lite tooltip encoding defines tooltip data, not themed HTML tooltip chrome. If the product supplies an HTML tooltip, style its surface with Astryx background, border, text, radius, typography, spacing, and shadow tokens.',
        },
        {
          type: 'prose',
          text: 'For live data in a Vega View, call `view.data(name, tuples)` and then `view.runAsync()`. Whether a React data prop updates an existing View or creates a new one depends on the integration you choose; verify that lifecycle rather than assuming it.',
        },
        {
          type: 'prose',
          text: 'Treat Vega and Vega-Lite specs as executable input: expressions can run and data entries can load URLs. Pass only specs the product authors or reviews. For untrusted specs, use Vega’s public [expression interpreter](https://github.com/vega/vega/tree/main/packages/vega-interpreter) and [loader](https://github.com/vega/vega/tree/main/packages/vega-loader) packages to avoid generated functions and restrict external loading.',
        },
        {
          type: 'prose',
          text: 'Changing a concrete configuration may rebuild the renderer and reset focus, selection, zoom, hover, tooltip, animation, or signal state. Keep product-owned state outside the renderer and restore supported state after a rebuild, or clearly document the reset.',
        },
      ],
    },
    {
      id: 'update-existing-renderers',
      title: 'Update existing renderer instances on theme changes',
      content: [
        {
          type: 'prose',
          text: '`useTheme().mode` reports the effective light or dark mode, while the owning `<Theme mode={mode}>` provider controls it. Keep one source of truth; do not add a second chart-only mode prop that can drift from the provider.',
        },
        {
          type: 'prose',
          text: 'Keep the chart in the same component position and update its existing props, options, Canvas state, signals, uniforms, or buffers. Do not key the chart by theme or mode only to force a remount.',
        },
        {
          type: 'prose',
          text: 'Some wrappers rebuild when a concrete configuration object changes. Rebuilding can reset focus, selection, zoom, hover, tooltip, animation, and renderer resources. Restore supported state or document that limitation instead of describing the switch as seamless.',
        },
      ],
    },
    {
      id: 'verify-integration',
      title: 'Verify your chart integration',
      content: [
        {
          type: 'prose',
          text: 'Forced-colors handling differs by renderer. Browsers may replace DOM and SVG paints, but Canvas and GPU pixels are not reliably remapped. Test each renderer separately. Preserve meaning with labels, patterns, line styles, borders, and text alternatives whether paints are remapped or not. If the product redraws Canvas for forced colors, resolve the chosen system-derived colors to concrete values before drawing or export.',
        },
        {
          type: 'list',
          style: 'unordered',
          items: [
            'Render light mode, dark mode, at least one custom theme, and supported high-contrast or forced-colors modes.',
            'Change the theme or mode without remounting the renderer when it supports live updates.',
            'Verify chart defaults, manual theme colors, custom colors, invalid stored input, and Reset separately when your product exposes those choices.',
            'Make the chart understandable without relying on color alone; check marker shapes, line styles, patterns, labels, and borders in grayscale and exported output.',
            'Check text and marks against the background where they actually appear.',
            'Give every icon-only control an accessible name and keep its pointer and touch target usable at supported densities.',
            'Exercise supported viewport sizes and density settings without clipping labels, legends, tooltips, or controls.',
            'Test left-to-right and right-to-left layouts, long labels, and representative localized number and date formats.',
            'Render loading, empty, error, and unavailable-data states outside the plotted data marks.',
            'Keep hover information available to keyboard and touch users.',
            'Provide a readable table or text summary when the visual chart cannot communicate the data by itself.',
            'Respect reduced-motion preferences and do not use animation as the only explanation of change.',
          ],
        },
      ],
    },
  ],
};

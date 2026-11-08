// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */

export const docs = {
  name: 'Chart',
  displayName: 'Chart',
  group: 'Charts',
  category: 'Data Visualization',
  keywords: [
    'chart',
    'graph',
    'plot',
    'visualization',
    'bar chart',
    'line chart',
    'data',
  ],

  usage: {
    description:
      'Chart lays out one or more mark definitions against shared responsive x and y scales. Use it for data visualizations that combine Astryx chart marks, axes, grids, legends, tooltips, and custom interaction layers.',
    bestPractices: [
      {
        guidance: true,
        description:
          'Give the chart a concise title that states what is measured, and use subtitle for the comparison, time range, or other context needed to interpret it.',
      },
      {
        guidance: true,
        description:
          'Use the same series array for Chart and any directly composed ChartTooltip so labels, colors, and resolved points stay aligned.',
      },
      {
        guidance: false,
        description:
          'Use color as the only way to distinguish series or communicate status. Pair color with labels, mark shapes, direct annotations, or another visible cue.',
      },
      {
        guidance: false,
        description:
          'Reuse one mark definition object across multiple Chart instances. Mark definitions currently carry per-chart layout metadata and are single-use.',
      },
    ],
    accessibility: [
      {
        name: 'Accessible chart name',
        category: 'Semantics',
        criterion: '1.1.1 Non-text Content',
        requirement: 'Required',
        states: ['All'],
        description:
          'Provide title when a product-specific name is available. Without it, Chart derives a localized name from the primary series labels and xKey.',
      },
      {
        name: 'Small-data table',
        category: 'Content',
        criterion: '1.1.1 Non-text Content',
        requirement: 'Required for supported small datasets',
        states: ['1–100 row × series cells'],
        description:
          'Chart mirrors small datasets into a visually hidden table. For larger datasets, provide an equivalent nearby summary or data view because the built-in table is intentionally omitted.',
      },
      {
        name: 'Meaningful chart graphics',
        category: 'Color contrast',
        criterion: '1.4.11 Non-text Contrast',
        requirement: '3:1 when the graphic carries information',
        states: ['Light', 'Dark', 'Supported themes'],
        description:
          'Measure meaningful marks and state indicators against their rendered backdrop. Decorative grid lines are not required to meet the non-text threshold.',
      },
      {
        name: 'Tooltip information',
        category: 'Keyboard',
        criterion: '2.1.1 Keyboard and 2.5.1 Pointer Gestures',
        requirement: 'Supplemental only',
        states: ['Tooltip enabled'],
        description:
          'Do not make hover-only tooltip content the only way to obtain important values. Keep the hidden table or another equivalent data view available.',
      },
    ],
    anatomy: [
      {
        name: 'Header',
        required: false,
        description:
          'Optional visible title and supporting subtitle above the plot.',
      },
      {
        name: 'Plot',
        required: true,
        description:
          'Responsive SVG coordinate space containing the clipped series marks.',
      },
      {
        name: 'Grid and axes',
        required: false,
        description:
          'Caller-supplied ChartGrid and ChartAxis elements that share the plot scales.',
      },
      {
        name: 'Legend',
        required: false,
        description:
          'Derived or caller-supplied series labels and swatches placed above, below, at the start, or at the end of the plot.',
      },
      {
        name: 'Tooltip and interactions',
        required: false,
        description:
          'Pointer-driven overlays that consume the chart interaction stream.',
      },
      {
        name: 'Data table',
        required: false,
        description:
          'Visually hidden tabular alternative rendered for small datasets.',
      },
    ],
  },

  props: [
    {
      name: 'data',
      type: 'Record<string, unknown>[]',
      description:
        'Rows to visualize. Each row may contain the x field and one or more series fields.',
      required: true,
    },
    {
      name: 'xKey',
      type: 'string',
      description: 'Field name read from each data row for the shared x scale.',
      required: true,
    },
    {
      name: 'series',
      type: 'SeriesDef[]',
      description:
        'Mark definitions created by helpers such as bar(), line(), area(), or dot(). Build a fresh array for each Chart.',
      required: true,
    },
    {
      name: 'height',
      type: 'number',
      description: 'Chart height in CSS pixels.',
      default: '300',
    },
    {
      name: 'margin',
      type: 'Partial<ChartMargin>',
      description:
        'Plot inset overrides in CSS pixels for top, right, bottom, and left.',
      default: '{top: 24, right: 24, bottom: 32, left: 48}',
    },
    {
      name: 'yBaseline',
      type: "'auto' | 'zero' | 'data'",
      description:
        'How Chart derives the y-domain when yDomain is omitted: mark-aware zero/headroom, symmetric around zero, or tight to the data extent.',
      default: "'auto'",
    },
    {
      name: 'yDomain',
      type: '[number, number]',
      description:
        'Explicit y-domain. When set, it takes precedence over yBaseline, automatic headroom, and scale nicening.',
    },
    {
      name: 'xDomain',
      type: '[number, number]',
      description:
        'Explicit x-domain for numeric scales, including an empty streaming window. Categorical scales ignore it.',
    },
    {
      name: 'grid',
      type: 'ReactNode',
      description:
        'Grid content rendered behind the series, normally ChartGrid.',
      slotElements: [{__element: 'ChartGrid', props: {horizontal: true}}],
    },
    {
      name: 'axes',
      type: 'ReactNode',
      description:
        'Axis content rendered after the series, normally one or more ChartAxis elements.',
      slotElements: [
        {__element: 'ChartAxis', props: {position: 'bottom'}},
        {__element: 'ChartAxis', props: {position: 'left'}},
      ],
    },
    {
      name: 'legend',
      type: 'boolean | ChartLegendProps',
      description:
        'Set true for a derived bottom legend, or pass items, position, and alignment.',
      default: 'false',
    },
    {
      name: 'tooltip',
      type: "boolean | Omit<ChartTooltipProps, 'series'>",
      description:
        'Set true for the grouped pointer tooltip, or pass render and presentation options.',
      default: 'false',
    },
    {
      name: 'interactions',
      type: 'ReactNode',
      description:
        'Interaction overlays rendered above the pointer-capture layer.',
    },
    {
      name: 'children',
      type: 'ReactNode',
      description:
        'Additional SVG content rendered after the built-in tooltip for advanced composition.',
    },
    {
      name: 'title',
      type: 'string',
      description:
        'Visible heading and accessible name for the chart image. A localized fallback is derived when omitted.',
    },
    {
      name: 'subtitle',
      type: 'string',
      description:
        'Visible supporting text that also describes the chart image.',
    },
    {
      name: 'ref',
      type: 'Ref<HTMLDivElement>',
      description: 'Ref forwarded to the root chart container.',
    },
    {
      name: 'xstyle',
      type: 'StyleXStyles',
      description:
        'StyleX styles for layout customization (margins, positioning, sizing). Must be a stylex.create() value, not an inline style object like style={{}}.',
    },
    {
      name: 'className',
      type: 'string',
      description: 'CSS class name appended to the root chart container.',
    },
    {
      name: 'style',
      type: 'CSSProperties',
      description:
        'Inline styles merged onto the root chart container after the component styles.',
    },
  ],

  examples: [
    {
      label: 'Bar and trend line',
      code: `import {Chart, ChartAxis, ChartGrid, bar, line} from '@astryxdesign/charts';

const series = [
  bar('revenue', {label: 'Revenue'}),
  line('trend', {label: 'Trend'}),
];

<Chart
  data={monthlyRevenue}
  xKey="month"
  series={series}
  title="Monthly revenue"
  grid={<ChartGrid horizontal />}
  axes={
    <>
      <ChartAxis position="bottom" />
      <ChartAxis position="left" />
    </>
  }
  legend
  tooltip
/>;`,
    },
    {
      label: 'Stable numeric window',
      code: `<Chart
  data={streamedValues}
  xKey="timestamp"
  series={[line('value')]}
  xDomain={[windowStart, windowEnd]}
  yDomain={[0, 100]}
  title="Live utilization"
/>;`,
    },
  ],
};

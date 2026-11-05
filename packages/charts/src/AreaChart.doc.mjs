// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */

export const docs = {
  name: 'AreaChart',
  displayName: 'AreaChart',
  group: 'Charts',
  category: 'Data Visualization',
  keywords: [
    'area chart',
    'chart',
    'graph',
    'stacked',
    'trend',
    'visualization',
  ],

  usage: {
    description:
      'AreaChart is a ready-to-use area chart: one filled series per y field over a shared x field, with axes, a grid, a legend, and a grouped hover tooltip. Use it for part-to-whole trends and cumulative totals instead of hand-rolling Chart plus area marks.',
    bestPractices: [
      {
        guidance: true,
        description:
          'Pass one y key per measured series and a labels map so the legend and tooltip read as product language, not field names.',
      },
      {
        guidance: true,
        description:
          'Turn on stacked only when the series sum to a meaningful total; overlapping areas compare independent magnitudes.',
      },
      {
        guidance: false,
        description:
          'Stack more than a handful of series. Stacked areas past four or five bands are hard to read — prefer a LineChart.',
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
          'Provide title when a product-specific name is available. Without it, AreaChart derives a localized name from the series labels and xKey.',
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
          'Responsive SVG coordinate space containing the area fills and strokes.',
      },
      {
        name: 'Grid and axes',
        required: true,
        description:
          'Built-in horizontal grid with bottom and left axes sharing the plot scales.',
      },
      {
        name: 'Legend',
        required: false,
        description:
          'Derived series labels shown when more than one y key is given.',
      },
      {
        name: 'Tooltip',
        required: false,
        description:
          'Grouped pointer tooltip enabled by default; set tooltip to false to hide it.',
      },
    ],
  },

  props: [
    {
      name: 'data',
      type: 'Record<string, unknown>[]',
      description:
        'Rows to visualize. Each row holds the x field and one value per y key.',
      required: true,
    },
    {
      name: 'xKey',
      type: 'string',
      description: 'Field name read from each data row for the shared x scale.',
      required: true,
    },
    {
      name: 'yKeys',
      type: 'string | string[]',
      description:
        'Value fields, one area series each. Pass a single string for one series.',
      required: true,
    },
    {
      name: 'labels',
      type: 'Record<string, string>',
      description:
        'Human-readable series labels, keyed by y field. Falls back to the key.',
    },
    {
      name: 'colors',
      type: '(string | undefined)[]',
      description:
        'Static series colors, one per y key. Omitted entries use the theme palette.',
    },
    {
      name: 'stacked',
      type: 'boolean',
      description: 'Stack the areas instead of overlaying them.',
      default: 'false',
    },
    {
      name: 'curve',
      type: "'linear' | 'monotone' | 'natural' | 'step'",
      description: 'Line interpolation between points.',
      default: "'monotone'",
    },
    {
      name: 'gradient',
      type: 'boolean',
      description: 'Fade the fill toward the baseline.',
      default: 'false',
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
    },
    {
      name: 'yBaseline',
      type: "'auto' | 'zero' | 'data'",
      description:
        'How the y-domain is derived when yDomain is omitted.',
      default: "'auto'",
    },
    {
      name: 'yDomain',
      type: '[number, number]',
      description:
        'Explicit y-domain. When set, it takes precedence over yBaseline.',
    },
    {
      name: 'xDomain',
      type: '[number, number]',
      description:
        'Explicit x-domain for numeric scales, including an empty streaming window.',
    },
    {
      name: 'legend',
      type: 'boolean | ChartLegendProps',
      description:
        'Set false to hide the derived legend, or pass position and alignment.',
      default: 'true when more than one series',
    },
    {
      name: 'tooltip',
      type: "boolean | Omit<ChartTooltipProps, 'series'>",
      description:
        'Set false to hide the grouped pointer tooltip, or pass render and presentation options.',
      default: 'true',
    },
    {
      name: 'title',
      type: 'string',
      description:
        'Visible heading and accessible name for the chart image.',
    },
    {
      name: 'subtitle',
      type: 'string',
      description:
        'Visible supporting text that also describes the chart image.',
    },
    {
      name: 'children',
      type: 'ReactNode',
      description:
        'Additional SVG content rendered after the built-in tooltip.',
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
      label: 'Single series',
      code: `import {AreaChart} from '@astryxdesign/charts';

<AreaChart
  data={monthlyRevenue}
  xKey="month"
  yKeys={['revenue']}
  title="Monthly revenue"
/>;`,
    },
    {
      label: 'Stacked series',
      code: `<AreaChart
  data={channelTotals}
  xKey="month"
  yKeys={['organic', 'paid', 'referral']}
  stacked
  gradient
  title="Signups by channel"
/>;`,
    },
  ],
};

// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */

export const docs = {
  name: 'LineChart',
  displayName: 'LineChart',
  group: 'Charts',
  category: 'Data Visualization',
  keywords: [
    'line chart',
    'chart',
    'graph',
    'trend',
    'timeseries',
    'visualization',
  ],

  usage: {
    description:
      'LineChart is a ready-to-use line chart: one line series per y field over a shared x field, with axes, a grid, a legend, and a grouped hover tooltip. Use it for trends and comparisons instead of hand-rolling Chart plus line marks.',
    bestPractices: [
      {
        guidance: true,
        description:
          'Pass one y key per measured series and a labels map so the legend and tooltip read as product language, not field names.',
      },
      {
        guidance: true,
        description:
          'Enable dots when individual readings matter (sparse or irregular samples); leave them off for dense continuous series.',
      },
      {
        guidance: false,
        description:
          'Use color as the only way to distinguish series. Pair color with labels and, where it helps, direct annotations.',
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
          'Provide title when a product-specific name is available. Without it, LineChart derives a localized name from the series labels and xKey.',
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
          'Responsive SVG coordinate space containing the line strokes and optional dots.',
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
        'Value fields, one line series each. Pass a single string for one series.',
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
      name: 'curve',
      type: "'linear' | 'monotone' | 'natural' | 'step'",
      description: 'Line interpolation between points.',
      default: "'monotone'",
    },
    {
      name: 'strokeWidth',
      type: 'number',
      description: 'Stroke width in CSS pixels.',
      default: '2',
    },
    {
      name: 'dots',
      type: 'boolean',
      description: 'Draw a dot at each data point.',
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
      label: 'Trend with dots',
      code: `import {LineChart} from '@astryxdesign/charts';

<LineChart
  data={weeklyActive}
  xKey="week"
  yKeys={['active']}
  dots
  title="Weekly active users"
/>;`,
    },
    {
      label: 'Multiple series',
      code: `<LineChart
  data={planComparison}
  xKey="month"
  yKeys={['actual', 'planned']}
  labels={{actual: 'Actual', planned: 'Planned'}}
  title="Actual vs planned"
/>;`,
    },
  ],
};

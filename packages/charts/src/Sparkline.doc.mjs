// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */

export const docs = {
  name: 'Sparkline',
  displayName: 'Sparkline',
  group: 'Charts',
  category: 'Data Visualization',
  keywords: [
    'sparkline',
    'mini chart',
    'trend',
    'inline chart',
    'kpi',
  ],

  usage: {
    description:
      'Sparkline is a compact label-free trend graphic for tables, metric tiles, and list rows. It renders one line with an optional area fill and no axes, grid, or legend. Pair it with MetricTile through the trend slot.',
    bestPractices: [
      {
        guidance: true,
        description:
          'Give the sparkline a title so assistive technology announces what the trend shows. The title also paints a visible heading above the plot, so only set it when the surrounding layout has room for one; otherwise leave it off and the chart falls back to a localized generic name.',
      },
      {
        guidance: true,
        description:
          'Keep the value list short and ordered; sparklines summarize shape, not precise readings.',
      },
      {
        guidance: false,
        description:
          'Use a sparkline as the only presentation of important values. Pair it with a headline number or data view.',
      },
    ],
    accessibility: [
      {
        name: 'Accessible trend name',
        category: 'Semantics',
        criterion: '1.1.1 Non-text Content',
        requirement: 'Required',
        states: ['All'],
        description:
          'Provide title describing the trend. Without it, the chart falls back to a localized generic name.',
      },
    ],
    anatomy: [
      {
        name: 'Plot',
        required: true,
        description:
          'Compact responsive SVG containing one line with an optional area fill.',
      },
      {
        name: 'Tooltip',
        required: false,
        description:
          'Pointer tooltip hidden by default; set tooltip to true to enable it.',
      },
    ],
  },

  props: [
    {
      name: 'data',
      type: 'number[]',
      description: 'Values plotted left to right in order.',
      required: true,
    },
    {
      name: 'fill',
      type: 'boolean',
      description: 'Fill the area under the line.',
      default: 'true',
    },
    {
      name: 'color',
      type: 'string',
      description:
        'Static stroke/fill color. When omitted, the theme palette applies.',
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
      default: '1.5',
    },
    {
      name: 'height',
      type: 'number',
      description: 'Chart height in CSS pixels.',
      default: '32',
    },
    {
      name: 'yBaseline',
      type: "'auto' | 'zero' | 'data'",
      description: 'How the y-domain is derived.',
      default: "'data'",
    },
    {
      name: 'tooltip',
      type: "boolean | Omit<ChartTooltipProps, 'series'>",
      description: 'Show the pointer tooltip.',
      default: 'false',
    },
    {
      name: 'title',
      type: 'string',
      description: 'Accessible name for the chart image.',
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
      label: 'Basic sparkline',
      code: `import {Sparkline} from '@astryxdesign/charts';

<Sparkline data={[4, 7, 5, 9, 6, 11]} title="Requests over the last hour" />;`,
    },
    {
      label: 'Line-only sparkline',
      code: `<Sparkline
  data={[12, 9, 14, 11, 16, 13]}
  fill={false}
  title="Error budget trend"
/>;`,
    },
  ],
};

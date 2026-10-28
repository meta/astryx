// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */

export const docs = {
  name: 'MetricTile',
  displayName: 'MetricTile',
  group: 'Charts',
  category: 'Data Visualization',
  keywords: [
    'metric',
    'kpi',
    'stat',
    'tile',
    'dashboard',
    'delta',
  ],

  usage: {
    description:
      'MetricTile is a KPI tile: a label, a large headline value, an optional sentiment-aware delta, a supporting description, and a trend slot for a Sparkline. Use it for dashboard headline metrics instead of hand-rolling label/value layouts.',
    bestPractices: [
      {
        guidance: true,
        description:
          'Pass a pre-formatted value string (like "2.4M") and keep the delta to one compact change statement.',
      },
      {
        guidance: true,
        description:
          'Set sentiment explicitly for inverted metrics where down is good (error rate, latency) so the color matches the meaning.',
      },
      {
        guidance: false,
        description:
          'Put charts or interactive content other than a small trend graphic in the trend slot.',
      },
    ],
    accessibility: [
      {
        name: 'Delta direction',
        category: 'Semantics',
        criterion: '1.1.1 Non-text Content',
        requirement: 'Built in',
        states: ['Delta shown'],
        description:
          'The delta glyph is decorative; its direction is announced to screen readers as text after the delta value.',
      },
      {
        name: 'Delta color',
        category: 'Color contrast',
        criterion: '1.4.1 Use of Color',
        requirement: 'Built in',
        states: ['Delta shown'],
        description:
          'Sentiment is carried by both color and the direction glyph plus text, never by color alone.',
      },
    ],
    anatomy: [
      {
        name: 'Label',
        required: true,
        description: 'Metric name shown above the value.',
      },
      {
        name: 'Value',
        required: true,
        description:
          'Headline metric rendered large with tabular numerals.',
      },
      {
        name: 'Delta',
        required: false,
        description:
          'Direction glyph plus colored change text next to the value.',
      },
      {
        name: 'Description',
        required: false,
        description: 'Muted supporting line under the value.',
      },
      {
        name: 'Trend',
        required: false,
        description:
          'Trend graphic below the text content, e.g. a Sparkline.',
      },
    ],
  },

  props: [
    {
      name: 'label',
      type: 'string',
      description: 'Metric name shown above the value.',
      required: true,
    },
    {
      name: 'value',
      type: 'ReactNode',
      description:
        'The headline metric. Pass a pre-formatted string like "1.2M".',
      required: true,
    },
    {
      name: 'delta',
      type: 'MetricTileDelta',
      description:
        'Change indicator: pre-formatted text, a direction, and an optional sentiment override.',
    },
    {
      name: 'description',
      type: 'string',
      description: 'Muted supporting line under the value.',
    },
    {
      name: 'trend',
      type: 'ReactNode',
      description:
        'Trend graphic rendered below the text content, e.g. a Sparkline.',
    },
    {
      name: 'size',
      type: "'sm' | 'md' | 'lg'",
      description: 'Size variant controlling the value font size.',
      default: "'md'",
    },
    {
      name: 'ref',
      type: 'Ref<HTMLDivElement>',
      description: 'Ref forwarded to the root element.',
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
      description: 'CSS class name appended to the root element.',
    },
    {
      name: 'style',
      type: 'CSSProperties',
      description:
        'Inline styles merged onto the root element after the component styles.',
    },
  ],

  examples: [
    {
      label: 'Metric with delta and trend',
      code: `import {MetricTile, Sparkline} from '@astryxdesign/charts';

<MetricTile
  label="Total requests"
  value="2.4M"
  delta={{value: '+12.4%', direction: 'up'}}
  description="vs. previous 30 days"
  trend={<Sparkline data={[4, 7, 5, 9, 6, 11]} />}
/>;`,
    },
    {
      label: 'Inverted metric',
      code: `<MetricTile
  label="Error rate"
  value="0.42%"
  delta={{value: '-0.08%', direction: 'down', sentiment: 'positive'}}
  description="vs. previous 7 days"
/>;`,
    },
  ],
};

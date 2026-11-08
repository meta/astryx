// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */

export const docs = {
  name: 'ChartGrid',
  displayName: 'Chart Grid',
  group: 'Charts',
  category: 'Data Visualization',
  isHiddenFromOverview: true,
  keywords: ['chart', 'grid', 'guides', 'axis', 'ticks', 'data visualization'],

  usage: {
    description:
      'ChartGrid draws horizontal and vertical guide lines from the scales owned by a parent Chart. Use it in the Chart grid slot so guides share the plot dimensions and tick values used by the chart.',
    bestPractices: [
      {
        guidance: true,
        description:
          'Pair ChartGrid with ChartAxis when readers need labelled values beside the guide lines.',
      },
      {
        guidance: true,
        description:
          'Use horizontal guides for value comparison and add vertical guides only when they help readers align categories or continuous x values.',
      },
      {
        guidance: false,
        description:
          'Use grid lines as the only way to communicate a value or distinction. Keep meaningful chart information in labels, marks, and the parent Chart alternative.',
      },
      {
        guidance: false,
        description:
          'Expect tickCount to thin categorical band centers. It requests density only for continuous scales; categorical vertical guides render once per band.',
      },
    ],
    accessibility: [
      {
        name: 'Chart alternative',
        category: 'Content',
        criterion: '1.1.1 Non-text Content',
        requirement: 'Required on the parent Chart',
        states: ['All'],
        description:
          'Chart owns the accessible image name and supported small-data table. Grid lines supplement that chart-level alternative rather than replacing it.',
      },
      {
        name: 'Visual-only guides',
        category: 'Color contrast',
        criterion: '1.4.11 Non-text Contrast',
        requirement: 'Do not carry information alone',
        states: ['Horizontal', 'Vertical', 'Combined'],
        description:
          'Grid lines are supporting guides. Preserve visible labels, marks, or another qualifying cue so understanding does not depend on the grid alone.',
      },
    ],
    anatomy: [
      {
        name: 'Grid lines',
        required: false,
        description:
          'Horizontal lines at continuous y ticks and vertical lines at x ticks or categorical band centers.',
      },
    ],
  },

  props: [
    {
      name: 'horizontal',
      type: 'boolean',
      description:
        'Whether to draw horizontal guides at continuous y ticks other than zero.',
      default: 'true',
    },
    {
      name: 'vertical',
      type: 'boolean',
      description:
        'Whether to draw vertical guides at continuous x ticks or categorical band centers.',
      default: 'false',
    },
    {
      name: 'tickCount',
      type: 'number',
      description:
        'Approximate guide count requested from continuous scales. It does not thin categorical band centers.',
      default: '5',
    },
  ],

  examples: [
    {
      label: 'Horizontal guides',
      code: `import {Chart, ChartGrid, bar} from '@astryxdesign/charts';

<Chart
  data={monthlyRevenue}
  xKey="month"
  series={[bar('revenue')]}
  grid={<ChartGrid />}
/>;`,
    },
    {
      label: 'Horizontal and vertical guides',
      code: `<Chart
  data={monthlyRevenue}
  xKey="month"
  series={[bar('revenue')]}
  grid={<ChartGrid horizontal vertical tickCount={6} />}
/>;`,
    },
  ],
};

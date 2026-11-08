// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */

export const docs = {
  name: 'ChartLegend',
  displayName: 'Chart Legend',
  group: 'Charts',
  category: 'Data Visualization',
  isHiddenFromOverview: true,
  keywords: ['chart', 'legend', 'series', 'key', 'label', 'data visualization'],

  usage: {
    description:
      'ChartLegend pairs series labels with decorative mark-shaped color swatches. Use Chart legend options for the generated legend, or render ChartLegend directly when the caller already owns the legend items.',
    bestPractices: [
      {
        guidance: true,
        description:
          'Give every item a concise label that identifies the corresponding series without relying on its color name.',
      },
      {
        guidance: true,
        description:
          'Use start or end for a vertical legend and top or bottom for a wrapping horizontal legend.',
      },
      {
        guidance: false,
        description:
          'Use the legend as the chart’s only text alternative. Give the parent Chart an accessible name and preserve an equivalent data view or summary when the data requires one.',
      },
      {
        guidance: false,
        description:
          'Assume arbitrary series colors will remain distinguishable in every theme. Verify the complete chart and legend together against the surfaces where they render.',
      },
    ],
    accessibility: [
      {
        name: 'Named list',
        category: 'Semantics',
        criterion: '1.3.1 Info and Relationships',
        requirement: 'Built in',
        states: ['Non-empty'],
        description:
          'Entries render as items in a localized Chart legend list. Each visible label supplies the series name while its swatch stays hidden from assistive technology.',
      },
      {
        name: 'Chart alternative',
        category: 'Content',
        criterion: '1.1.1 Non-text Content',
        requirement: 'Required on the parent Chart',
        states: ['All'],
        description:
          'The legend supplements the parent Chart. It does not replace the Chart accessible name, data table, summary, or other equivalent alternative.',
      },
      {
        name: 'Series distinction',
        category: 'Color contrast',
        criterion: '1.4.1 Use of Color; 1.4.11 Non-text Contrast',
        requirement: 'Consumer verification required',
        states: ['Non-empty'],
        description:
          'Caller-supplied series colors must remain distinguishable on the rendered surface. Do not depend on color alone when otherwise identical marks need to be matched across the chart and legend.',
      },
    ],
    anatomy: [
      {
        name: 'Legend list',
        required: true,
        description:
          'Wrapping horizontal or stacked vertical list that groups the legend entries.',
      },
      {
        name: 'Legend entry',
        required: true,
        description: 'One series label paired with its decorative swatch.',
      },
      {
        name: 'Series swatch',
        required: true,
        description:
          'Decorative square for bar marks or short line for other mark types, painted with the item color.',
      },
      {
        name: 'Series label',
        required: true,
        description: 'Supporting text that names the series.',
      },
    ],
  },

  props: [
    {
      name: 'items',
      type: 'LegendItem[]',
      description:
        'Series entries to render. Each entry supplies a label, color, and optional mark type. An omitted or empty array renders nothing.',
      default: '[]',
    },
    {
      name: 'position',
      type: "'top' | 'bottom' | 'start' | 'end'",
      description:
        'Logical placement used by Chart and the legend orientation: top and bottom are horizontal; start and end are vertical.',
      default: "'bottom'",
    },
    {
      name: 'alignment',
      type: "'start' | 'center' | 'end'",
      description:
        'For top and bottom, distributes the row along its inline axis. For start and end, aligns each entry horizontally within the vertical list.',
      default: "'start'",
    },
  ],

  examples: [
    {
      label: 'Generated chart legend',
      code: `import {Chart, bar, line} from '@astryxdesign/charts';

<Chart
  data={monthlyRevenue}
  xKey="month"
  series={[
    bar('revenue', {label: 'Revenue'}),
    line('forecast', {label: 'Forecast'}),
  ]}
  legend={{position: 'top', alignment: 'start'}}
/>;`,
    },
    {
      label: 'Standalone legend',
      code: `import {ChartLegend} from '@astryxdesign/charts';

<ChartLegend
  items={[
    {label: 'Revenue', color: '#3b82f6', type: 'bar'},
    {label: 'Forecast', color: '#f59e0b', type: 'line'},
  ]}
  position="start"
  alignment="center"
/>;`,
    },
  ],
};

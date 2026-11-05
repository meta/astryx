// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */

export const docs = {
  name: 'ChartTooltip',
  displayName: 'Chart Tooltip',
  group: 'Charts',
  category: 'Data Visualization',
  isHiddenFromOverview: true,
  keywords: [
    'chart',
    'tooltip',
    'hover',
    'series',
    'crosshair',
    'data visualization',
  ],

  usage: {
    description:
      'ChartTooltip shows grouped values for the chart position nearest the pointer. Use Chart’s tooltip prop or its configuration object for the standard integration; direct composition remains available when you need explicit child composition.',
    bestPractices: [
      {
        guidance: true,
        description:
          'Treat tooltip content as supplemental pointer detail. Give the parent Chart an accessible name and preserve its equivalent data table or another complete data view.',
      },
      {
        guidance: true,
        description:
          'When composing ChartTooltip directly, pass the same series definitions used by Chart so rows, swatches, and hover dots stay aligned with the plotted marks.',
      },
      {
        guidance: false,
        description:
          'Put information required to understand the chart only in the tooltip. The current interaction is pointer-driven and does not establish a focus trigger or aria-describedby relationship.',
      },
      {
        guidance: false,
        description:
          'Render interactive controls inside the custom tooltip body. The surface is presentational and does not accept pointer input.',
      },
    ],
    accessibility: [
      {
        name: 'Supplemental detail',
        category: 'Content',
        criterion: '1.1.1 Non-text Content',
        requirement: 'Required on the parent Chart',
        states: ['All'],
        description:
          'The tooltip supplements the parent Chart. It does not replace the Chart accessible name, hidden data table, summary, or another equivalent data view.',
      },
      {
        name: 'Tooltip semantics',
        category: 'Semantics',
        criterion: '1.3.1 Info and Relationships',
        requirement: 'Built in with a documented limitation',
        states: ['Hovered'],
        description:
          'The visible card uses role tooltip. Chart does not currently expose a focusable data-point trigger or an aria-describedby relationship, so required information must remain available outside this pointer-only surface.',
      },
    ],
    anatomy: [
      {
        name: 'Layer host',
        required: true,
        description:
          'Layer host mounted under the chart’s nearest HTML container so nested Theme and MediaTheme scopes remain inherited. It uses the browser top layer when the Popover API is available and otherwise keeps the card visible through Layer’s reduced fallback.',
      },
      {
        name: 'Tooltip card',
        required: true,
        description:
          'Non-interactive surface containing the current x value and series values.',
      },
      {
        name: 'Series row',
        required: false,
        description:
          'For multi-series charts, a decorative swatch, visible label, and value.',
      },
      {
        name: 'Hover indicator',
        required: false,
        description:
          'Band highlight for bar series on a band scale, or a vertical crosshair otherwise.',
      },
      {
        name: 'Hover dot',
        required: false,
        description:
          'Point marker for each eligible non-bar series at the hovered data index.',
      },
    ],
  },

  props: [
    {
      name: 'series',
      type: 'readonly SeriesDef[]',
      description:
        'Series definitions used to derive tooltip rows and hover dots. Chart supplies this automatically through its tooltip prop; direct composition should pass the same array used by Chart.',
      default: '[]',
    },
    {
      name: 'render',
      type: '(xValue: unknown, seriesValues: TooltipSeriesValue[]) => ReactNode',
      description:
        'Replaces the default card body. Return null to hide the card while preserving enabled hover indicators and dots.',
      default: 'Default grouped value content',
    },
    {
      name: 'hoverIndicator',
      type: 'boolean',
      description:
        'Shows a band highlight for bar series on a band scale, or a vertical crosshair for other series.',
      default: 'true',
    },
    {
      name: 'showHoverDots',
      type: 'boolean',
      description:
        'Shows a point marker for each eligible non-bar series at the hovered index.',
      default: 'true',
    },
    {
      name: 'placement',
      type: "'auto' | 'right' | 'left' | 'top'",
      description:
        'Selects one of the shipped placement algorithms. The current implementation positions from the hovered x coordinate and the plot top; whether placement should instead be point-relative on both axes remains unresolved. Custom renderers own their content sizing.',
      default: "'auto'",
    },
  ],

  examples: [
    {
      label: 'Generated chart tooltip',
      code: `import {Chart, bar, line} from '@astryxdesign/charts';

<Chart
  data={monthlyRevenue}
  xKey="month"
  series={[
    bar('revenue', {label: 'Revenue'}),
    line('forecast', {label: 'Forecast'}),
  ]}
  tooltip
/>;`,
    },
    {
      label: 'Direct composition',
      code: `import {Chart, ChartTooltip, line} from '@astryxdesign/charts';

const series = [line('revenue', {label: 'Revenue'})];

<Chart data={monthlyRevenue} xKey="month" series={series}>
  <ChartTooltip
    series={series}
    placement="top"
    showHoverDots={false}
  />
</Chart>;`,
    },
  ],
};

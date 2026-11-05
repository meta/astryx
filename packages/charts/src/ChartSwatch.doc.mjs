// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */

export const docs = {
  name: 'ChartSwatch',
  displayName: 'Chart Swatch',
  group: 'Charts',
  category: 'Data Visualization',
  isHiddenFromOverview: true,
  keywords: [
    'chart',
    'swatch',
    'series',
    'legend',
    'tooltip',
    'data visualization',
  ],

  usage: {
    description:
      'ChartSwatch renders the small decorative mark that pairs a chart series color with its visible label. Use a square for bar series and a short line for other series, including line, dot, and area marks.',
    bestPractices: [
      {
        guidance: true,
        description:
          'Place every swatch next to visible text that names the corresponding series. ChartSwatch is decorative and stays hidden from assistive technology.',
      },
      {
        guidance: true,
        description:
          'Use the square variant for bar series and the line variant for other mark types so legends and tooltips echo the plotted marks consistently.',
      },
      {
        guidance: false,
        description:
          'Use ChartSwatch as the accessible name or data alternative for a series. Its surrounding legend, tooltip, or chart must provide that information.',
      },
      {
        guidance: false,
        description:
          'Rely on arbitrary colors alone when multiple same-shaped series must be matched across a chart. Verify the complete chart and its labels together.',
      },
    ],
    accessibility: [
      {
        name: 'Decorative mark',
        category: 'Semantics',
        criterion: '1.1.1 Non-text Content',
        requirement: 'Built in',
        states: ['All'],
        description:
          'The swatch is hidden from assistive technology. Pair it with visible series text that supplies the accessible meaning.',
      },
      {
        name: 'Series distinction',
        category: 'Color contrast',
        criterion: '1.4.1 Use of Color; 1.4.11 Non-text Contrast',
        requirement: 'Consumer verification required',
        states: ['All'],
        description:
          'Choose colors and, when necessary, additional labels or mark distinctions that remain understandable on the rendered chart surface.',
      },
    ],
    anatomy: [
      {
        name: 'Series swatch',
        required: true,
        description:
          'Decorative square or short line painted with a caller-owned series color.',
      },
    ],
  },

  playground: {
    defaults: {
      color: '#3b82f6',
      variant: 'square',
    },
  },

  props: [
    {
      name: 'color',
      type: 'string',
      description:
        'CSS color used to paint the swatch. The caller owns palette selection and contrast on the rendered surface.',
      required: true,
    },
    {
      name: 'variant',
      type: "'square' | 'line'",
      description:
        'Mark shape: use square for bar series and line for other series types.',
      default: "'square'",
    },
  ],

  examples: [
    {
      label: 'Bar series swatch',
      code: `import {ChartSwatch} from '@astryxdesign/charts';

<ChartSwatch color="#3b82f6" variant="square" />;`,
    },
    {
      label: 'Series-driven swatch',
      code: `import {
  ChartSwatch,
  swatchVariantForType,
} from '@astryxdesign/charts';

<ChartSwatch
  color={series.color}
  variant={swatchVariantForType(series.type)}
/>;`,
    },
  ],
};

// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @file Choose data colors for categories, ordered values, comparisons, and heatmap cells. */

/** @type {import('@astryxdesign/cli/authoring').ReferenceDoc} */
export const docs = {
  type: 'generic',
  name: 'choosing-data-colors',
  title: 'Choose colors for your data',
  placement: {parent: 'namespace:visualization', slot: 'guides', order: 20},
  category: 'guide',
  description:
    'Match color to what the data means: distinct series, a low-to-high measure, or a comparison around a midpoint.',
  keywords: [
    'categorical',
    'sequential',
    'diverging',
    'heatmap',
    'reference line',
    'color scale',
    'palette',
    'map colors',
  ],
  sections: [
    {
      id: 'match-color-to-data',
      title: 'Match the color scale to the data',
      content: [
        {
          type: 'prose',
          text: 'Choose the meaning of color before selecting a hue. {@link namespace:color-sets} shows the color sets, token names, and light/dark previews. {@link generic:tokens-data} lists Core defaults; {@link generic:data-colors-in-renderers} explains how to send the colors to your renderer.',
        },
        {
          type: 'table',
          headers: ['Data meaning', 'Use', 'Example'],
          rows: [
            [
              'Unordered categories or named series',
              'Distinct categorical data tokens, with stable assignments',
              'Revenue and costs keep their own colors across charts.',
            ],
            [
              'One ordered measure, from less to more',
              'One sequential ramp',
              'Cell shading represents request counts or load time.',
            ],
            [
              'Distance on either side of a meaningful midpoint',
              'Two ramps with a shared midpoint chosen for the chart',
              'Values above and below a target use different hues.',
            ],
            [
              'A neutral comparison',
              '`--color-data-neutral`, with an explicit label',
              'A dashed target line reads “Target 150”.',
            ],
          ],
        },
        {
          type: 'prose',
          text: 'These choices follow the distinction between qualitative, sequential, and diverging scales in [Penn State’s cartography guide](https://courses.ems.psu.edu/geog486/node/878). Astryx supplies tokens, not a separate built-in diverging or spectrum palette. Combining ramps does not create new tokens or guarantee that every stop is distinguishable.',
        },
        {
          type: 'prose',
          text: 'Use the same token and non-color cue for a series in the plot, legend, detail view, and export. A blue categorical token has no inherent positive meaning. If the chart communicates a status, state that meaning in text instead of expecting a red, yellow, or green fill to explain it.',
        },
      ],
    },
    {
      id: 'use-a-sequential-ramp',
      title: 'Use a sequential ramp for an ordered measure',
      content: [
        {
          type: 'prose',
          text: 'Each existing ramp has five stops: 1 is the lightest and 5 the darkest in the Core defaults. Use discrete numeric ranges when five colors are enough to show the pattern. Display the ranges in a legend and keep exact values available.',
        },
        {
          type: 'code',
          lang: 'ts',
          label: 'Assign the existing blue stops to request-count ranges',
          code: `import {dataVars} from '@astryxdesign/core/theme/dataTokens.stylex';

const countColors = [
  dataVars['--color-data-blue-1'],
  dataVars['--color-data-blue-2'],
  dataVars['--color-data-blue-3'],
  dataVars['--color-data-blue-4'],
  dataVars['--color-data-blue-5'],
];

export function requestCellColor(count: number | null): string | null {
  if (count === null || !Number.isFinite(count) || count < 0) return null;
  const bin = count < 10 ? 0 : count < 20 ? 1 : count < 30 ? 2 : count < 40 ? 3 : 4;
  return countColors[bin];
}`,
        },
        {
          type: 'prose',
          text: 'The example maps 0–9, 10–19, 20–29, 30–39, and 40+ requests to five stops. A null result means unavailable data, not zero; give that cell a separate “No data” label. For Canvas or a configuration object, resolve those same token names with `useTheme().token()` in React or `resolveThemeTokens()` outside React rather than passing the CSS references. The renderer guide shows both paths.',
        },
        {
          type: 'prose',
          text: 'In Core’s defaults, the categorical colors and colored ramps keep the same values in light and dark mode. The gray ramp and `--color-data-neutral` change by mode. A theme can override any of these values. Mode switching does not reverse a ramp or choose its numeric bins.',
        },
        {
          type: 'prose',
          text: 'Choose scale direction for the chart’s surface. Light-to-dark often reads as low-to-high on a light background; brighter high values can be clearer on a dark background. Do not reverse only the fills: the legend and the numeric assignment must agree. Theme mode changes resolve colors, not the chart’s bin order. [Atlassian’s color guide](https://www.atlassian.com/data/charts/how-to-choose-colors-data-visualization) explains this distinction.',
        },
        {
          type: 'prose',
          text: 'Pale endpoints suit filled regions better than thin lines or tiny points on a light surface. The [Seaborn palette guide](https://seaborn.pydata.org/tutorial/color_palettes.html) illustrates why near-white endpoints can disappear. On a dark surface, the darkest stop can disappear instead. Existing tokens do not guarantee perceptually uniform steps or accessible contrast in every theme.',
        },
      ],
    },
    {
      id: 'sequential-use-cases',
      title: 'Recognize sequential use cases',
      content: [
        {
          type: 'table',
          headers: ['Use case', 'What color represents', 'Keep clear'],
          rows: [
            [
              'Geographic map',
              'A rate or percentage for each area',
              'For shaded geographic areas, compare standardized rates rather than population-driven raw totals.',
            ],
            [
              'Performance table',
              'Page-load time, with larger values in later bins',
              'Show the time and unit. Slower is a numeric direction, not a pass/fail color rule.',
            ],
            [
              'Click-density grid',
              'Number of clicks in each equally sized region',
              'Use the same observation window and cell size. Show the count ranges.',
            ],
            [
              'Ordered usage tiers',
              'Very low through very high usage',
              'If bars show team counts, color shows only the usage tier. Label both measures.',
            ],
            [
              'Resource-utilization table',
              'Percent of available CPU, storage, or memory used',
              'Use a consistent 0–100% range. A separate threshold determines whether action is needed.',
            ],
          ],
        },
        {
          type: 'prose',
          text: 'The [Office for National Statistics map guidance](https://service-manual.ons.gov.uk/data-visualisation/chart-types/choropleth-maps) recommends standardized rates for choropleth maps and typically five color bands. For precise comparisons among a few regions, a labeled bar chart can be easier to read than a map.',
        },
        {
          type: 'prose',
          text: 'Ordered categories can use a discrete sequential palette, as [Seaborn’s guide](https://seaborn.pydata.org/tutorial/color_palettes.html) describes. If position, length, or labels already communicate the ordering, extra shading is optional. Heatmap is a display method: its data may call for a sequential or diverging scale, not a separate set of opacity tokens.',
        },
      ],
    },
    {
      id: 'keep-color-readable',
      title: 'Keep color from becoming the only explanation',
      content: [
        {
          type: 'prose',
          text: 'Pair series color with labels, patterns, line styles, or marker shapes. Repeat the cue in the legend and detail view. Keep exact values in visible text or an adjacent table when the chart alone cannot communicate them.',
        },
        {
          type: 'prose',
          text: 'Check text against its actual surface and meaningful marks against adjacent colors in each supported mode. [WCAG’s non-text contrast guidance](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html) specifies 3:1 for parts of graphics needed to understand the content, not for every decorative grid line. A tooltip does not excuse an unreadable default view.',
        },
        {
          type: 'prose',
          text: 'Do not use a pale or missing fill as the only sign of zero, unavailable data, or disabled content. State the meaning. {@link generic:chart-styling} shows existing theme roles for the labels and surfaces around the data.',
        },
      ],
    },
  ],
};

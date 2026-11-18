// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Choose data colors for categories, ordered values, comparisons, and heatmap cells.
 */

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
          text: 'Choose the meaning of color before selecting a hue. {@link generic:tokens-data} lists the existing categorical colors, neutral, and five-stop ramps. {@link generic:data-colors-in-renderers} explains how to send them to your renderer.',
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
      id: 'data-color-sets',
      title: 'Data color sets and token semantics',
      content: [
        {
          type: 'prose',
          text: 'Start with the meaning the chart needs to communicate. Astryx has categorical data colors, sequential ramps, and a neutral data color. Reference, semantic, diverging, spectrum, and opacity-based heatmap sets below describe ways to use those existing tokens, not additional token families or approved palette defaults. {@link generic:tokens-data} supplies the Core light and dark values; the active theme can override them.',
        },
        {
          type: 'table',
          headers: ['Set', 'Meaning', 'What you use'],
          rows: [
            [
              'Categorical',
              'Different categories, not rank or magnitude',
              'Native categorical tokens; keep each category’s assignment stable.',
            ],
            [
              'Sequential',
              'One measure ordered from low to high',
              'One native five-stop ramp, with numeric bins and a legend.',
            ],
            [
              'Reference',
              'A comparison or quieter context',
              'The native gray ramp or neutral data token, with a label.',
            ],
            [
              'Semantic',
              'A stated status such as positive, warning, or negative',
              'Chart-owned meanings assigned to existing data colors.',
            ],
            [
              'Diverging',
              'Two directions away from a meaningful midpoint',
              'Two existing ramps and a shared neutral stop.',
            ],
            [
              'Spectrum',
              'A mixed-hue scale with an explicitly defined order',
              'An example sequence assembled from several families.',
            ],
            [
              'Heatmap',
              'Values encoded by cell fill',
              'A sequential or diverging scale; opacity is an optional rendering choice.',
            ],
          ],
        },
        {
          type: 'prose',
          text: 'In Core’s defaults, colored data tokens have the same light and dark values; gray and neutral vary by mode. Themes can replace either value. Resolving a theme does not assign category meanings, reverse a scale, choose bins, or validate contrast. Keep those decisions in the chart and its legend.',
        },
      ],
    },
    {
      id: 'categorical-token-reference',
      title: 'Categorical token reference',
      content: [
        {
          type: 'prose',
          text: 'Use these native categorical tokens for unrelated categories or series. The names identify colors, not business meaning: green is not automatically positive, and red is not automatically negative.',
        },
        {
          type: 'table',
          headers: ['Color', 'Native categorical token'],
          rows: [
            ['Blue', '`--color-data-categorical-blue`'],
            ['Orange', '`--color-data-categorical-orange`'],
            ['Purple', '`--color-data-categorical-purple`'],
            ['Green', '`--color-data-categorical-green`'],
            ['Pink', '`--color-data-categorical-pink`'],
            ['Cyan', '`--color-data-categorical-cyan`'],
            ['Red', '`--color-data-categorical-red`'],
            ['Teal', '`--color-data-categorical-teal`'],
            ['Brown', '`--color-data-categorical-brown`'],
            ['Indigo', '`--color-data-categorical-indigo`'],
          ],
        },
        {
          type: 'prose',
          text: 'A chart can also compose a categorical list from existing hue stops. This eleven-position example mixes categorical tokens with sequential shades; it is not the native categorical family. Related purples, pinks, and blues may be hard to tell apart. Keep category labels and another identifying cue, and choose fewer colors when those distinctions do not hold. The arrays in this reference contain token names: {@link generic:data-colors-in-renderers} shows how to turn them into CSS references or resolved colors.',
        },
        {
          type: 'code',
          lang: 'ts',
          label: 'Composed categorical example, in display order',
          code: `const categoryTokens = [
  '--color-data-categorical-blue',
  '--color-data-categorical-orange',
  '--color-data-purple-4',
  '--color-data-pink-4',
  '--color-data-blue-4',
  '--color-data-categorical-teal',
  '--color-data-purple-3',
  '--color-data-pink-5',
  '--color-data-categorical-cyan',
  '--color-data-purple-5',
  '--color-data-categorical-brown',
];`,
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
          type: 'table',
          headers: ['Ramp', '1 · lightest', '2', '3', '4', '5 · darkest'],
          rows: [
            [
              'Blue',
              '`--color-data-blue-1`',
              '`--color-data-blue-2`',
              '`--color-data-blue-3`',
              '`--color-data-blue-4`',
              '`--color-data-blue-5`',
            ],
            [
              'Teal',
              '`--color-data-teal-1`',
              '`--color-data-teal-2`',
              '`--color-data-teal-3`',
              '`--color-data-teal-4`',
              '`--color-data-teal-5`',
            ],
            [
              'Purple',
              '`--color-data-purple-1`',
              '`--color-data-purple-2`',
              '`--color-data-purple-3`',
              '`--color-data-purple-4`',
              '`--color-data-purple-5`',
            ],
            [
              'Pink',
              '`--color-data-pink-1`',
              '`--color-data-pink-2`',
              '`--color-data-pink-3`',
              '`--color-data-pink-4`',
              '`--color-data-pink-5`',
            ],
            [
              'Orange',
              '`--color-data-orange-1`',
              '`--color-data-orange-2`',
              '`--color-data-orange-3`',
              '`--color-data-orange-4`',
              '`--color-data-orange-5`',
            ],
            [
              'Green / Shamrock',
              '`--color-data-shamrock-1`',
              '`--color-data-shamrock-2`',
              '`--color-data-shamrock-3`',
              '`--color-data-shamrock-4`',
              '`--color-data-shamrock-5`',
            ],
            [
              'Red',
              '`--color-data-red-1`',
              '`--color-data-red-2`',
              '`--color-data-red-3`',
              '`--color-data-red-4`',
              '`--color-data-red-5`',
            ],
            [
              'Yellow',
              '`--color-data-yellow-1`',
              '`--color-data-yellow-2`',
              '`--color-data-yellow-3`',
              '`--color-data-yellow-4`',
              '`--color-data-yellow-5`',
            ],
            [
              'Gray',
              '`--color-data-gray-1`',
              '`--color-data-gray-2`',
              '`--color-data-gray-3`',
              '`--color-data-gray-4`',
              '`--color-data-gray-5`',
            ],
          ],
        },
        {
          type: 'prose',
          text: 'The table uses numeric token order, light → dark. A dark → light display uses 5 → 4 → 3 → 2 → 1 instead; changing presentation order does not rename the tokens. Green uses the `shamrock` ramp name, not the categorical green name. Neither red nor green turns an ordered measure into a status scale.',
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
      id: 'reference-token-semantics',
      title: 'Reference: show a comparison without adding a category',
      content: [
        {
          type: 'prose',
          text: 'Use `--color-data-neutral` for a labeled target or comparison line. For several reference shades, use the gray ramp below, shown dark → light. These are data colors, not replacements for text or grid roles: {@link generic:chart-styling} maps the parts around the data.',
        },
        {
          type: 'table',
          headers: ['Reference order', 'Existing token'],
          rows: [
            ['1 · darkest', '`--color-data-gray-5`'],
            ['2', '`--color-data-gray-4`'],
            ['3', '`--color-data-gray-3`'],
            ['4', '`--color-data-gray-2`'],
            ['5 · lightest', '`--color-data-gray-1`'],
          ],
        },
        {
          type: 'prose',
          text: 'The neutral token is not an alias of gray-3. Both neutral and gray have mode-relative Core values. A pale reference may blend into the surface; label the comparison and choose a visible line style rather than relying on shade alone.',
        },
      ],
    },
    {
      id: 'semantic-data-colors',
      title: 'Semantic: state the status the color represents',
      content: [
        {
          type: 'prose',
          text: 'This example assigns four chart statuses to existing data colors. It is a composed usage recipe, not a native semantic data-token family or a default status palette. Define what positive, warning, negative, and neutral mean for the product and show those words in the legend.',
        },
        {
          type: 'table',
          headers: ['Chart meaning', 'Example data token', 'Keep clear'],
          rows: [
            [
              'Positive',
              '`--color-data-categorical-green`',
              'The chart assigns the positive meaning; the token does not.',
            ],
            [
              'Warning',
              '`--color-data-yellow-4`',
              'An example yellow stop, not a categorical yellow token or an approved warning default. Check the choice on the chart’s surface.',
            ],
            [
              'Negative',
              '`--color-data-categorical-red`',
              'Explain whether negative means an error, a loss, or a value below a threshold.',
            ],
            [
              'Neutral',
              '`--color-data-neutral`',
              'Name the neutral state. Do not silently equate it with unavailable data.',
            ],
          ],
        },
        {
          type: 'prose',
          text: 'Status text, icons, borders, and UI fills have their own roles in {@link generic:tokens-color}. A chart’s categorical green does not replace success text, and a yellow data stop does not replace warning text. Those UI roles can change with the theme independently of the data colors.',
        },
      ],
    },
    {
      id: 'diverging-data-colors',
      title: 'Diverging: compare both sides of a midpoint',
      content: [
        {
          type: 'prose',
          text: 'Use a diverging set when zero, a target, or another stated midpoint separates two meaningful directions. These examples join existing ramps with `--color-data-gray-1` at the center. They are discrete token-name sequences with no interpolation, not native diverging palettes. Label the midpoint and both sides; a numeric negative value is not automatically a bad outcome.',
        },
        {
          type: 'code',
          lang: 'ts',
          label: 'Warm / cold: orange → neutral midpoint → blue',
          code: `const warmColdTokens = [
  '--color-data-orange-5',
  '--color-data-orange-4',
  '--color-data-orange-3',
  '--color-data-orange-2',
  '--color-data-orange-1',
  '--color-data-gray-1',
  '--color-data-blue-1',
  '--color-data-blue-2',
  '--color-data-blue-3',
  '--color-data-blue-4',
  '--color-data-blue-5',
];`,
        },
        {
          type: 'code',
          lang: 'ts',
          label: 'Negative / positive: pink → neutral midpoint → shamrock',
          code: `const negativePositiveTokens = [
  '--color-data-pink-5',
  '--color-data-pink-4',
  '--color-data-pink-3',
  '--color-data-pink-2',
  '--color-data-pink-1',
  '--color-data-gray-1',
  '--color-data-shamrock-1',
  '--color-data-shamrock-2',
  '--color-data-shamrock-3',
  '--color-data-shamrock-4',
  '--color-data-shamrock-5',
];`,
        },
        {
          type: 'prose',
          text: 'Both sides run pale near the midpoint and dark at the ends in Core. The center gray changes by mode, while the colored sides do not. A theme can override that behavior. Make the numeric ranges explicit, distinguish a midpoint value from missing data, and check that the pale center remains understandable on the actual surface.',
        },
      ],
    },
    {
      id: 'spectrum-data-colors',
      title: 'Spectrum: define the order of a mixed-hue scale',
      content: [
        {
          type: 'prose',
          text: 'A spectrum recipe crosses several hues. Astryx does not supply a native spectrum palette. This ten-position example repeats shamrock-2 and blue-5, so it has only eight distinct token names, not ten distinct colors. It does not guarantee a perceptually uniform progression. Prefer a single sequential ramp for an ordinary ordered measure; use a mixed-hue scale only when the product has a clear reason and a labeled legend.',
        },
        {
          type: 'code',
          lang: 'ts',
          label: 'Mixed-hue example with repeated stops',
          code: `const spectrumTokens = [
  '--color-data-yellow-1',
  '--color-data-shamrock-1',
  '--color-data-shamrock-2',
  '--color-data-shamrock-2',
  '--color-data-teal-3',
  '--color-data-blue-3',
  '--color-data-categorical-blue',
  '--color-data-blue-4',
  '--color-data-blue-5',
  '--color-data-blue-5',
];`,
        },
      ],
    },
    {
      id: 'heatmap-data-colors',
      title: 'Heatmap: map values to a cell fill',
      content: [
        {
          type: 'prose',
          text: 'Heatmap describes how values appear in cells, not a separate token family. Choose a sequential scale for one ordered measure or a diverging scale for values on both sides of a midpoint. An opacity-based alternative keeps one existing base token and changes only the strength of the cell fill.',
        },
        {
          type: 'table',
          headers: ['Single-hue example', 'Base token'],
          rows: [
            ['Blue', '`--color-data-blue-3`'],
            ['Green', '`--color-data-shamrock-3`'],
            ['Gray', '`--color-data-gray-3`'],
            ['Orange', '`--color-data-orange-3`'],
            ['Pink', '`--color-data-pink-3`'],
          ],
        },
        {
          type: 'prose',
          text: 'A seven-step opacity example uses 25%, 37.5%, 50%, 62.5%, 75%, 87.5%, and 100% of the base color. These percentages belong to the chart, not to seven additional Astryx tokens. Apply them to the fill only, not to the whole cell and its text. Display the value ranges rather than expecting opacity to explain the numeric scale.',
        },
        {
          type: 'table',
          headers: [
            'Two-sided opacity example',
            'First side',
            'Midpoint',
            'Second side',
          ],
          rows: [
            [
              'Negative / positive',
              '`--color-data-red-3` at 75%, 50%, 25%',
              '`--color-data-gray-3` at 25%',
              '`--color-data-shamrock-3` at 25%, 50%, 75%',
            ],
            [
              'Warm / cold',
              '`--color-data-orange-3` at 75%, 50%, 25%',
              '`--color-data-gray-3` at 25%',
              '`--color-data-blue-3` at 25%, 50%, 75%',
            ],
          ],
        },
        {
          type: 'prose',
          text: 'Transparency blends with the real surface, so the same token and percentage can look different on another background. Gray also changes its base value by mode. Do not use an opacity blend as a fixed hex color, and do not let a faint cell be the only way to identify zero or missing data. Keep the legend, cell values, and unavailable-data labels readable.',
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

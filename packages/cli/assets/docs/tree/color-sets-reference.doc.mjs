// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Existing data-color sets, with canonical values and chart-owned compositions.
 * @input The generated data-token reference.
 * @output A focused color-set guide for CLI readers and visual documentation.
 * @position Data visualization's Color sets reference.
 */

import {docs as dataTokens} from './tokens-data.doc.mjs';

const values = new Map(
  dataTokens.sections
    .flatMap(section =>
      section.content.flatMap(block =>
        block.type === 'table' ? block.rows : [],
      ),
    )
    .map(row => [row[0], row.slice(1)]),
);

/** @param {string} value @param {number} strength */
function withAlpha(value, strength) {
  return strength === 1
    ? value
    : `${value}${Math.round(strength * 255)
        .toString(16)
        .padStart(2, '0')
        .toUpperCase()}`;
}

/**
 * @param {Array<[string, string, number?]>} entries
 * @returns {import('@astryxdesign/cli/authoring').ReferenceContentBlock}
 */
function colors(entries) {
  return {
    type: 'table',
    headers: [
      'Use / order',
      'Token',
      'Strength',
      'Core default (light)',
      'Core default (dark)',
    ],
    rows: entries.map(([label, token, strength = 1]) => {
      const pair = values.get(token);
      if (!pair) throw new Error(`Unknown data token: ${token}`);
      return [
        label,
        token,
        `${strength * 100}%`,
        withAlpha(pair[0], strength),
        withAlpha(pair[1], strength),
      ];
    }),
  };
}

/** @param {string} hue @returns {Array<[string, string]>} */
function ramp(hue) {
  return [5, 4, 3, 2, 1].map(stop => [
    `${hue} ${stop}`,
    `--color-data-${hue}-${stop}`,
  ]);
}

/**
 * @param {string} name
 * @param {Array<[string, string]>} entries
 * @returns {import('@astryxdesign/cli/authoring').ReferenceContentBlock}
 */
function tokenCode(name, entries) {
  return {
    type: 'code',
    lang: 'ts',
    label: 'Ordered token names',
    code: `const ${name} = [\n${entries.map(([, token]) => `  '${token}',`).join('\n')}\n];`,
  };
}

/** @param {string} text @returns {import('@astryxdesign/cli/authoring').ReferenceContentBlock} */
function heading(text) {
  return {type: 'heading', level: 3, text};
}

/** @param {string} hue @param {number[]} strengths @param {string[]} [labels] @returns {Array<[string, string, number]>} */
function opacityRows(hue, strengths, labels = []) {
  return strengths.map((strength, i) => [
    labels[i] ?? `Step ${i + 1}`,
    `--color-data-${hue}-3`,
    strength,
  ]);
}

/** @type {Array<[string, string]>} */
const categorical = [
  'blue',
  'orange',
  'purple',
  'green',
  'pink',
  'cyan',
  'red',
  'teal',
  'brown',
  'indigo',
].map(hue => [hue, `--color-data-categorical-${hue}`]);
/** @type {Array<[string, string]>} */
const warmCold = [
  ...ramp('orange'),
  ['Midpoint', '--color-data-gray-1'],
  ...ramp('blue').reverse(),
];
/** @type {Array<[string, string]>} */
const negativePositive = [
  ...ramp('pink'),
  ['Midpoint', '--color-data-gray-1'],
  ...ramp('shamrock').reverse(),
];
/** @type {Array<[string, string]>} */
const spectrum = [
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
].map((token, i) => [`Position ${i + 1}`, token]);

/** @type {import('@astryxdesign/cli/authoring').ReferenceDoc} */
export default {
  type: 'generic',
  name: 'color-sets-reference',
  title: 'Color sets and token semantics',
  placement: {parent: 'namespace:color-sets', slot: 'guides', order: 10},
  category: 'guide',
  description:
    'Preview existing data colors and understand which set suits the meaning of your data.',
  keywords: [
    'palette',
    'categorical',
    'sequential',
    'reference',
    'semantic',
    'diverging',
    'spectrum',
    'heatmap',
  ],
  sections: [
    {
      id: 'data-color-sets',
      title: 'Read the color sets',
      content: [
        {
          type: 'prose',
          text: 'Astryx supplies categorical data colors, sequential ramps, and a neutral data color. The reference, semantic, diverging, spectrum, and opacity recipes here compose those existing tokens; they are not additional token families or approved palette defaults. Tables list Core defaults from {@link generic:tokens-data}. Live swatches show the same Neutral theme as the token reference, paired light and dark values.',
        },
        {
          type: 'prose',
          text: 'In Core’s defaults, colored data tokens stay the same between modes, while gray and neutral change. Themes can override either value. A theme does not assign category meanings, reverse a ramp, choose bins, or guarantee contrast. {@link generic:choosing-data-colors} explains color selection and numeric ranges; {@link generic:data-colors-in-renderers} shows how to resolve the token names for your renderer.',
        },
      ],
    },
    {
      id: 'categorical-token-reference',
      title: 'Categorical',
      previewType: 'swatch',
      content: [
        {
          type: 'prose',
          text: 'Use distinct colors for unrelated categories or named series, with stable assignments across the plot, legend, and detail view. Native categorical names identify hues, not rank or status: green is not automatically positive, and red is not automatically negative.',
        },
        colors(categorical),
        tokenCode('categoryTokens', categorical),
      ],
    },
    {
      id: 'sequential-token-reference',
      title: 'Sequential',
      previewType: 'swatch',
      content: [
        {
          type: 'prose',
          text: 'Use one ramp for an ordered measure, such as request count, load time, or utilization. These rows display each native ramp dark → light: 5 → 4 → 3 → 2 → 1. Core’s numeric order is the opposite: 1 is lightest and 5 darkest. Display order never renames the stops. Keep numeric bins and the legend in agreement.',
        },
        ...[
          'blue',
          'teal',
          'purple',
          'pink',
          'orange',
          'shamrock',
          'red',
          'yellow',
          'gray',
        ].flatMap(hue => [
          heading(
            hue === 'shamrock'
              ? 'Green / Shamrock'
              : hue[0].toUpperCase() + hue.slice(1),
          ),
          colors(ramp(hue)),
        ]),
        {
          type: 'prose',
          text: 'The gray ramp changes by mode; the colored ramps do not in Core. A theme can override both. Pale ends can disappear on a light surface and dark ends on a dark surface. Exact values, labels, and non-color cues remain necessary.',
        },
      ],
    },
    {
      id: 'reference-token-semantics',
      title: 'Reference',
      previewType: 'swatch',
      content: [
        {
          type: 'prose',
          text: 'Use --color-data-neutral for a target or comparison value. The gray 1–5 tokens form a sequential ramp, shown under Sequential; they are not a separate reference palette. Neutral is not an alias of gray-3. Use text and border roles for labels, axes, and grids; {@link generic:chart-styling} covers those parts.',
        },
        colors([['Neutral comparison', '--color-data-neutral']]),
      ],
    },
    {
      id: 'semantic-data-colors',
      title: 'Semantic',
      previewType: 'swatch',
      content: [
        {
          type: 'prose',
          text: 'This chart-owned recipe assigns positive, warning, negative, and neutral meanings to existing data colors. It is not a native semantic data family or a default status palette. Define those meanings and state them in the legend.',
        },
        colors([
          ['Positive', '--color-data-categorical-green'],
          ['Warning', '--color-data-yellow-4'],
          ['Negative', '--color-data-categorical-red'],
          ['Neutral', '--color-data-neutral'],
        ]),
        {
          type: 'prose',
          text: 'Warning uses a yellow ramp stop, not a categorical yellow token or an approved warning default. Check that choice on the actual surface. UI status text, icons, borders, and fills have separate roles in {@link generic:tokens-color}; a data color does not replace those surface-specific roles.',
        },
      ],
    },
    {
      id: 'diverging-data-colors',
      title: 'Diverging',
      previewType: 'swatch',
      content: [
        {
          type: 'prose',
          text: 'Use two directions away from a stated midpoint, such as zero or a target. These discrete examples join existing ramps with gray-1 at the center, with no interpolation. They are composed recipes, not native diverging palettes. Label the midpoint and both sides; a negative number is not automatically a bad outcome.',
        },
        {type: 'heading', level: 3, text: 'Warm / Cold'},
        colors(warmCold),
        tokenCode('warmColdTokens', warmCold),
        {type: 'heading', level: 3, text: 'Negative / Positive'},
        colors(negativePositive),
        tokenCode('negativePositiveTokens', negativePositive),
        {
          type: 'prose',
          text: 'Both sides run pale near the midpoint and dark at the ends in Core. The center gray changes by mode. Make the ranges explicit, distinguish the midpoint from unavailable data, and check the center on the chart’s surface.',
        },
      ],
    },
    {
      id: 'spectrum-data-colors',
      title: 'Spectrum',
      previewType: 'swatch',
      content: [
        {
          type: 'prose',
          text: 'A spectrum crosses several hues in a defined order. Astryx has no native spectrum palette. This ten-position example repeats shamrock-2 and blue-5, so it has only eight distinct token names, not ten distinct colors. It does not guarantee perceptually uniform steps. Prefer a single sequential ramp for an ordinary ordered measure; use mixed hues only with a clear product reason and a labeled legend.',
        },
        colors(spectrum),
        tokenCode('spectrumTokens', spectrum),
      ],
    },
    {
      id: 'heatmap-data-colors',
      title: 'Heatmap',
      previewType: 'swatch',
      content: [
        {
          type: 'prose',
          text: 'Heatmap describes cell fills, not a token family. Use a sequential or diverging scale according to the data. An opacity alternative keeps one base token and changes only the strength of its fill, not the cell’s text. These percentages belong to the chart, not to additional Astryx tokens.',
        },
        ...['blue', 'shamrock', 'gray', 'orange', 'pink'].flatMap(hue => [
          heading(
            hue === 'shamrock' ? 'Green' : hue[0].toUpperCase() + hue.slice(1),
          ),
          colors(opacityRows(hue, [0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 1])),
        ]),
        ...[
          ['Negative / Positive', 'red', 'shamrock'],
          ['Warm / Cold', 'orange', 'blue'],
        ].flatMap(([title, first, second]) => [
          heading(title),
          colors([
            ...opacityRows(
              first,
              [0.75, 0.5, 0.25],
              ['First side 3', 'First side 2', 'First side 1'],
            ),
            ['Midpoint', '--color-data-gray-3', 0.25],
            ...opacityRows(
              second,
              [0.25, 0.5, 0.75],
              ['Second side 1', 'Second side 2', 'Second side 3'],
            ),
          ]),
        ]),
        {
          type: 'prose',
          text: 'The swatches composite the translucent fill over the actual light or dark Neutral surface. The hex label retains the alpha channel; the strength label gives the exact percentage. Gray also changes its base value by mode. The resulting visible color depends on the background, so do not treat an opacity blend as a fixed opaque hex. Keep cell values, range legends, and unavailable-data labels readable.',
        },
      ],
    },
  ],
};

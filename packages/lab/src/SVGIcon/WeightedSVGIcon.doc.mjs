// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */

export const docs = {
  name: 'WeightedSVGIcon',
  displayName: 'Weighted SVG Icon',
  group: 'SVGIcon',
  category: 'Content',
  keywords: ['icon', 'svg', 'weight', 'font-weight', 'sprite', 'variable'],

  usage: {
    description:
      'An SVG icon that holds one drawing per weight (300-700) and shows the one matching the surrounding font-weight, so an icon in bold text draws its bold version with no prop. Weight switching happens in CSS; the drawings themselves are static. Render WeightedIconSprite once and pass `sprite` to draw each icon as a lightweight reference.',
    bestPractices: [
      {guidance: true, description: 'Let the icon follow the text around it; use `weight` only when the icon must differ from that text.'},
      {guidance: true, description: 'Use sprite mode when the same icon repeats many times on a page, such as in list rows.'},
      {guidance: true, description: 'Build icon modules with scripts/build-weighted-icons.mjs and keep only the weights the type scale can reach.'},
      {guidance: false, description: 'Expect smooth in-between weights: a weight like 450 shows the nearest drawing (500).'},
    ],
  },

  props: [
    {name: 'icon', type: 'WeightedIconDef', description: 'The icon: one drawing per weight range.', required: true},
    {name: 'size', type: "'xsm' | 'sm' | 'md' | 'lg'", description: 'Icon size.', default: "'md'"},
    {name: 'color', type: 'SVGIconColor', description: 'Semantic color.', default: "'primary'"},
    {name: 'weight', type: '300 | 400 | 500 | 600 | 700', description: 'Pin the drawing to one weight instead of following the surrounding font-weight.'},
    {name: 'sprite', type: 'boolean', description: 'Reference the symbol from a WeightedIconSprite on the page instead of drawing inline.', default: 'false'},
  ],
};

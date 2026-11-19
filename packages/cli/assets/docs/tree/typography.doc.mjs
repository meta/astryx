// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `astryx docs typography`: the typography namespace. States the core
 * text rules and groups guides for font setup, the type scale, and best
 * practices.
 */

/** @type {import('@astryxdesign/cli/authoring').NamespaceDoc} */
export const docs = {
  type: 'namespace',
  name: 'typography',
  title: 'Typography',
  summary:
    'Font families, geometric type scale, weight, line-height, and semantic text tokens for consistent, accessible text styling.',
  keywords: [
    'typography',
    'font',
    'fonts',
    'type scale',
    'heading',
    'text',
    'weight',
    'line-height',
    'display',
  ],
  blocks: [
    {
      type: 'prose',
      text: 'Use Heading for headings and Text for all other text. Both read the type scale, so never set raw font sizes, line heights or numeric weights: use `type` and the named `weight` values.',
    },
    {
      type: 'list',
      style: 'unordered',
      items: [
        "Choose each heading's `level` from the document outline, never for its size; change how it looks with a visual `type` or `weight`",
        'Put timestamps, helper text and captions in `type="supporting"`',
        'Keep display types for a hero or a large data callout, never for body text: `<Heading level={1} type="display-1">` for a page title, `<Text type="display-2">` for a big number',
        'To make all text denser or roomier, change the base and ratio of the scale in defineTheme (base 12 with ratio 1.125 suits dense screens), not one size token',
      ],
    },
    {
      type: 'code',
      lang: 'tsx',
      label: 'Text by role',
      code: `<Heading level={1}>Usage</Heading>
<Text>Requests this week, by team.</Text>
<Text type="supporting">Updated 5 minutes ago</Text>`,
    },
    {
      type: 'prose',
      text: 'The guides below cover font setup, the full type scale and its tokens, and the rules in detail.',
    },
  ],
  slots: {
    guides: {title: 'Guides', accepts: {kinds: ['generic']}},
  },
};

// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `astryx docs authoring/building-blocks/components/describe-the-component`:
 * choose and maintain the ComponentDoc shape that matches a component's public
 * source.
 */

/** @type {import('@astryxdesign/cli/authoring').NamespaceDoc} */
export const docs = {
  type: 'namespace',
  name: 'describe-the-component',
  placement: {parent: 'namespace:components', slot: 'guides', order: 20},
  title: 'Describe the component',
  summary:
    'Write and maintain the default component doc, then adapt it when one family owns several exports or a member needs its own file.',
  keywords: [
    'component doc',
    'component documentation',
    'component family',
    'subcomponent',
  ],
  slots: {
    guides: {
      title: 'Describe the component',
      accepts: {kinds: ['generic']},
    },
  },
  blocks: [
    {
      type: 'prose',
      text: 'A component\'s `.doc.mjs` is part of the integration\'s public contract, not optional commentary. Astryx uses it for CLI output and search, and people and agents read it to decide whether the component fits and how to use it.',
    },
    {
      type: 'list',
      style: 'unordered',
      items: [
        'Change the source and its `.doc.mjs` together.',
        'Update the doc whenever the public name, import, behavior, props, defaults, examples, or accessibility requirements change.',
        '`integration verify` checks the doc shape and packed import, and `doctor integration components` compares each props table with the component\'s TypeScript props ({@link generic:check-the-props}). Neither can prove the prose still matches the component.',
      ],
    },
    {
      type: 'prose',
      text: 'Every component doc has one stable identity and enough usage guidance for a reader to choose it correctly. Pick the shape below that matches your module.',
    },
    {
      type: 'prose',
      text: 'After every source or doc change, read the component back. This output is what people and agents receive.',
    },
    {
      type: 'code',
      lang: 'bash',
      code: '{@command component AcmeCarousel}',
    },
  ],
};

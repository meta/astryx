// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */
export const docs = {
  type: 'component',
  name: 'Badge',
  displayName: 'Badge',
  category: 'Feedback & Status',
  keywords: ['badge', 'count', 'status'],
  props: [
    {
      name: 'label',
      type: 'string',
      description: 'Text inside the badge.',
      required: true,
    },
    {
      name: 'variant',
      type: "'neutral' | 'accent'",
      description: 'Color treatment.',
      default: "'neutral'",
    },
  ],
  theming: {targets: [{className: 'astryx-badge', states: ['hover']}]},
  usage: {
    description: 'Show a short status or count next to other content.',
    bestPractices: [
      {guidance: true, description: 'Keep the label to one or two words.'},
    ],
    anatomy: [
      {name: 'Container', required: true, description: 'The pill shape.'},
    ],
  },
  examples: [{label: 'Basic', code: '<Badge label="New" />'}],
};

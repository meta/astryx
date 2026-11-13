// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */
export const docs = {
  name: 'Chip',
  displayName: 'Chip',
  category: 'Content',
  keywords: ['chip'],
  usage: {
    description: 'A fixture chip.',
    bestPractices: [{guidance: true, description: 'Use in tests.'}],
    anatomy: [{name: 'Root', required: true, description: 'The chip.'}],
  },
  props: [
    {name: 'label', type: 'string', description: 'Text.', required: true},
  ],
  theming: {
    targets: [
      {
        className: 'astryx-chip',
        visualProps: ['size', 'isSelected'],
        states: ['pressed'],
      },
    ],
  },
};

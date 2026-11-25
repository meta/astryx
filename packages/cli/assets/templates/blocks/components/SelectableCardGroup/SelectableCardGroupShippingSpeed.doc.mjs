// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'block',
  name: 'Shipping speed',
  displayName: 'Shipping speed',
  description:
    'A vertical group of full-width cards for options that need a line of detail: each speed shows its delivery time and its price. Put the cards in one column when their content reads as a row.',
  exampleFor: 'SelectableCardGroup',
  isReady: true,
  aspectRatio: 4 / 3,
  componentsUsed: [
    'SelectableCardGroup',
    'SelectableCard',
    'HStack',
    'StackItem',
    'VStack',
    'Text',
  ],
};

// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'block',
  exampleFor: 'LayoutContent',
  name: 'LayoutContent — Basic',
  displayName: 'LayoutContent — Basic',
  description:
    'A scrollable main content area below a fixed header. Use LayoutContent inside Layout to get automatic padding and scroll containment for the primary content.',
  isReady: true,
  aspectRatio: 16 / 9,
  componentsUsed: [
    'LayoutContent',
    'Layout',
    'LayoutHeader',
    'Center',
    'Card',
    'VStack',
    'Heading',
    'Text',
  ],
  fits: [],
};

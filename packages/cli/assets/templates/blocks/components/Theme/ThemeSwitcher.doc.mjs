// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'block',
  exampleFor: 'Theme',
  name: 'Theme — Switch Themes',
  displayName: 'Theme — Switch Themes',
  description:
    'Use state to switch the theme object passed to Theme and preview a different visual treatment.',
  isReady: true,
  aspectRatio: 4 / 3,
  componentsUsed: [
    'Theme',
    'Card',
    'Button',
    'Section',
    'Layout',
    'Selector',
    'Text',
  ],
  fits: ['form', 'content'],
};

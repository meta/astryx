// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'block',
  exampleFor: 'LayoutFooter',
  name: 'LayoutFooter — Actions',
  displayName: 'LayoutFooter — Actions',
  description:
    'A fixed footer with end-aligned action buttons below scrollable content. Use LayoutFooter inside Layout for persistent actions like Save and Cancel.',
  isReady: true,
  aspectRatio: 16 / 9,
  componentsUsed: [
    'LayoutFooter',
    'Layout',
    'LayoutContent',
    'Center',
    'Card',
    'HStack',
    'Button',
  ],
  fits: ['footer'],
};

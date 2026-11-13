// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'block',
  exampleFor: 'LayoutHeader',
  name: 'LayoutHeader — With Actions',
  displayName: 'LayoutHeader — With Actions',
  description:
    'A fixed page header with a title and a primary action, above scrollable content. Use LayoutHeader inside Layout for persistent page-level headers.',
  isReady: true,
  aspectRatio: 16 / 9,
  componentsUsed: [
    'LayoutHeader',
    'Layout',
    'LayoutContent',
    'Center',
    'Card',
    'HStack',
    'Heading',
    'Button',
  ],
  fits: ['header'],
};

// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'block',
  exampleFor: 'LayoutPanel',
  name: 'LayoutPanel — Navigation',
  displayName: 'LayoutPanel — Navigation',
  description:
    'A fixed-width side panel holding a navigation list next to the main content. Use LayoutPanel in the start or end slot of Layout for sidebars.',
  isReady: true,
  aspectRatio: 16 / 9,
  componentsUsed: [
    'LayoutPanel',
    'Layout',
    'LayoutContent',
    'Center',
    'List',
    'ListItem',
    'Card',
  ],
  fits: ['navigation', 'panel'],
};

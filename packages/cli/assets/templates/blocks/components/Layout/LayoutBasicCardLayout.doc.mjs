// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'block',
  exampleFor: 'Layout',
  name: 'Layout — Basic Card',
  displayName: 'Layout — Basic Card',
  description:
    'A card layout with header, scrollable content area, and footer with action buttons.',
  isReady: true,
  aspectRatio: 4 / 3,
  componentsUsed: ['Layout', 'LayoutHeader', 'LayoutContent', 'LayoutFooter', 'Card', 'Button', 'HStack', 'VStack', 'Text', 'Heading'],
  fits: ['content', 'overlay'],
};

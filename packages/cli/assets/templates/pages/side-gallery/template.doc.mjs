// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  name: 'Side Gallery',
  displayName: 'Side Gallery',
  description:
    'Asymmetric split section: a copy column of headline, supporting text, and links held against a clustered image collage opposite. Deliberately off-balance, unlike the centered hero.',
  keywords: ['feature banner', 'split section', 'marketing', 'gallery intro'],
  type: 'page',
  isReady: true,
  category: 'Gallery - Side',
  slots: [
    {
      name: 'copy',
      kind: 'content',
      description:
        'Left column of the split grid: eyebrow label, h1 headline, supporting text, and the primary Explore button.',
    },
    {
      name: 'stats',
      kind: 'metrics',
      description:
        'Left column bottom, under the divider: a row of three StatBlock headline numbers with labels.',
    },
    {
      name: 'gallery',
      kind: 'list',
      description:
        'Right column of the split grid: ImageGrid collage of square images in a three-column grid.',
    },
  ],
};

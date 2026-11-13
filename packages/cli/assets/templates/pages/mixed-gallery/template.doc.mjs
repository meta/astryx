// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  name: 'Mixed Gallery',
  displayName: 'Mixed Gallery',
  description:
    'Masonry grid of variable-height tiles that pack against each other instead of cropping to a shared ratio, captioned per tile. Irregular rhythm, unlike the uniform gallery.',
  keywords: [
    'photos',
    'images',
    'pictures',
    'portfolio',
    'masonry',
    'media wall',
  ],
  type: 'page',
  isReady: true,
  category: 'Gallery - Mixed',
  slots: [
    {
      name: 'header',
      kind: 'header',
      description:
        'Centered heading and intro text at the top of the content column, above the gallery.',
    },
    {
      name: 'gallery',
      kind: 'list',
      description:
        'Masonry grid below the header: a wide hero tile, a side tile, and a row of three image tiles.',
    },
  ],
};

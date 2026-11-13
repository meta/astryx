// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  name: 'Classic Gallery',
  displayName: 'Classic Gallery',
  description:
    'Uniform grid of equal-ratio media tiles under a centered intro, with filter tabs that narrow the set in place. Regular rhythm, unlike the variable-height masonry variant.',
  keywords: ['gallery', 'photos', 'images', 'pictures', 'portfolio index'],
  type: 'page',
  isReady: true,
  category: 'Gallery - Basic',
  slots: [
    {
      name: 'intro',
      kind: 'header',
      description:
        'Centered section at top with the page heading and supporting body text.',
    },
    {
      name: 'filters',
      kind: 'toolbar',
      description:
        'Category tab list under the intro text that narrows the gallery tiles in place.',
    },
    {
      name: 'gallery',
      kind: 'list',
      description:
        'Uniform responsive grid of equal-ratio 3:2 image tiles below the intro, showing the filtered set.',
    },
  ],
};

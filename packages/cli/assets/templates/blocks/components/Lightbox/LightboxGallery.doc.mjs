// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'block',
  exampleFor: 'Lightbox',
  name: 'Lightbox — Gallery',
  displayName: 'Lightbox — Gallery',
  description:
    'A thumbnail grid that opens a fullscreen gallery. Clicking any thumbnail opens the lightbox at that index. Prev/next navigation lets users browse all images without closing.',
  isReady: true,
  aspectRatio: 4 / 3,
  componentsUsed: ['Lightbox', 'Grid', 'Thumbnail'],
  fits: ['list', 'overlay'],
};

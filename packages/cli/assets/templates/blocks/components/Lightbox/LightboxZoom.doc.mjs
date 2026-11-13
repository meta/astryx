// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'block',
  exampleFor: 'Lightbox',
  name: 'Lightbox — Zoom',
  displayName: 'Lightbox — Zoom',
  description:
    'A lightbox with zoom and pan enabled. Double-click the image to zoom in; drag to pan around. Double-click again or use the close button to exit.',
  isReady: true,
  aspectRatio: 4 / 3,
  componentsUsed: ['Lightbox', 'Thumbnail'],
  fits: ['overlay', 'inline'],
};

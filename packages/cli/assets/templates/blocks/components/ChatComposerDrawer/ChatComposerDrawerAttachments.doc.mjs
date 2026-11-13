// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'block',
  exampleFor: 'ChatComposerDrawer',
  name: 'ChatComposerDrawer — Attachments',
  displayName: 'ChatComposerDrawer — Attachments',
  description: 'Drawer with two rows: a scrollable carousel of image thumbnails and a row of removable file tokens. Omit count to keep the drawer always expanded.',
  isReady: true,
  aspectRatio: 16 / 9,
  componentsUsed: ['Chat', 'Token', 'Thumbnail', 'Carousel', 'Layout'],
  fits: ['chat'],
};

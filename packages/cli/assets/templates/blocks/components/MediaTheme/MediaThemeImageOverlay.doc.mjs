// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'block',
  exampleFor: 'MediaTheme',
  name: 'MediaTheme — Image Overlay',
  displayName: 'MediaTheme — Image Overlay',
  description:
    'A common image card pattern: place text and actions over a dark gradient and wrap the overlay content in MediaTheme mode="dark".',
  isReady: true,
  aspectRatio: 16 / 9,
  componentsUsed: [
    'MediaTheme',
    'AspectRatio',
    'Button',
    'Section',
    'Layout',
    'Text',
  ],
  fits: ['content', 'list'],
};

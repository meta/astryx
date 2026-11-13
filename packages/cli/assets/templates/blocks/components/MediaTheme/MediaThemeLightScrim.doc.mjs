// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'block',
  exampleFor: 'MediaTheme',
  name: 'MediaTheme — Light Scrim',
  displayName: 'MediaTheme — Light Scrim',
  description:
    'A light scrim over an image. Use MediaTheme mode="light" so text and ghost buttons use dark-on-light tokens.',
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

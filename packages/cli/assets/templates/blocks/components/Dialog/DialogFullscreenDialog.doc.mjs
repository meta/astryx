// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'block',
  exampleFor: 'Dialog',
  name: 'Dialog — Fullscreen',
  displayName: 'Dialog — Fullscreen',
  description:
    'Takes over the entire viewport for content that needs maximum space. Use for documentation viewers, rich text editors, multi-step wizards, or media previews where the standard dialog width is too narrow.',
  isReady: true,
  aspectRatio: 16 / 9,
  componentsUsed: ['Dialog', 'Layout', 'Button', 'Text', 'Card'],
  fits: ['overlay', 'content'],
};

// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'block',
  exampleFor: 'HoverCard',
  alsoShowcaseFor: ['useHoverCard'],
  name: 'HoverCard',
  displayName: 'Hover Card',
  description:
    'A hover card that shows a user profile preview when hovering over a trigger button. Starts open for preview.',
  isReady: true,
  isShowcase: true,
  aspectRatio: 1,
  componentsUsed: ['HoverCard', 'Button', 'Layout', 'Text', 'Avatar'],
  fits: ['overlay', 'inline'],
};

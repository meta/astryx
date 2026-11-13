// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'block',
  exampleFor: 'ClickableCard',
  name: 'ClickableCard',
  displayName: 'Clickable Card',
  description:
    'A clickable card that navigates on click. Nested interactive elements work independently.',
  isReady: true,
  isShowcase: true,
  aspectRatio: 1,
  componentsUsed: ['ClickableCard', 'Layout', 'Text'],
  fits: ['list', 'navigation'],
};

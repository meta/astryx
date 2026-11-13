// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'block',
  exampleFor: 'ClickableCard',
  name: 'ClickableCardWithNestedButton',
  displayName: 'Clickable Card — Nested Button',
  description:
    'A product card that navigates on click but has an independent "Add to cart" button inside.',
  isReady: true,
  aspectRatio: 1,
  componentsUsed: ['ClickableCard', 'Button', 'Layout', 'Text'],
  fits: ['list'],
};

// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'block',
  exampleFor: 'Toolbar',
  name: 'Toolbar — Card Header',
  displayName: 'Toolbar — Card Header',
  description:
    'A toolbar as a card header with a left-aligned title and icon actions on the right. Use Toolbar instead of LayoutHeader when your card header has interactive actions; Toolbar adds start/end slot layout, keyboard navigation, and automatic size cascading. If the header is just a title with no actions, a LayoutHeader or Section is enough.',
  isReady: true,
  aspectRatio: 16 / 9,
  componentsUsed: ['Toolbar', 'Button', 'Icon', 'Text', 'Card', 'Section'],
};

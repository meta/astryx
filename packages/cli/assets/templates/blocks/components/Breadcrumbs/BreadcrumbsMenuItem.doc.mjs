// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'block',
  exampleFor: 'Breadcrumbs',
  name: 'Breadcrumbs — Menu item',
  displayName: 'Breadcrumbs — Menu item',
  description:
    'Give a mid-trail crumb a `menu` prop to turn it into a menu trigger for switching between sibling destinations. It reuses the same item API as DropdownMenu, so an existing option array (or composed item children) drops in verbatim.',
  isReady: true,
  aspectRatio: 16 / 9,
  componentsUsed: ['Breadcrumbs'],
  fits: ['navigation', 'header'],
};

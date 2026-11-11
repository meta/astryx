// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'block',
  exampleFor: 'useInteractiveRole',
  name: 'useInteractiveRole — One Tile, Four Roles',
  displayName: 'useInteractiveRole — One Tile, Four Roles',
  description:
    'A polymorphic Tile used four ways: with an href it renders as a link, with an onClick as a button, with neither as plain content, and placed as a Popover trigger it becomes the trigger button through context — the resolution order in one place.',
  isReady: true,
  aspectRatio: 4 / 3,
  componentsUsed: ['Popover', 'Card', 'Text', 'Layout', 'Link'],
};

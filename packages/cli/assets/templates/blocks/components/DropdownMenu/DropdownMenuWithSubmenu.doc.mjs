// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'block',
  exampleFor: 'DropdownMenu',
  name: 'DropdownMenu — Submenu',
  displayName: 'DropdownMenu — Submenu',
  description:
    'Action menu with a nested submenu. Hover or Right arrow opens the flyout; Left arrow / Escape closes it. Use to group related destinations or secondary actions without crowding the top level.',
  isReady: true,
  aspectRatio: 16 / 9,
  componentsUsed: ['DropdownMenu', 'Layout', 'Text'],
  fits: ['overlay', 'toolbar'],
};

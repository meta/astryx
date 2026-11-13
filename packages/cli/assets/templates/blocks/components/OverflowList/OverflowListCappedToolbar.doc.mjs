// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'block',
  exampleFor: 'OverflowList',
  name: 'OverflowList — Capped Toolbar',
  displayName: 'OverflowList — Capped Toolbar',
  description:
    'maxVisibleItems caps the row at three actions even when more would fit; the rest move to a dropdown',
  isReady: true,
  aspectRatio: 4 / 3,
  componentsUsed: ['OverflowList', 'Button', 'DropdownMenu', 'Card', 'Center'],
  fits: ['toolbar'],
};

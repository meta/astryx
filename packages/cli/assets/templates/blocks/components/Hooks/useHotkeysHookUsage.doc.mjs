// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'block',
  exampleFor: 'useHotkeys',
  name: 'useHotkeys — Search and Help Shortcuts',
  displayName: 'useHotkeys — Search and Help Shortcuts',
  description:
    'Page shortcuts registered with useHotkeys: "/" focuses the search field and "?" opens the shortcut help, while typing either character in the field just types it. A switch turns the single-key shortcuts off through isDisabled.',
  isReady: true,
  aspectRatio: 4 / 3,
  componentsUsed: [
    'Card',
    'TextInput',
    'Button',
    'Switch',
    'Dialog',
    'Kbd',
    'Text',
    'Layout',
  ],
};

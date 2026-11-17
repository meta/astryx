// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'block',
  exampleFor: 'useClipboard',
  name: 'useClipboard — Share Link',
  displayName: 'useClipboard — Share Link',
  description:
    'A share card that copies its invite link with useClipboard: the Copy button reads "Copied" while isCopied is true, a screen reader hears "Link copied", and a second press restarts the reset timer.',
  isReady: true,
  aspectRatio: 4 / 3,
  componentsUsed: ['Card', 'Button', 'TextInput', 'Text', 'Layout'],
};

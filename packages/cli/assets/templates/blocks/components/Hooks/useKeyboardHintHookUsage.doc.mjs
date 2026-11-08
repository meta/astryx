// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'block',
  exampleFor: 'useKeyboardHint',
  name: 'useKeyboardHint — Arrow-key Hint',
  displayName: 'useKeyboardHint — Arrow-key Hint',
  description:
    'A custom five-star rating with one Tab stop calls useKeyboardHint directly: tabbing into it shows a "← → to navigate" hint, the first arrow press dismisses it, and tabbing back in does not show it again.',
  isReady: true,
  aspectRatio: 16 / 9,
  componentsUsed: ['Button', 'Icon', 'Card', 'Layout'],
  icons: {StarIcon: 'star'},
};

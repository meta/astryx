// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'block',
  exampleFor: 'VisuallyHidden',
  name: 'VisuallyHidden — Supplementary Context',
  displayName: 'VisuallyHidden — Supplementary Context',
  description:
    'Stat cards whose trend arrows get screen-reader-only text, so a change like +12% is read as an increase from last month. Use to make terse visual data accessible.',
  isReady: true,
  aspectRatio: 4 / 3,
  componentsUsed: [
    'VisuallyHidden',
    'Card',
    'HStack',
    'VStack',
    'Text',
    'Icon',
  ],
  icons: {ArrowDownIcon: 'arrowDown', ArrowUpIcon: 'arrowUp'},
};

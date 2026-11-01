// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'block',
  exampleFor: 'BottomSheetSwitcher',
  alsoExampleFor: ['BottomSheet'],
  // The published registry identity predates the rewrite; keep it.
  registry: {slug: 'default'},
  name: 'Bottom Sheet — Multi-step flow',
  displayName: 'Bottom Sheet — Multi-step flow',
  description:
    'A three-step flow of standalone sheets of different heights, driven by one state value: moving on replaces the open step in place. This is the replacement for the deprecated BottomSheetSwitcher.',
  isReady: true,
  isShowcase: true,
  aspectRatio: 3 / 4,
  componentsUsed: [
    'BottomSheet',
    'Button',
    'CheckboxInput',
    'Divider',
    'Heading',
    'RadioList',
    'Section',
    'Stack',
    'Text',
  ],
};

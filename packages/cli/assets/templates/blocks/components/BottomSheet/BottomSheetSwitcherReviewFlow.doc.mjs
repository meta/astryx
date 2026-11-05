// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'block',
  exampleFor: 'BottomSheetSwitcher',
  alsoExampleFor: ['BottomSheet'],
  // The published registry identity predates the rewrite; keep it.
  registry: {slug: 'review-flow'},
  name: 'Bottom Sheet — Review flow',
  displayName: 'Bottom Sheet — Review flow',
  description:
    'A two-step form flow of two standalone sheets driven by one state value: Continue replaces the review step with the confirmation in place, and Back returns.',
  isReady: true,
  isShowcase: false,
  aspectRatio: 3 / 4,
  componentsUsed: [
    'BottomSheet',
    'Button',
    'Heading',
    'Section',
    'Stack',
    'Text',
  ],
};

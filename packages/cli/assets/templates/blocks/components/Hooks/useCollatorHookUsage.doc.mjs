// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'block',
  exampleFor: 'useCollator',
  name: 'useCollator — Locale-aware Name Sort',
  displayName: 'useCollator — Locale-aware Name Sort',
  description:
    'A list of names sorted with the compare function from useCollator: accented and lowercase names land where a reader expects, and switching the provider locale to Swedish moves Å and Ö after Z.',
  isReady: true,
  aspectRatio: 4 / 3,
  componentsUsed: [
    'InternationalizationProvider',
    'Card',
    'SegmentedControl',
    'List',
    'Layout',
  ],
};

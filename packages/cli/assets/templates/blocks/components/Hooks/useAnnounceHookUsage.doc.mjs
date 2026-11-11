// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'block',
  exampleFor: 'useAnnounce',
  name: 'useAnnounce — Filter Result Count',
  displayName: 'useAnnounce — Filter Result Count',
  description:
    'A product filter that announces its result count with useAnnounce: once typing pauses for 500 ms, a screen reader hears "3 results" or "No results". The count has its own hasReplace instance, as the hook\'s docs advise for a changing value.',
  isReady: true,
  aspectRatio: 4 / 3,
  componentsUsed: ['Card', 'TextInput', 'List', 'Text', 'Layout'],
};

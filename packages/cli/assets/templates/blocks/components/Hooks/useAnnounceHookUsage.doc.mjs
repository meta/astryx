// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'block',
  exampleFor: 'useAnnounce',
  name: 'useAnnounce — Filter Result Count',
  displayName: 'useAnnounce — Filter Result Count',
  description:
    'A product filter that announces its result count with useAnnounce: once typing pauses, a screen reader hears "3 results" or "No results", and a hasReplace instance keeps only the latest count.',
  isReady: true,
  aspectRatio: 4 / 3,
  componentsUsed: ['Card', 'TextInput', 'List', 'Text', 'Layout'],
};

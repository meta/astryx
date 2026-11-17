// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'block',
  exampleFor: 'useTypeahead',
  name: 'useTypeahead — Type to Focus a Country',
  displayName: 'useTypeahead — Type to Focus a Country',
  description:
    'A country list of buttons with useListFocus arrow keys and useTypeahead type-to-focus. Typing "can" focuses Canada, pressing "b" again and again cycles through Belgium, Brazil and Bulgaria, and "e" finds Éire with the accent ignored. The hook only reports the match through onMatch, and useListFocus moves focus.',
  isReady: true,
  aspectRatio: 4 / 3,
  componentsUsed: ['Button', 'Text', 'Layout'],
};

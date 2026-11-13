// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'block',
  exampleFor: 'Table',
  alsoExampleFor: ['useTableColumnSettings'],
  alsoShowcaseFor: ['useTableColumnSettings'],
  name: 'Table — Column Settings',
  displayName: 'Table — Column Settings',
  description:
    'Table with a column visibility picker in the toolbar. Toggle columns on and off.',
  isReady: true,
  aspectRatio: 16 / 9,
  componentsUsed: ['Table', 'MultiSelector', 'Toolbar', 'Text', 'Layout'],
  fits: ['table', 'toolbar'],
};

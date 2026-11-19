// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'block',
  exampleFor: 'ToggleButtonGroup',
  name: 'ToggleButton — Group',
  displayName: 'ToggleButton — Group',
  description: 'Toggle button groups in single-select and multi-select modes. Single selection acts as a view mode switcher; multiple selection forms a formatting toolbar.',
  isReady: true,
  aspectRatio: 16 / 9,
  componentsUsed: [
    'ToggleButton',
    'ToggleButtonGroup',
    'Layout',
    'Text',
    'Icon',
  ],
  icons: {
    BoldIcon: 'bold',
    ItalicIcon: 'italic',
    ListBulletIcon: 'list',
    Squares2X2Icon: 'gridView',
    StrikethroughIcon: 'strikethrough',
    TableCellsIcon: 'table',
    UnderlineIcon: 'underline',
  },
};

// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'block',
  exampleFor: 'useTableColumnSettingsState',
  name: 'useTableColumnSettingsState — Checkbox Columns Menu',
  displayName: 'useTableColumnSettingsState — Checkbox Columns Menu',
  description:
    'A Table toolbar with a Columns menu of checkboxes over the headless state: unchecking Email hides the column, the always-visible Name stays checked and locked, Reset to default restores the saved set, and columnSettingsConfig feeds useTableColumnSettings.',
  isReady: true,
  aspectRatio: 4 / 3,
  componentsUsed: [
    'Table',
    'Toolbar',
    'Popover',
    'CheckboxInput',
    'Button',
    'Layout',
    'Text',
  ],
};

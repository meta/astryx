// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'block',
  exampleFor: 'Toolbar',
  alsoExampleFor: ['OverflowList'],
  name: 'Toolbar — Table Filter',
  displayName: 'Toolbar — Table Filter',
  description:
    'Filter bar above a table: a search box leads the row, each field beside it is a closed trigger that doubles as its own filter chip — the bare field name unset, the whole clause once set — and the clauses fold from the end into a count as the row narrows, followed by a live result count, a clear all, and a column picker. Use to search, filter, and narrow flat rows of records such as jobs, orders, tickets, or users.',
  isReady: true,
  aspectRatio: 16 / 7,
  componentsUsed: [
    'Toolbar',
    'Selector',
    'TextInput',
    'OverflowList',
    'Popover',
    'Button',
    'Icon',
    'Link',
    'Text',
    'CheckboxList',
    'Layout',
    'Section',
    'Table',
    'EmptyState',
  ],
};

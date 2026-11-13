// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'page',
  name: 'Simple Table',
  displayName: 'Simple Table',
  description:
    'Flat row collection where columns sort, rows select into a bulk-action toolbar, and each row carries an overflow menu. Sortable but ungrouped, with no detail pane, the baseline shape.',
  keywords: [
    'table',
    'list',
    'rows',
    'records',
    'grid',
    'spreadsheet',
    'roster',
  ],
  isReady: false,
  category: 'Table - Basic',
  isHiddenFromOverview: true,
  slots: [
    {
      name: 'header',
      kind: 'header',
      description:
        'Top layout header with the page title text and the primary add-item button.',
    },
    {
      name: 'table',
      kind: 'table',
      description:
        'Main layout content area holding the table of item records with status badges and per-row actions.',
    },
  ],
};

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
  isReady: true,
  category: 'Table - Basic',
  isHiddenFromOverview: true,
  icons: {
    ArrowDownTrayIcon: 'download',
    DocumentDuplicateIcon: 'copy',
    EllipsisHorizontalIcon: 'moreHorizontal',
    EnvelopeIcon: 'mail',
    NoSymbolIcon: 'error',
    PencilIcon: 'edit',
    TrashIcon: 'delete',
    UserPlusIcon: 'userAdd',
  },
};

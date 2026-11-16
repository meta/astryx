// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'page',
  name: 'Lookup',
  displayName: 'Lookup',
  description:
    'Single-purpose lookup: a header search bar with a "look up by" field picker finds a record by ID, email or name, then shows its matches as a list beside the selected record on wide screens (on narrow screens, the list first, then the record), with overview, activity and raw-data tabs. Starts from an empty state with recent lookups, and jumps straight to the record when only one matches.',
  keywords: [
    'lookup',
    'order lookup',
    'find by ID',
    'search by email',
    'match list',
    'master-detail',
    'record inspector',
    'recent searches',
    'activity history',
    'raw JSON',
  ],
  isReady: false,
  category: 'Tools - Search Results Page',
  icons: {
    ArrowLeftIcon: 'arrowLeft',
    ArrowTopRightOnSquareIcon: 'externalLink',
    DocumentDuplicateIcon: 'copy',
    MagnifyingGlassIcon: 'search',
    XMarkIcon: 'close',
  },
};

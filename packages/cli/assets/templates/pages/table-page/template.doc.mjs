// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'page',
  name: 'Searchable Table',
  displayName: 'Searchable Table',
  description:
    'Flat table of uniform rows under a block of record-level facts, narrowed three ways at once — a full-text search box, a scope toggle, and per-column popovers — with sortable and filterable columns, per-row hover detail, and totals derived from the visible rows that flag themselves as partial while a filter is on. The shape for one homogeneous list, not nested rows or groups with their own columns.',
  keywords: [
    'search',
    'filter',
    'sort',
    'table',
    'flat rows',
    'records',
    'dataset',
    'totals',
    'roster',
    'inventory',
    'assets',
    'registry',
    'lookup',
    'report table',
    'numeric columns',
    'pagination',
    'csv export',
  ],
  isReady: true,
  category: 'Table - Basic',
  icons: {ArrowDownTrayIcon: 'download', MagnifyingGlassIcon: 'search'},
};

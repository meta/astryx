// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */

export const docs = {
  name: 'useTableTreeState',
  subComponentOf: 'Table',
  displayName: 'useTableTreeState',
  description:
    'State management companion for useTableTreeData. Owns the expanded set (controlled or uncontrolled) and flattens nested data into the visible row array; collapsed subtrees are unmounted, not hidden, so the table body contains exactly the visible rows. Returns expandAll/collapseAll helpers, the aggregate isAllExpanded state (true/false/indeterminate) for a header expand-all control, and a ready-to-use config for the tree plugin. Note: because collapsed rows unmount, cell-local React state inside collapsed subtrees is lost on collapse; lift state that must survive.',
  props: [
    {
      name: 'data',
      type: 'T[]',
      description:
        'Nested data: rows may carry child rows under childrenKey. Flat data (no children anywhere) makes the plugin a no-op, so it can be adopted before the data becomes hierarchical.',
      required: true,
    },
    {
      name: 'idKey',
      type: '(keyof T & string) | ((item: T) => string | number)',
      description:
        'Row ID accessor: property name or function returning a unique id.',
      required: true,
    },
    {
      name: 'childrenKey',
      type: 'string',
      description: 'Property holding each row\'s children array.',
      default: "'children'",
    },
    {
      name: 'defaultExpandedIds',
      type: 'Iterable<string>',
      description:
        'Initial expanded row ids for uncontrolled mode. Ignored when expandedIds is provided.',
    },
    {
      name: 'expandedIds',
      type: 'ReadonlySet<string>',
      description:
        'Controlled set of expanded row ids. Pair with onExpandedIdsChange.',
    },
    {
      name: 'onExpandedIdsChange',
      type: '(ids: ReadonlySet<string>) => void',
      description:
        'Called with the next expanded set whenever expansion changes (both modes). In lazy-loading setups, trigger the children fetch here.',
    },
    {
      name: 'isItemExpandable',
      type: '(item: T) => boolean',
      description:
        'Should this row show an expander? Overrides the default non-empty-children check; use for lazy loading, where a row is expandable before its children have been fetched.',
    },
    {
      name: 'sortSiblings',
      type: '(siblings: T[]) => T[]',
      description:
        'Sort each sibling group independently during flattening; children always stay directly under their parent. Pass applySort from useTableSortableState to compose with column sorting.',
    },
    {
      name: 'indent',
      type: "'sm' | 'md' | 'lg'",
      description:
        'Indent step per level (spacing-3 / spacing-4 / spacing-6), forwarded to useTableTreeData.',
      default: "'md'",
    },
    {
      name: 'treeColumnKey',
      type: 'string',
      description:
        'Column that carries the indent + expander, forwarded to useTableTreeData. Defaults to the first column.',
    },
  ],
};

export const docsDense = {
  name: 'useTableTreeState',
  displayName: 'useTableTreeState',
  description:
    'State companion for useTableTreeData. Owns expanded set (controlled or uncontrolled), flattens nested data to visible rows (collapsed subtrees unmounted, not hidden). Returns {visibleData, treeConfig, expandedIds, isAllExpanded, expandAll, collapseAll} (isAllExpanded = true/false/indeterminate for a header expand-all control). Cell-local state in collapsed subtrees is lost on collapse; lift state that must survive.',
  propDescriptions: {
    data: 'nested data; rows carry child rows under childrenKey. Flat data => plugin is a no-op.',
    idKey: 'row ID accessor: property name or fn returning unique id',
    childrenKey: "property holding children array. Defaults to 'children'.",
    defaultExpandedIds: 'initial expanded ids (uncontrolled)',
    expandedIds: 'controlled expanded set; pair with onExpandedIdsChange',
    onExpandedIdsChange:
      'called with next expanded set on change (both modes); trigger lazy children fetch here',
    isItemExpandable:
      'overrides non-empty-children expandability check (lazy loading)',
    sortSiblings:
      'sorts each sibling group during flattening; pass applySort from useTableSortableState',
    indent: "indent step per level: 'sm' | 'md' | 'lg'. Defaults to 'md'.",
    treeColumnKey: 'column carrying indent + expander. Defaults to first column.',
  },
};

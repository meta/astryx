// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */

export const docs = {
  name: 'useTableTreeData',
  subComponentOf: 'Table',
  displayName: 'useTableTreeData',
  description:
    'Headless tree plugin for Table: renders nested rows with per-level indentation and expand/collapse chevrons in the tree column (the first column by default), and reflects hierarchy on body rows via aria-level and aria-expanded. Composable with the other Table plugins: the canonical plugin order places tree before selection, so the checkbox column lands left of the indented tree column. Feed it the treeConfig from useTableTreeState, or construct the config directly for server-driven or pre-flattened trees. When no row is expandable (flat data), every transform is a pass-through and the table renders identically to one without the plugin. Known limitation: the tree column wraps its cell content, so textOverflow="truncate" tooltips do not apply within the tree column.',
  props: [
    {
      name: 'getRowMeta',
      type: '(item: T) => TableTreeRowMeta | undefined',
      description:
        'Structural meta for a visible row: {id, level (0-based), hasChildren, isExpanded}.',
      required: true,
    },
    {
      name: 'onToggleItem',
      type: '(item: T) => void',
      description: 'Toggle a row\'s expansion.',
      required: true,
    },
    {
      name: 'hasExpandableRows',
      type: 'boolean',
      description:
        'Whether any row in the dataset is expandable. When false the plugin is a no-op: no expanders, no indent, no tree ARIA.',
      required: true,
    },
    {
      name: 'hasExpandAllControl',
      type: 'boolean',
      description:
        'Show an expand-all/collapse-all toggle in the tree column header. Requires isAllExpanded plus onExpandAll/onCollapseAll (all supplied by useTableTreeState).',
      default: 'false',
    },
    {
      name: 'isAllExpanded',
      type: "boolean | 'indeterminate'",
      description:
        'Aggregate expansion state across every expandable row, driving the header expand-all toggle. true when all are expanded, false when none are, indeterminate when some are.',
    },
    {
      name: 'onExpandAll',
      type: '() => void',
      description: 'Expand every expandable row. Wired to the header control.',
    },
    {
      name: 'onCollapseAll',
      type: '() => void',
      description: 'Collapse every row. Wired to the header control.',
    },
    {
      name: 'indent',
      type: "'sm' | 'md' | 'lg'",
      description:
        'Indent step per level, mapped to the spacing-3 / spacing-4 / spacing-6 tokens.',
      default: "'md'",
    },
    {
      name: 'treeColumnKey',
      type: 'string',
      description:
        'Column that carries the indent + expander. Defaults to the first column.',
    },
    {
      name: 'hasRowClickExpansion',
      type: 'boolean',
      description:
        'When true, clicking anywhere on an expandable row toggles its expansion, in addition to the chevron. A pointer-only convenience: keyboard and assistive-tech users toggle via the chevron button. Clicks on interactive cell content (buttons, links, form controls) or a text selection do not toggle. Leaf rows stay inert, and it is a no-op on flat data.',
      default: 'false',
    },
  ],
  examples: [
    {
      label: 'File tree with expandable folders',
      code: `const {visibleData, treeConfig} = useTableTreeState({
  data: files,          // rows may nest under 'children'
  idKey: 'id',
  defaultExpandedIds: ['src'],
});
const tree = useTableTreeData(treeConfig);

<Table data={visibleData} columns={columns} idKey="id" plugins={{tree}} />;`,
    },
  ],
};

export const docsDense = {
  name: 'useTableTreeData',
  displayName: 'useTableTreeData',
  description:
    'Headless tree plugin: indent + expander chevron on the tree column (first column by default), aria-level/aria-expanded on body rows. Canonical plugin order puts tree before selection (checkbox column lands left of tree column). Consume treeConfig from useTableTreeState, or construct directly for server-driven trees. hasExpandableRows=false => full no-op (flat-data migration).',
  propDescriptions: {
    getRowMeta:
      'structural meta per visible row: {id, level (0-based), hasChildren, isExpanded}',
    onToggleItem: 'toggle row expansion',
    hasExpandableRows: 'false => plugin is a no-op (no expanders/indent/ARIA)',
    indent:
      "indent step per level: 'sm' | 'md' | 'lg' (spacing-3/4/6). Defaults to 'md'.",
    treeColumnKey: 'column carrying indent + expander. Defaults to first column.',
    hasExpandAllControl:
      'show expand-all/collapse-all toggle in tree column header. Needs isAllExpanded + onExpandAll/onCollapseAll (from useTableTreeState). Defaults to false.',
    isAllExpanded:
      "aggregate state driving the header toggle: true (all) | false (none) | 'indeterminate' (some).",
    onExpandAll: 'expand every expandable row (header control)',
    onCollapseAll: 'collapse every row (header control)',
    hasRowClickExpansion:
      'true => clicking an expandable row body toggles it (in addition to the chevron). Leaves stay inert; no-op on flat data. Defaults to false.',
  },
};

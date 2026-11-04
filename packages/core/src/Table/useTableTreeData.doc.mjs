// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */

export const docs = {
  name: 'useTableTreeData',
  subComponentOf: 'Table',
  displayName: 'useTableTreeData',
  description:
    'Headless tree plugin for Table: renders nested rows with per-level indentation and expand/collapse chevrons in the tree column (the first column by default). When any row is expandable the table is a WAI-ARIA treegrid: role="treegrid" on the table, and every body row carries aria-level, aria-expanded (parents only), aria-posinset and aria-setsize. Keyboard, with row focus, follows the APG treegrid pattern: the visible rows share one roving tab stop, which follows focus onto a row (arrow keys, a click, programmatic focus); ArrowUp/ArrowDown move between rows, ArrowRight expands a collapsed row, ArrowLeft collapses an expanded row, Home/End jump to the first/last row, and Enter/Space toggle an expandable row. ArrowRight on an expanded row and ArrowLeft on a collapsed or leaf row keep focus on the row: the treegrid pattern never uses them to jump to a child or parent row (ArrowRight would enter the row\'s first cell, and there are no cell stops yet), so ArrowUp/ArrowDown reach those. Left/Right follow the reading direction under RTL. Tab order: the scroll region (a stop only while the table overflows horizontally, as the keyboard path for horizontal scrolling, since Left/Right belong to the rows), then the header controls (expand-all toggle, sort headers), then the in-cell controls (the chevron, a selection checkbox) and the one active row in DOM order, then out of the table. Focusing a control inside a cell leaves the row stop where it is, and the controls keep their own keys. A handler passed to Table for an event the plugin handles (onKeyDown, onFocus) runs first and composes with it (event.preventDefault() opts that event out of the row model); a role passed to Table is ignored while the table is a treegrid, with a development warning. This first version is row focus only: cell-by-cell navigation is not implemented, and a composition that needs it (editable cells, per-cell actions reached by arrow keys) is outside the supported contract. Composable with the other Table plugins: the canonical plugin order places tree before selection, so the checkbox column lands left of the indented tree column. Feed it the treeConfig from useTableTreeState, or construct the config directly for server-driven or pre-flattened trees. When no row is expandable (flat data), every transform is a pass-through and the table renders identically to one without the plugin. Known limitation: the tree column wraps its cell content, so textOverflow="truncate" tooltips do not apply within the tree column.',
  props: [
    {
      name: 'getRowMeta',
      type: '(item: T) => TableTreeRowMeta | undefined',
      description:
        'Structural meta for a visible row: {id, level (0-based), hasChildren, isExpanded, posInSet?, setSize?}. posInSet (1-based) and setSize describe the row\'s sibling group as rendered and feed aria-posinset/aria-setsize; useTableTreeState supplies them, and a hand-built config may omit them (the row then carries neither attribute).',
      required: true,
    },
    {
      name: 'onToggleItem',
      type: '(item: T) => void',
      description: "Toggle a row's expansion.",
      required: true,
    },
    {
      name: 'getRowLabel',
      type: '(item: T) => string',
      description:
        'Derive a human-readable row identity for the expander. Astryx combines it with localized expand/collapse wording. Omit it, or return blank text, to keep the generic "Expand row" and "Collapse row" labels.',
    },
    {
      name: 'hasExpandableRows',
      type: 'boolean',
      description:
        'Whether any row in the dataset is expandable. When false the plugin is a no-op: no expanders, no indent, no treegrid role, no row ARIA, no keyboard model.',
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
        'When true, clicking anywhere on an expandable row toggles its expansion, in addition to the chevron. A pointer-only convenience: a keyboard user toggles a focused row with ArrowRight/ArrowLeft or Enter, and the chevron button stays the accessible control for everyone. Clicks on interactive cell content (buttons, links, form controls) or a text selection do not toggle. Leaf rows stay inert, and it is a no-op on flat data.',
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
const tree = useTableTreeData({
  ...treeConfig,
  getRowLabel: item => item.name,
});

<Table data={visibleData} columns={columns} idKey="id" plugins={{tree}} />;`,
    },
  ],
  usage: {
    description:
      'Treegrid semantics and the row-focus keyboard model switch on only when the data has expandable rows, so adopting the plugin ahead of hierarchical data changes nothing. With expandable rows the table takes one Tab stop for its rows, at the active row\'s place in DOM order; arrow keys do the rest.',
    bestPractices: [
      {guidance: true, description: 'Leave the controls inside cells (chevron, selection checkbox, sort header) as they are: they stay Tab-reachable in DOM order around the one row stop, and their own keys are never intercepted.'},
      {guidance: true, description: 'Query the table as role="treegrid" in tests once rows are expandable; the native table role remains only for flat data.'},
      {guidance: false, description: 'Rely on cell-by-cell arrow navigation. This version is row focus only; a composition that needs cell navigation is outside the supported contract and should not claim it.'},
    ],
  },
};

export const docsDense = {
  name: 'useTableTreeData',
  displayName: 'useTableTreeData',
  description:
    'Headless tree plugin: indent + expander chevron on the tree column (first column by default). Expandable rows => WAI-ARIA treegrid: role="treegrid" on the table; body rows carry aria-level, aria-expanded (parents), aria-posinset/aria-setsize. Keyboard (row focus, APG treegrid): rows share one roving tab stop that follows focus onto a row (keys, click, programmatic); ArrowUp/Down move rows, ArrowRight expand, ArrowLeft collapse, Home/End, Enter/Space toggle. ArrowRight on expanded / ArrowLeft on collapsed or leaf => focus stays (no jump to child/parent; no cell stops yet). RTL flips Left/Right. Tab order: scroll region (only while overflowing inline; horizontal-scroll path) -> header controls (expand-all, sort) -> in-cell controls + the one active row in DOM order -> out. Focusing an in-cell control leaves the row stop; controls keep own keys. Table onKeyDown/onFocus compose w/ the plugin (caller first; preventDefault opts out); Table role ignored while treegrid (dev warning). v1 = row focus only; no cell navigation (compositions needing it unsupported). Canonical plugin order puts tree before selection (checkbox column lands left of tree column). Consume treeConfig from useTableTreeState, or construct directly for server-driven trees. hasExpandableRows=false => full no-op (flat-data migration).',
  propDescriptions: {
    getRowMeta:
      'structural meta per visible row: {id, level (0-based), hasChildren, isExpanded, posInSet?, setSize?} (posInSet 1-based + setSize => aria-posinset/aria-setsize; supplied by useTableTreeState, omit in hand-built configs => no attrs)',
    onToggleItem: 'toggle row expansion',
    getRowLabel:
      'derive a row identity for the localized expand/collapse accessible name. Blank or omitted values keep the generic row label.',
    hasExpandableRows:
      'false => plugin is a no-op (no expanders/indent/treegrid role/row ARIA/keyboard model)',
    indent:
      "indent step per level: 'sm' | 'md' | 'lg' (spacing-3/4/6). Defaults to 'md'.",
    treeColumnKey:
      'column carrying indent + expander. Defaults to first column.',
    hasExpandAllControl:
      'show expand-all/collapse-all toggle in tree column header. Needs isAllExpanded + onExpandAll/onCollapseAll (from useTableTreeState). Defaults to false.',
    isAllExpanded:
      "aggregate state driving the header toggle: true (all) | false (none) | 'indeterminate' (some).",
    onExpandAll: 'expand every expandable row (header control)',
    onCollapseAll: 'collapse every row (header control)',
    hasRowClickExpansion:
      'true => clicking an expandable row body toggles it (in addition to the chevron); keyboard: ArrowRight/ArrowLeft or Enter on the focused row. Leaves stay inert; no-op on flat data. Defaults to false.',
  },
  usage: {
    description:
      'Treegrid semantics + row-focus keyboard model switch on only w/ expandable rows (flat data unchanged). Expandable rows => one Tab stop for rows (at the active row\'s DOM position); arrows do the rest.',
    bestPractices: [
      {guidance: true, description: 'Leave in-cell controls (chevron, checkbox, sort header) as is: Tab-reachable in DOM order around the row stop; own keys never intercepted.'},
      {guidance: true, description: 'Query role="treegrid" in tests once rows are expandable; native table role only for flat data.'},
      {guidance: false, description: 'Rely on cell-by-cell arrow navigation: v1 = row focus only; compositions needing cell nav are outside the supported contract.'},
    ],
  },
};

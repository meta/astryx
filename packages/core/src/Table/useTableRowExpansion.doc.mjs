// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */

export const docs = {
  name: 'useTableRowExpansion',
  subComponentOf: 'Table',
  displayName: 'useTableRowExpansion',
  description:
    'Hook that returns a TablePlugin which expands a full-width detail panel below a row, rendered by the consumer via renderExpanded(item). Adds a leading chevron column and a right-click "Expand/Collapse row" action; the consumer owns the expandedKeys set. The panel spans the row but starts its content at the first column, past the chevron, so detail lines up with the labels above it; the inset follows the table density. Use it for master-detail rows (order details, forms, charts, nested tables). For hierarchical data where child rows reuse the parent columns, use useTableTreeData + useTableTreeState instead.',
  props: [
    {
      name: 'expandedKeys',
      type: 'Set<string>',
      description: 'Set of currently-expanded row keys. Consumer-owned.',
      required: true,
    },
    {
      name: 'onToggle',
      type: '(key: string) => void',
      description:
        'Called with a row key when its expansion is toggled (chevron click or context-menu action).',
      required: true,
    },
    {
      name: 'getRowKey',
      type: '(item: T) => string',
      description: 'Derive a stable unique key from a row item.',
      required: true,
    },
    {
      name: 'renderExpanded',
      type: '(item: T) => ReactNode',
      description:
        'Render the detail content shown in a full-width panel below the row when it is expanded. Receives the row item.',
      required: true,
    },
    {
      name: 'getIsItemExpandable',
      type: '(item: T) => boolean',
      description:
        'Control which rows are expandable. Non-expandable rows show no chevron, no context-menu action, and never render a panel. Defaults to all rows expandable.',
    },
    {
      name: 'panelVariant',
      type: "'muted' | 'transparent'",
      description:
        "Background behind the detail panel. 'transparent' (default) paints nothing: the panel is the row's continuation and takes whatever surface the table sits on, so a Card shows through and a striped table's zebra reads on unchanged. 'muted' washes it, marking it as commentary rather than another row of data — reach for it in a bare table with no card, dividers or striping, where nothing else makes that distinction. The wash is a low-alpha near-black, so it is close to invisible over a dark card: 'muted' is largely a light-theme effect.",
      default: "'transparent'",
    },
    {
      name: 'hasRowClickExpansion',
      type: 'boolean',
      description:
        'Toggle a row by clicking anywhere on it, not only on its chevron. A pointer-only convenience layered over the chevron, which stays the accessible control for keyboard and assistive tech. Clicks on interactive cell content (buttons, links, form controls) or on a text selection do not toggle, and non-expandable rows stay inert.',
      default: 'false',
    },
    {
      name: 'animatedLayout',
      type: 'AnimatedLayout',
      description:
        "A handle from useAnimatedLayout. With it, opening or closing a panel glides the rows after it (and the content after the table) to their new places instead of jumping, the opening panel plays in on the same motion, and each row's divider moves with it. Under Reduce Motion the rows fade in place on a touch screen and change at once with a mouse; in a table with column lines (dividers columns or grid, which do not move yet) they change at once. Without it, rows jump.",
    },
  ],
  examples: [
    {
      label: 'Master-detail order rows',
      code: `const [expandedKeys, setExpandedKeys] = useState(new Set());
const expansion = useTableRowExpansion({
  expandedKeys,
  onToggle: key =>
    setExpandedKeys(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    }),
  getRowKey: item => item.id,
  renderExpanded: item => <OrderDetails order={item} />,
});

<Table data={orders} columns={columns} idKey="id" plugins={{expansion}} />;`,
    },
    {
      label: 'Migrating from tree rows to the tree plugin',
      code: `// useTableRowExpansion is now for DETAIL PANELS, not tree rows. If you used
// it to render nested child rows that reuse the parent columns, move to
// useTableTreeData + useTableTreeState.

// BEFORE (tree rows via useTableRowExpansion + useTableRowExpansionState):
const {data, expansionConfig} = useTableRowExpansionState({
  baseData: tree,
  getChildren: item => item.children ?? [],
  getRowKey: item => item.id,
  expandedKeys,
  setExpandedKeys,
});
const expansion = useTableRowExpansion(expansionConfig);
<Table data={data} columns={columns} idKey="id" plugins={{expansion}} />;

// AFTER (tree rows via the tree plugin):
const {visibleData, treeConfig} = useTableTreeState({
  data: tree,                   // nested data
  idKey: 'id',                  // or a function: idKey={item => item.id}
  childrenKey: 'children',      // replaces getChildren
  defaultExpandedIds: ['root'], // or controlled: expandedIds + onExpandedIdsChange
});
const tree = useTableTreeData({
  ...treeConfig,
  hasExpandAllControl: true,    // was isAllExpanded + onToggleExpandAll
  hasRowClickExpansion: true,   // same prop name
});
<Table data={visibleData} columns={columns} idKey="id" plugins={{tree}} />;`,
    },
  ],
};

/** @type {import('@astryxdesign/cli/authoring').ComponentTranslationDoc} */
export const docsDense = {
  description:
    'Returns a TablePlugin that expands a full-width detail panel below a row via renderExpanded(item). Adds a chevron column + right-click expand/collapse action; consumer owns expandedKeys. Panel content starts at the first column (past the chevron), inset by density. For nested child rows that reuse parent columns, use useTableTreeData + useTableTreeState instead.',
  propDescriptions: {
    expandedKeys: 'Set of currently-expanded row keys. Consumer-owned.',
    onToggle: 'Called with a row key when its expansion is toggled.',
    getRowKey: 'Derive a stable unique key from a row item.',
    renderExpanded:
      'Render the full-width detail panel below an expanded row. Receives the row item.',
    getIsItemExpandable:
      'Control which rows are expandable. Defaults to all rows expandable.',
    panelVariant:
      "Detail panel background: 'transparent' (default) paints nothing, so the panel takes the surface behind the table and leaves a striped table's zebra alone; 'muted' washes it, for a bare table where nothing else separates the panel from the data.",
    hasRowClickExpansion:
      'Toggle a row by clicking anywhere on it, not just the chevron; pointer-only, skips interactive cell content and text selections. Defaults to false.',
    animatedLayout:
      'Handle from useAnimatedLayout: opening or closing a panel glides the rows after it instead of jumping them. Under Reduce Motion they fade in place on touch and change at once with a mouse; with column lines they change at once.',
  },
};

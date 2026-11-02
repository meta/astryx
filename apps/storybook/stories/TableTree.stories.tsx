// Copyright (c) Meta Platforms, Inc. and affiliates.

import {useState} from 'react';
import type {Meta, StoryObj} from '@storybook/react';
import {
  Table,
  useTableTreeData,
  useTableTreeState,
  useTableSelection,
  useTableSelectionState,
  useTableSortable,
  useTableSortableState,
  pixel,
  proportional,
} from '@astryxdesign/core/Table';
import type {TableColumn} from '@astryxdesign/core/Table';

// =============================================================================
// Sample Data — an org chart (hierarchical records with columns)
// =============================================================================

interface OrgRow extends Record<string, unknown> {
  id: string;
  name: string;
  title: string;
  team: string;
  headcount: number;
  children?: OrgRow[];
}

const orgChart: OrgRow[] = [
  {
    id: 'eng',
    name: 'Engineering',
    title: 'VP Engineering',
    team: 'Engineering',
    headcount: 48,
    children: [
      {
        id: 'eng-platform',
        name: 'Platform',
        title: 'Director',
        team: 'Engineering',
        headcount: 22,
        children: [
          {
            id: 'eng-platform-core',
            name: 'Core Services',
            title: 'Manager',
            team: 'Platform',
            headcount: 12,
            children: [
              {
                id: 'eng-platform-core-api',
                name: 'API Gateway',
                title: 'Tech Lead',
                team: 'Core Services',
                headcount: 5,
              },
              {
                id: 'eng-platform-core-data',
                name: 'Data Pipeline',
                title: 'Tech Lead',
                team: 'Core Services',
                headcount: 7,
              },
            ],
          },
          {
            id: 'eng-platform-infra',
            name: 'Infrastructure',
            title: 'Manager',
            team: 'Platform',
            headcount: 10,
          },
        ],
      },
      {
        id: 'eng-product',
        name: 'Product Engineering',
        title: 'Director',
        team: 'Engineering',
        headcount: 26,
        children: [
          {
            id: 'eng-product-web',
            name: 'Web',
            title: 'Manager',
            team: 'Product Engineering',
            headcount: 14,
          },
          {
            id: 'eng-product-mobile',
            name: 'Mobile',
            title: 'Manager',
            team: 'Product Engineering',
            headcount: 12,
          },
        ],
      },
    ],
  },
  {
    id: 'design',
    name: 'Design',
    title: 'VP Design',
    team: 'Design',
    headcount: 11,
    children: [
      {
        id: 'design-systems',
        name: 'Design Systems',
        title: 'Manager',
        team: 'Design',
        headcount: 4,
      },
      {
        id: 'design-research',
        name: 'Research',
        title: 'Manager',
        team: 'Design',
        headcount: 7,
      },
    ],
  },
  {
    id: 'ops',
    name: 'Operations',
    title: 'VP Operations',
    team: 'Operations',
    headcount: 6,
  },
];

const columns: TableColumn<OrgRow>[] = [
  {key: 'name', header: 'Group', width: proportional(2)},
  {key: 'title', header: 'Lead', width: proportional(1)},
  {key: 'team', header: 'Parent team', width: proportional(1)},
  {key: 'headcount', header: 'Headcount', width: pixel(110), align: 'end'},
];

const sortableColumns: TableColumn<OrgRow>[] = columns.map(col =>
  col.key === 'name' || col.key === 'headcount'
    ? {...col, sortable: true, sortKey: col.key}
    : col,
);

// =============================================================================
// Stories
// =============================================================================

const meta: Meta = {
  title: 'Core/TableTree',
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj;

/**
 * Hierarchical records rendered as a table. `useTableTreeState` flattens the
 * nested data into the visible rows and owns the expanded set;
 * `useTableTreeData` draws the indent + expander in the first column.
 * `getRowLabel` gives each expander a row-specific accessible name.
 *
 * Collapsed branches are unmounted, not hidden — the `<tbody>` holds exactly
 * the visible rows.
 */
export const Default: Story = {
  render: () => {
    const {visibleData, treeConfig} = useTableTreeState<OrgRow>({
      data: orgChart,
      idKey: 'id',
      defaultExpandedIds: ['eng'],
    });
    const tree = useTableTreeData({
      ...treeConfig,
      getRowLabel: item => item.name,
    });

    return (
      <Table
        data={visibleData}
        columns={columns}
        idKey="id"
        hasHover
        plugins={{tree}}
      />
    );
  },
};

/**
 * `expandAll` / `collapseAll` from the state hook, driving a deep hierarchy.
 * Indentation is `calc(level * token)` — there is no depth cap.
 */
export const ExpandAndCollapseAll: Story = {
  render: () => {
    const {visibleData, treeConfig, expandAll, collapseAll} =
      useTableTreeState<OrgRow>({
        data: orgChart,
        idKey: 'id',
        defaultExpandedIds: ['eng', 'eng-platform', 'eng-platform-core'],
      });
    const tree = useTableTreeData(treeConfig);

    return (
      <div style={{display: 'flex', flexDirection: 'column', gap: 12}}>
        <div style={{display: 'flex', gap: 8}}>
          <button type="button" onClick={expandAll}>
            Expand all
          </button>
          <button type="button" onClick={collapseAll}>
            Collapse all
          </button>
        </div>
        <Table
          data={visibleData}
          columns={columns}
          idKey="id"
          hasHover
          plugins={{tree}}
        />
      </div>
    );
  },
};

/**
 * `hasExpandAllControl` renders a built-in expand-all/collapse-all toggle in
 * the tree column header, wired to the state hook. No external buttons needed:
 * the toggle reads the aggregate `isAllExpanded` state (down chevron only when
 * every expandable row is expanded) and calls `expandAll`/`collapseAll`.
 */
export const HeaderExpandAllControl: Story = {
  render: () => {
    const {visibleData, treeConfig} = useTableTreeState<OrgRow>({
      data: orgChart,
      idKey: 'id',
      defaultExpandedIds: ['eng'],
    });
    const tree = useTableTreeData({...treeConfig, hasExpandAllControl: true});

    return (
      <Table
        data={visibleData}
        columns={columns}
        idKey="id"
        hasHover
        plugins={{tree}}
      />
    );
  },
};

/**
 * `hasRowClickExpansion` lets a click anywhere on an expandable row toggle it,
 * in addition to the chevron. Leaf rows stay inert, and the chevron still works
 * on its own (it stops propagation, so a chevron click never double-toggles).
 */
export const RowClickExpansion: Story = {
  render: () => {
    const {visibleData, treeConfig} = useTableTreeState<OrgRow>({
      data: orgChart,
      idKey: 'id',
      defaultExpandedIds: ['eng'],
    });
    const tree = useTableTreeData({...treeConfig, hasRowClickExpansion: true});

    return (
      <Table
        data={visibleData}
        columns={columns}
        idKey="id"
        hasHover
        plugins={{tree}}
      />
    );
  },
};

/**
 * The `indent` token controls the step per level: `sm` (spacing-3), `md`
 * (spacing-4, the default), and `lg` (spacing-6).
 */
export const IndentSizes: Story = {
  render: () => {
    const indents = ['sm', 'md', 'lg'] as const;

    return (
      <div style={{display: 'flex', flexDirection: 'column', gap: 32}}>
        {indents.map(indent => (
          <IndentExample key={indent} indent={indent} />
        ))}
      </div>
    );
  },
};

function IndentExample({indent}: {indent: 'sm' | 'md' | 'lg'}) {
  const {visibleData, treeConfig} = useTableTreeState<OrgRow>({
    data: orgChart,
    idKey: 'id',
    indent,
    defaultExpandedIds: ['eng', 'eng-platform', 'eng-platform-core'],
  });
  const tree = useTableTreeData(treeConfig);

  return (
    <div>
      <p style={{marginBlockEnd: 8, fontWeight: 600}}>
        indent=&quot;{indent}&quot;
      </p>
      <Table data={visibleData} columns={columns} idKey="id" plugins={{tree}} />
    </div>
  );
}

/**
 * Composed with selection. The canonical plugin order puts `tree` before
 * `selection`, so the checkbox column lands to the left of the indented
 * tree column, and selection operates on the visible (flattened) rows.
 */
export const WithSelection: Story = {
  render: () => {
    const [selectedKeys, setSelectedKeys] = useState<Set<string>>(
      () => new Set(['design-systems']),
    );

    const {visibleData, treeConfig} = useTableTreeState<OrgRow>({
      data: orgChart,
      idKey: 'id',
      defaultExpandedIds: ['eng', 'design'],
    });

    const {selectionConfig} = useTableSelectionState<OrgRow>({
      data: visibleData,
      idKey: 'id',
      selectedKeys,
      setSelectedKeys,
    });

    const tree = useTableTreeData(treeConfig);
    const selection = useTableSelection(selectionConfig);

    return (
      <Table
        data={visibleData}
        columns={columns}
        idKey="id"
        hasHover
        plugins={{tree, selection}}
      />
    );
  },
};

/**
 * Composed with sorting. `applySort` is passed as `sortSiblings`, so each
 * sibling group sorts independently — children always stay directly under
 * their parent and levels never interleave. Sort by Group or Headcount.
 */
export const WithSiblingSorting: Story = {
  render: () => {
    const {sortConfig, applySort} = useTableSortableState<OrgRow>({
      data: orgChart,
      defaultSort: [{sortKey: 'headcount', direction: 'descending'}],
    });

    const {visibleData, treeConfig} = useTableTreeState<OrgRow>({
      data: orgChart,
      idKey: 'id',
      defaultExpandedIds: ['eng', 'eng-platform'],
      sortSiblings: applySort,
    });

    const tree = useTableTreeData(treeConfig);
    // T can't be inferred from the sort config (it only carries the sort key).
    const sort = useTableSortable<OrgRow>(sortConfig);

    return (
      <Table
        data={visibleData}
        columns={sortableColumns}
        idKey="id"
        hasHover
        plugins={{sort, tree}}
      />
    );
  },
};

/**
 * Lazy loading. `isItemExpandable` shows an expander before the children
 * exist; `onExpandedIdsChange` triggers the fetch, and the rows appear when
 * the data arrives.
 */
export const LazyLoadedChildren: Story = {
  render: () => {
    const [data, setData] = useState<OrgRow[]>([
      {
        id: 'remote',
        name: 'Remote team',
        title: 'Director',
        team: '—',
        headcount: 9,
      },
    ]);
    const [loadingIds, setLoadingIds] = useState<Set<string>>(() => new Set());

    const {visibleData, treeConfig} = useTableTreeState<OrgRow>({
      data,
      idKey: 'id',
      // Expandable before children exist.
      isItemExpandable: item => item.id === 'remote',
      onExpandedIdsChange: ids => {
        if (!ids.has('remote') || data[0].children) {
          return;
        }
        setLoadingIds(new Set(['remote']));
        window.setTimeout(() => {
          setData([
            {
              ...data[0],
              children: [
                {
                  id: 'remote-emea',
                  name: 'EMEA',
                  title: 'Manager',
                  team: 'Remote team',
                  headcount: 5,
                },
                {
                  id: 'remote-apac',
                  name: 'APAC',
                  title: 'Manager',
                  team: 'Remote team',
                  headcount: 4,
                },
              ],
            },
          ]);
          setLoadingIds(new Set());
        }, 600);
      },
    });

    const tree = useTableTreeData(treeConfig);

    return (
      <div style={{display: 'flex', flexDirection: 'column', gap: 8}}>
        <Table
          data={visibleData}
          columns={columns}
          idKey="id"
          hasHover
          plugins={{tree}}
        />
        {loadingIds.size > 0 && <p>Loading children…</p>}
      </div>
    );
  },
};

/**
 * Migration case: the same plugin on flat data (no `children` anywhere) is a
 * no-op — no expanders, no indent spacers, no tree ARIA. Adopting the plugin
 * before the data becomes hierarchical changes nothing.
 */
export const FlatDataIsANoOp: Story = {
  render: () => {
    const flat: OrgRow[] = [
      {
        id: 'a',
        name: 'Engineering',
        title: 'VP Engineering',
        team: '—',
        headcount: 48,
      },
      {id: 'b', name: 'Design', title: 'VP Design', team: '—', headcount: 11},
      {
        id: 'c',
        name: 'Operations',
        title: 'VP Operations',
        team: '—',
        headcount: 6,
      },
    ];

    const {visibleData, treeConfig} = useTableTreeState<OrgRow>({
      data: flat,
      idKey: 'id',
    });
    const tree = useTableTreeData(treeConfig);

    return (
      <Table
        data={visibleData}
        columns={columns}
        idKey="id"
        hasHover
        plugins={{tree}}
      />
    );
  },
};

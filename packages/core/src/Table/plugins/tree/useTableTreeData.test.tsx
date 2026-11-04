// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file useTableTreeData.test.tsx
 * @input Uses vitest, @testing-library/react, Table components
 * @output Unit tests for the useTableTreeData plugin
 * @position Testing; validates tree column decoration, expander behavior,
 *   row ARIA, and the flat-data migration no-op
 */

import {describe, it, expect, vi} from 'vitest';
import {act, fireEvent, render, screen, within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {useState} from 'react';
import * as stylex from '@stylexjs/stylex';
import {focusOutlineStyles} from '../../../utils/focusOutline.stylex';
import {Table} from '../../Table';
import type {TableProps} from '../../Table';
import type {TableColumn, TablePlugin} from '../../types';
import {useTableSelection, useTableSelectionState} from '../selection';
import {useTableSortableState} from '../sortable';
import {useTableTreeData} from './useTableTreeData';
import {useTableTreeState} from './useTableTreeState';
import type {UseTableTreeStateConfig} from './useTableTreeState';

// =============================================================================
// Test Data
// =============================================================================

interface FileRow extends Record<string, unknown> {
  id: string;
  name: string;
  size: number;
  children?: FileRow[];
}

const fileTree: FileRow[] = [
  {
    id: 'src',
    name: 'src',
    size: 0,
    children: [
      {
        id: 'components',
        name: 'components',
        size: 0,
        children: [{id: 'button', name: 'Button.tsx', size: 120}],
      },
      {id: 'utils', name: 'utils.ts', size: 40},
    ],
  },
  {id: 'readme', name: 'README.md', size: 10},
];

const columns: TableColumn<FileRow>[] = [
  {key: 'name', header: 'Name'},
  {key: 'size', header: 'Size'},
];

function TreeTable(
  props: Partial<UseTableTreeStateConfig<FileRow>> & {
    data?: FileRow[];
    hasExpandAllControl?: boolean;
    hasRowClickExpansion?: boolean;
    getRowLabel?: (item: FileRow) => string;
    /** Props a caller puts on the <Table> root itself. */
    tableProps?: Pick<TableProps<FileRow>, 'onKeyDown' | 'onFocus' | 'role'>;
  },
) {
  const {
    hasExpandAllControl,
    hasRowClickExpansion,
    getRowLabel,
    tableProps,
    ...stateProps
  } = props;
  const {visibleData, treeConfig} = useTableTreeState<FileRow>({
    data: props.data ?? fileTree,
    idKey: 'id',
    ...stateProps,
  });
  const tree = useTableTreeData({
    ...treeConfig,
    hasExpandAllControl,
    hasRowClickExpansion,
    getRowLabel,
  });

  return (
    <Table
      data={visibleData}
      columns={columns}
      idKey="id"
      plugins={{tree}}
      {...tableProps}
    />
  );
}

/** All body rows (skips the header row). */
function getBodyRows(): HTMLElement[] {
  return screen.getAllByRole('row').slice(1);
}

function getRowByText(text: string): HTMLElement {
  const row = getBodyRows().find(r => within(r).queryByText(text));
  if (!row) {
    throw new Error(`no row containing "${text}"`);
  }
  return row;
}

// The classes `focusOutlineStyles.focusVisible` compiles to. jsdom does not
// derive `:focus-visible`, so a tab stop's ring is pinned by composition (as in
// SideNav's shared-ring tests).
const sharedFocusRingClasses = stylex
  .props(focusOutlineStyles.focusVisible)
  .className!.split(' ');

function expectSharedFocusRing(el: Element) {
  const classes = el.className.split(' ');
  for (const c of sharedFocusRingClasses) {
    expect(classes).toContain(c);
  }
}

// =============================================================================
// Expander button
// =============================================================================

describe('useTableTreeData — expander', () => {
  it('renders an "Expand row" button on collapsed expandable rows only', () => {
    render(<TreeTable />);

    const srcRow = getRowByText('src');
    expect(
      within(srcRow).getByRole('button', {name: 'Expand row'}),
    ).toBeInTheDocument();

    const readmeRow = getRowByText('README.md');
    expect(within(readmeRow).queryByRole('button')).toBeNull();
  });

  it('names top-level and nested expansion controls when getRowLabel is provided', () => {
    render(
      <TreeTable
        defaultExpandedIds={['src']}
        getRowLabel={item => item.name}
      />,
    );

    expect(
      within(getRowByText('src')).getByRole('button', {name: 'Collapse src'}),
    ).toBeInTheDocument();
    expect(
      within(getRowByText('components')).getByRole('button', {
        name: 'Expand components',
      }),
    ).toBeInTheDocument();
  });

  it('falls back to the generic label when getRowLabel returns blank text', () => {
    render(<TreeTable getRowLabel={() => '   '} />);

    expect(
      within(getRowByText('src')).getByRole('button', {name: 'Expand row'}),
    ).toBeInTheDocument();
  });

  it('updates expansion control names when getRowLabel changes', () => {
    const {rerender} = render(<TreeTable getRowLabel={item => item.name} />);

    expect(
      within(getRowByText('src')).getByRole('button', {name: 'Expand src'}),
    ).toBeInTheDocument();

    rerender(<TreeTable getRowLabel={item => `Folder ${item.name}`} />);

    expect(
      within(getRowByText('src')).getByRole('button', {
        name: 'Expand Folder src',
      }),
    ).toBeInTheDocument();
  });

  it('expands children on click and relabels the button "Collapse row"', async () => {
    const user = userEvent.setup();
    render(<TreeTable />);

    expect(screen.queryByText('components')).toBeNull();

    await user.click(
      within(getRowByText('src')).getByRole('button', {name: 'Expand row'}),
    );

    expect(screen.getByText('components')).toBeInTheDocument();
    expect(screen.getByText('utils.ts')).toBeInTheDocument();
    expect(
      within(getRowByText('src')).getByRole('button', {name: 'Collapse row'}),
    ).toBeInTheDocument();
  });

  it('collapses an expanded row on click, unmounting the subtree', async () => {
    const user = userEvent.setup();
    render(<TreeTable defaultExpandedIds={['src', 'components']} />);

    expect(screen.getByText('Button.tsx')).toBeInTheDocument();

    await user.click(
      within(getRowByText('src')).getByRole('button', {name: 'Collapse row'}),
    );

    expect(screen.queryByText('components')).toBeNull();
    expect(screen.queryByText('Button.tsx')).toBeNull();
    // Unmounted, not hidden: only roots + header remain.
    expect(screen.getAllByRole('row')).toHaveLength(3);
  });

  it('sets aria-expanded on the expander button', async () => {
    const user = userEvent.setup();
    render(<TreeTable />);

    const button = within(getRowByText('src')).getByRole('button', {
      name: 'Expand row',
    });
    expect(button).toHaveAttribute('aria-expanded', 'false');

    await user.click(button);

    expect(
      within(getRowByText('src')).getByRole('button', {name: 'Collapse row'}),
    ).toHaveAttribute('aria-expanded', 'true');
  });

  it('draws the shared focus ring on the expander', () => {
    render(<TreeTable />);

    expectSharedFocusRing(
      within(getRowByText('src')).getByRole('button', {name: 'Expand row'}),
    );
  });
});

// =============================================================================
// Whole-row-click expansion
// =============================================================================

describe('useTableTreeData — row-click expansion', () => {
  it('does not toggle on row click when hasRowClickExpansion is unset', async () => {
    const user = userEvent.setup();
    render(<TreeTable />);

    await user.click(within(getRowByText('src')).getByText('src'));

    // Row body click is inert by default: subtree stays collapsed.
    expect(screen.queryByText('components')).toBeNull();
    expect(
      within(getRowByText('src')).getByRole('button', {name: 'Expand row'}),
    ).toBeInTheDocument();
  });

  it('expands an expandable row when its body is clicked', async () => {
    const user = userEvent.setup();
    render(<TreeTable hasRowClickExpansion />);

    await user.click(within(getRowByText('src')).getByText('src'));

    expect(screen.getByText('components')).toBeInTheDocument();
    expect(screen.getByText('utils.ts')).toBeInTheDocument();
    expect(
      within(getRowByText('src')).getByRole('button', {name: 'Collapse row'}),
    ).toBeInTheDocument();
  });

  it('collapses an expanded row when its body is clicked', async () => {
    const user = userEvent.setup();
    render(<TreeTable hasRowClickExpansion defaultExpandedIds={['src']} />);

    expect(screen.getByText('components')).toBeInTheDocument();

    await user.click(within(getRowByText('src')).getByText('src'));

    expect(screen.queryByText('components')).toBeNull();
    expect(
      within(getRowByText('src')).getByRole('button', {name: 'Expand row'}),
    ).toBeInTheDocument();
  });

  it('does not toggle when a leaf row body is clicked', async () => {
    const user = userEvent.setup();
    render(<TreeTable hasRowClickExpansion />);

    const before = screen.getAllByRole('row').length;
    await user.click(within(getRowByText('README.md')).getByText('README.md'));

    // Leaf has no expansion: row count is unchanged.
    expect(screen.getAllByRole('row')).toHaveLength(before);
  });

  it('toggles once when the chevron is clicked (no double-toggle via row click)', async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();

    function SpyTree() {
      const {visibleData, treeConfig} = useTableTreeState<FileRow>({
        data: fileTree,
        idKey: 'id',
      });
      const tree = useTableTreeData({
        ...treeConfig,
        hasRowClickExpansion: true,
        onToggleItem: item => {
          onToggle(item);
          treeConfig.onToggleItem(item);
        },
      });
      return (
        <Table
          data={visibleData}
          columns={columns}
          idKey="id"
          plugins={{tree}}
        />
      );
    }

    render(<SpyTree />);

    await user.click(
      within(getRowByText('src')).getByRole('button', {name: 'Expand row'}),
    );

    // The chevron stops propagation, so a chevron click toggles exactly once.
    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(screen.getByText('components')).toBeInTheDocument();
  });

  it('does not toggle when an interactive control inside the row is clicked', async () => {
    const user = userEvent.setup();
    // Compose with selection: each row carries a checkbox in its own column.
    function TreeWithSelection() {
      const [selectedKeys, setSelectedKeys] = useState<Set<string>>(
        () => new Set(),
      );
      const {visibleData, treeConfig} = useTableTreeState<FileRow>({
        data: fileTree,
        idKey: 'id',
      });
      const {selectionConfig} = useTableSelectionState<FileRow>({
        data: visibleData,
        idKey: 'id',
        selectedKeys,
        setSelectedKeys,
      });
      const selection = useTableSelection<FileRow>(selectionConfig);
      const tree = useTableTreeData({
        ...treeConfig,
        hasRowClickExpansion: true,
      });
      return (
        <Table
          data={visibleData}
          columns={columns}
          idKey="id"
          plugins={{tree, selection}}
        />
      );
    }

    render(<TreeWithSelection />);

    const srcRow = getRowByText('src');
    const cells = within(srcRow).getAllByRole('cell');
    await user.click(within(cells[0]).getByRole('checkbox'));

    // Clicking the checkbox selects the row but must NOT expand it.
    expect(screen.queryByText('components')).toBeNull();
    expect(
      within(getRowByText('src')).getByRole('button', {name: 'Expand row'}),
    ).toBeInTheDocument();
  });

  it('does not toggle when a contenteditable cell is clicked', async () => {
    const user = userEvent.setup();
    function TreeWithEditable() {
      const {visibleData, treeConfig} = useTableTreeState<FileRow>({
        data: fileTree,
        idKey: 'id',
      });
      const tree = useTableTreeData({
        ...treeConfig,
        hasRowClickExpansion: true,
      });
      return (
        <Table
          data={visibleData}
          columns={[
            {
              key: 'name',
              header: 'Name',
              renderCell: item => (
                <div contentEditable data-testid={`editable-${item.id}`}>
                  {item.name}
                </div>
              ),
            },
          ]}
          idKey="id"
          plugins={{tree}}
        />
      );
    }
    render(<TreeWithEditable />);
    await user.click(screen.getByTestId('editable-src'));
    expect(screen.queryByText('components')).toBeNull();
  });

  it('does not toggle when a nested element inside contenteditable is clicked', async () => {
    const user = userEvent.setup();
    function TreeWithNestedEditable() {
      const {visibleData, treeConfig} = useTableTreeState<FileRow>({
        data: fileTree,
        idKey: 'id',
      });
      const tree = useTableTreeData({
        ...treeConfig,
        hasRowClickExpansion: true,
      });
      return (
        <Table
          data={visibleData}
          columns={[
            {
              key: 'name',
              header: 'Name',
              renderCell: item => (
                <div contentEditable>
                  <span data-testid={`inner-${item.id}`}>{item.name}</span>
                </div>
              ),
            },
          ]}
          idKey="id"
          plugins={{tree}}
        />
      );
    }
    render(<TreeWithNestedEditable />);
    await user.click(screen.getByTestId('inner-src'));
    expect(screen.queryByText('components')).toBeNull();
  });

  it('still toggles on contenteditable="false"', async () => {
    const user = userEvent.setup();
    function TreeWithReadonly() {
      const {visibleData, treeConfig} = useTableTreeState<FileRow>({
        data: fileTree,
        idKey: 'id',
      });
      const tree = useTableTreeData({
        ...treeConfig,
        hasRowClickExpansion: true,
      });
      return (
        <Table
          data={visibleData}
          columns={[
            {
              key: 'name',
              header: 'Name',
              renderCell: item => (
                <div
                  contentEditable="false"
                  data-testid={`readonly-${item.id}`}>
                  {item.name}
                </div>
              ),
            },
          ]}
          idKey="id"
          plugins={{tree}}
        />
      );
    }
    render(<TreeWithReadonly />);
    await user.click(screen.getByTestId('readonly-src'));
    expect(screen.getByText('components')).toBeInTheDocument();
  });

  it('is a no-op on flat data even when hasRowClickExpansion is set', async () => {
    const user = userEvent.setup();
    const flat: FileRow[] = [
      {id: 'a', name: 'a.txt', size: 1},
      {id: 'b', name: 'b.txt', size: 2},
    ];
    render(<TreeTable data={flat} hasRowClickExpansion />);

    const before = screen.getAllByRole('row').length;
    await user.click(within(getRowByText('a.txt')).getByText('a.txt'));

    expect(screen.getAllByRole('row')).toHaveLength(before);
  });
});

// =============================================================================
// Row ARIA
// =============================================================================

describe('useTableTreeData — row ARIA', () => {
  it('sets 1-based aria-level on every body row', () => {
    render(<TreeTable defaultExpandedIds={['src', 'components']} />);

    expect(getRowByText('src')).toHaveAttribute('aria-level', '1');
    expect(getRowByText('components')).toHaveAttribute('aria-level', '2');
    expect(getRowByText('Button.tsx')).toHaveAttribute('aria-level', '3');
    expect(getRowByText('README.md')).toHaveAttribute('aria-level', '1');
  });

  it('sets aria-expanded on expandable rows and omits it on leaves', () => {
    render(<TreeTable defaultExpandedIds={['src']} />);

    expect(getRowByText('src')).toHaveAttribute('aria-expanded', 'true');
    expect(getRowByText('components')).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    expect(getRowByText('utils.ts')).not.toHaveAttribute('aria-expanded');
    expect(getRowByText('README.md')).not.toHaveAttribute('aria-expanded');
  });
});

// =============================================================================
// Migration no-op (flat data)
// =============================================================================

describe('useTableTreeData — flat data is a no-op', () => {
  const flat: FileRow[] = [
    {id: 'a', name: 'alpha', size: 1},
    {id: 'b', name: 'beta', size: 2},
  ];

  it('renders no expanders, spacers, or tree ARIA for flat data', () => {
    render(<TreeTable data={flat} />);

    expect(screen.queryByRole('button')).toBeNull();
    for (const row of getBodyRows()) {
      expect(row).not.toHaveAttribute('aria-level');
      expect(row).not.toHaveAttribute('aria-expanded');
    }
  });

  it('renders first-column cell content identically to a plugin-free Table', () => {
    const {container: withPlugin} = render(<TreeTable data={flat} />);
    const pluginCell = withPlugin.querySelector('tbody td');

    const {container: without} = render(
      <Table data={flat} columns={columns} idKey="id" />,
    );
    const plainCell = without.querySelector('tbody td');

    expect(pluginCell).toBeTruthy();
    expect(plainCell).toBeTruthy();
    expect(pluginCell?.innerHTML).toBe(plainCell?.innerHTML);
  });
});

// =============================================================================
// Stability across data-shape changes
// =============================================================================

describe('useTableTreeData — stability when the data shape changes', () => {
  const flat: FileRow[] = [
    {id: 'a', name: 'alpha', size: 1},
    {id: 'b', name: 'beta', size: 2},
  ];

  it('does not remount the table when flat data becomes nested', () => {
    const {container, rerender} = render(<TreeTable data={flat} />);
    const tableBefore = container.querySelector('table');

    rerender(<TreeTable data={fileTree} />);

    expect(container.querySelector('table')).toBe(tableBefore);
    // The tree affordance appears without a remount.
    expect(
      screen.getAllByRole('button', {name: 'Expand row'}).length,
    ).toBeGreaterThan(0);
  });

  it('does not warn about an empty plugin for flat data', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      render(<TreeTable data={flat} />);
      const pluginWarnings = warn.mock.calls.filter(args =>
        String(args[0]).includes('no transform methods'),
      );
      expect(pluginWarnings).toHaveLength(0);
    } finally {
      warn.mockRestore();
    }
  });

  it('removes tree ARIA from rows when nested data becomes flat', () => {
    const {rerender} = render(
      <TreeTable data={fileTree} defaultExpandedIds={['src']} />,
    );
    expect(getRowByText('src')).toHaveAttribute('aria-level', '1');

    rerender(<TreeTable data={flat} />);

    for (const row of getBodyRows()) {
      expect(row).not.toHaveAttribute('aria-level');
      expect(row).not.toHaveAttribute('aria-expanded');
    }
  });
});

// =============================================================================
// Toggle batching
// =============================================================================

describe('useTableTreeState — batched toggles', () => {
  it('applies two different toggles landing in the same React batch', async () => {
    const user = userEvent.setup();

    function TwoTogglesTable() {
      const {visibleData, treeConfig, expandAll} = useTableTreeState<FileRow>({
        data: fileTree,
        idKey: 'id',
      });
      const tree = useTableTreeData(treeConfig);
      return (
        <>
          <button
            type="button"
            onClick={() => {
              // Two commits in one event handler — one React batch.
              treeConfig.onToggleItem(fileTree[0]); // expand 'src'
              treeConfig.onToggleItem(fileTree[0].children![0]); // expand 'components'
            }}>
            expand two
          </button>
          <Table
            data={visibleData}
            columns={columns}
            idKey="id"
            plugins={{tree}}
          />
          <button type="button" onClick={expandAll}>
            noop
          </button>
        </>
      );
    }

    render(<TwoTogglesTable />);

    await user.click(screen.getByRole('button', {name: 'expand two'}));

    // Both toggles must survive the batch.
    expect(screen.getByText('components')).toBeInTheDocument();
    expect(screen.getByText('Button.tsx')).toBeInTheDocument();
  });
});

// =============================================================================
// Indentation
// =============================================================================

describe('useTableTreeData — indentation', () => {
  it('indents nested rows by calc(level * step) and leaves roots unindented', () => {
    render(<TreeTable defaultExpandedIds={['src', 'components']} />);

    const cellWrapper = (text: string) =>
      within(getRowByText(text)).getByText(text).closest('td')
        ?.firstElementChild as HTMLElement;

    expect(cellWrapper('src').getAttribute('style') ?? '').not.toContain(
      'calc',
    );
    expect(cellWrapper('components').getAttribute('style')).toContain(
      'calc(1 *',
    );
    expect(cellWrapper('Button.tsx').getAttribute('style')).toContain(
      'calc(2 *',
    );
  });

  it('respects the indent token size', () => {
    render(<TreeTable defaultExpandedIds={['src']} indent="lg" />);

    const wrapper = within(getRowByText('utils.ts'))
      .getByText('utils.ts')
      .closest('td')?.firstElementChild as HTMLElement;
    // lg maps to the --spacing-6 token
    expect(wrapper.getAttribute('style')).toContain('--spacing-6');
  });

  it('never indents with a physical inline padding (logical property lives in the StyleX class)', () => {
    // The indent is a StyleX dynamic style: the inline style carries only
    // the CSS variable with the calc value; the paddingInlineStart property
    // itself is compiled into the class. Guard against a regression to
    // physical inline padding, which would not mirror in RTL.
    render(<TreeTable defaultExpandedIds={['src']} />);

    const wrapper = within(getRowByText('utils.ts'))
      .getByText('utils.ts')
      .closest('td')?.firstElementChild as HTMLElement;
    const style = wrapper.getAttribute('style') ?? '';
    expect(style).toContain('calc(1 *');
    expect(style).not.toContain('padding-left');
    expect(style).not.toContain('margin-left');
  });

  it('supports deep nesting with no depth cap', () => {
    // a > b > c > d > e (levels 0..4)
    let node: FileRow = {id: 'e', name: 'leaf-e', size: 0};
    for (const id of ['d', 'c', 'b', 'a']) {
      node = {id, name: `node-${id}`, size: 0, children: [node]};
    }
    render(
      <TreeTable data={[node]} defaultExpandedIds={['a', 'b', 'c', 'd']} />,
    );

    const leafRow = getRowByText('leaf-e');
    expect(leafRow).toHaveAttribute('aria-level', '5');
    const wrapper = within(leafRow).getByText('leaf-e').closest('td')
      ?.firstElementChild as HTMLElement;
    expect(wrapper.getAttribute('style')).toContain('calc(4 *');
  });
});

// =============================================================================
// treeColumnKey
// =============================================================================

describe('useTableTreeData — treeColumnKey', () => {
  it('moves the expander into the configured column', () => {
    render(<TreeTable treeColumnKey="size" />);

    const srcRow = getRowByText('src');
    const cells = within(srcRow).getAllByRole('cell');
    // name column carries no expander; size column does
    expect(within(cells[0]).queryByRole('button')).toBeNull();
    expect(
      within(cells[1]).getByRole('button', {name: 'Expand row'}),
    ).toBeInTheDocument();
  });

  it('falls back to the first column when the configured column is absent', () => {
    // e.g. columnSettings hid the configured tree column — the expander
    // must not vanish while rows still announce aria-expanded.
    render(<TreeTable treeColumnKey="not-a-column" />);

    const srcRow = getRowByText('src');
    const cells = within(srcRow).getAllByRole('cell');
    expect(
      within(cells[0]).getByRole('button', {name: 'Expand row'}),
    ).toBeInTheDocument();
  });
});

// =============================================================================
// Lazy loading
// =============================================================================

describe('useTableTreeData — lazy loading', () => {
  it('shows an expander before children exist and reveals them once loaded', async () => {
    const user = userEvent.setup();

    function LazyTable() {
      const [data, setData] = useState<FileRow[]>([
        {id: 'folder', name: 'folder', size: 0},
      ]);
      const {visibleData, treeConfig} = useTableTreeState<FileRow>({
        data,
        idKey: 'id',
        isItemExpandable: item => item.id === 'folder',
        onExpandedIdsChange: ids => {
          if (ids.has('folder')) {
            // Simulated fetch: children arrive after expansion.
            setData([
              {
                id: 'folder',
                name: 'folder',
                size: 0,
                children: [{id: 'lazy-child', name: 'lazy-child', size: 3}],
              },
            ]);
          }
        },
      });
      const tree = useTableTreeData(treeConfig);
      return (
        <Table
          data={visibleData}
          columns={columns}
          idKey="id"
          plugins={{tree}}
        />
      );
    }

    render(<LazyTable />);

    await user.click(screen.getByRole('button', {name: 'Expand row'}));

    expect(screen.getByText('lazy-child')).toBeInTheDocument();
  });
});

// =============================================================================
// Degenerate configurations
// =============================================================================

describe('useTableTreeData — degenerate configurations', () => {
  it('renders without crashing when the table has zero columns', () => {
    function ZeroColumnsTable() {
      const {visibleData, treeConfig} = useTableTreeState<FileRow>({
        data: fileTree,
        idKey: 'id',
      });
      const tree = useTableTreeData(treeConfig);
      return (
        <Table data={visibleData} columns={[]} idKey="id" plugins={{tree}} />
      );
    }

    expect(() => render(<ZeroColumnsTable />)).not.toThrow();
  });

  it('updates aria-level in place when a row is reparented deeper', () => {
    const flat: FileRow[] = [
      {
        id: 'a',
        name: 'alpha',
        size: 0,
        children: [{id: 'k', name: 'kid', size: 1}],
      },
      {id: 'm', name: 'mover', size: 2},
    ];
    const nested: FileRow[] = [
      {
        id: 'a',
        name: 'alpha',
        size: 0,
        children: [
          {id: 'k', name: 'kid', size: 1},
          {id: 'm', name: 'mover', size: 2},
        ],
      },
    ];

    const {rerender} = render(
      <TreeTable data={flat} defaultExpandedIds={['a']} />,
    );
    expect(getRowByText('mover')).toHaveAttribute('aria-level', '1');

    rerender(<TreeTable data={nested} defaultExpandedIds={['a']} />);

    expect(getRowByText('mover')).toHaveAttribute('aria-level', '2');
  });
});

// =============================================================================
// Composition with selection
// =============================================================================

describe('useTableTreeData — composition with selection', () => {
  it('prepends the selection checkbox column before the tree column', () => {
    function ComposedTable() {
      const [selectedKeys, setSelectedKeys] = useState<Set<string>>(
        () => new Set(),
      );
      const {visibleData, treeConfig} = useTableTreeState<FileRow>({
        data: fileTree,
        idKey: 'id',
        defaultExpandedIds: ['src'],
      });
      const {selectionConfig} = useTableSelectionState({
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
          plugins={{tree, selection}}
        />
      );
    }

    render(<ComposedTable />);

    const srcRow = getRowByText('src');
    const cells = within(srcRow).getAllByRole('cell');
    // Checkbox column first, then the tree (name) column with the expander.
    expect(within(cells[0]).getByRole('checkbox')).toBeInTheDocument();
    expect(
      within(cells[1]).getByRole('button', {name: 'Collapse row'}),
    ).toBeInTheDocument();
  });
});

// =============================================================================
// Composition with sorting
// =============================================================================

describe('useTableTreeData — composition with sorting', () => {
  it('sorts sibling groups via applySort without interleaving levels', () => {
    function SortedTree() {
      const {applySort} = useTableSortableState<FileRow>({
        data: fileTree,
        defaultSort: [{sortKey: 'name', direction: 'descending'}],
      });
      const {visibleData, treeConfig} = useTableTreeState<FileRow>({
        data: fileTree,
        idKey: 'id',
        defaultExpandedIds: ['src'],
        sortSiblings: applySort,
      });
      const tree = useTableTreeData(treeConfig);
      return (
        <Table
          data={visibleData}
          columns={columns}
          idKey="id"
          plugins={{tree}}
        />
      );
    }

    render(<SortedTree />);

    const names = getBodyRows().map(
      row => within(row).getAllByRole('cell')[0].textContent,
    );
    // Roots desc: src > README.md; src's children desc: utils.ts > components.
    // Children stay directly under their parent.
    expect(names).toEqual(['src', 'utils.ts', 'components', 'README.md']);
  });
});

// =============================================================================
// header expand-all control
// =============================================================================

describe('useTableTreeData: expand-all header control', () => {
  /** The header row is the first row; return its expand-all toggle if present. */
  function queryExpandAllButton(): HTMLElement | null {
    const headerRow = screen.getAllByRole('row')[0];
    return (
      within(headerRow).queryByRole('button', {name: /expand all/i}) ??
      within(headerRow).queryByRole('button', {name: /collapse all/i})
    );
  }

  it('renders no expand-all control by default', () => {
    render(<TreeTable defaultExpandedIds={['src']} />);
    expect(queryExpandAllButton()).toBeNull();
  });

  it('renders an "Expand all" toggle in the tree column header when enabled and collapsed', () => {
    render(<TreeTable hasExpandAllControl />);
    const headerRow = screen.getAllByRole('row')[0];
    expect(
      within(headerRow).getByRole('button', {name: /expand all/i}),
    ).toBeInTheDocument();
  });

  it('expands every row when the collapsed toggle is clicked', async () => {
    const user = userEvent.setup();
    render(<TreeTable hasExpandAllControl />);

    // Collapsed: only roots are visible.
    expect(getBodyRows()).toHaveLength(2);

    await user.click(
      within(screen.getAllByRole('row')[0]).getByRole('button', {
        name: /expand all/i,
      }),
    );

    // Every level is now visible.
    expect(
      getBodyRows().map(r => within(r).getByText(/.+/, {selector: 'td *'})),
    ).not.toHaveLength(2);
    expect(screen.getByText('Button.tsx')).toBeInTheDocument();
  });

  it('relabels the toggle "Collapse all" once everything is expanded', () => {
    render(
      <TreeTable
        hasExpandAllControl
        defaultExpandedIds={['src', 'components']}
      />,
    );
    const headerRow = screen.getAllByRole('row')[0];
    expect(
      within(headerRow).getByRole('button', {name: /collapse all/i}),
    ).toBeInTheDocument();
  });

  it('collapses back to roots when the expanded toggle is clicked', async () => {
    const user = userEvent.setup();
    render(
      <TreeTable
        hasExpandAllControl
        defaultExpandedIds={['src', 'components']}
      />,
    );
    expect(screen.getByText('Button.tsx')).toBeInTheDocument();

    await user.click(
      within(screen.getAllByRole('row')[0]).getByRole('button', {
        name: /collapse all/i,
      }),
    );

    expect(getBodyRows()).toHaveLength(2);
    expect(screen.queryByText('Button.tsx')).not.toBeInTheDocument();
  });

  it('marks the toggle aria-expanded=false in the indeterminate (partial) state', () => {
    // 'src' expanded but 'components' not: partially expanded.
    render(<TreeTable hasExpandAllControl defaultExpandedIds={['src']} />);
    const headerRow = screen.getAllByRole('row')[0];
    const toggle = within(headerRow).getByRole('button', {
      name: /expand all/i,
    });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
  });

  it('does not render the control for flat data even when enabled', () => {
    const flat: FileRow[] = [
      {id: 'a', name: 'A', size: 1},
      {id: 'b', name: 'B', size: 2},
    ];
    render(<TreeTable data={flat} hasExpandAllControl />);
    expect(queryExpandAllButton()).toBeNull();
  });

  it('renders the toggle inline with the header label, not stacked above it', () => {
    render(<TreeTable hasExpandAllControl />);
    const headerRow = screen.getAllByRole('row')[0];
    const toggle = within(headerRow).getByRole('button', {
      name: /expand all/i,
    });
    // The tree column's <th> holds the label text ('Name'). The bug was that
    // the toggle went into the `before` slot, which BaseTable renders as a
    // block sibling of the label, stacking the chevron ABOVE the title. The
    // fix wraps the label + toggle in one inline-flex container, so they must
    // share the same immediate parent (the toggle is a sibling of the label,
    // not in a separate stacked slot).
    const th = toggle.closest('th');
    expect(th).not.toBeNull();
    const label = within(th as HTMLElement).getByText('Name');
    const wrapper = label.parentElement as HTMLElement;
    expect(wrapper).toContainElement(toggle);
    // The toggle precedes the label within that shared wrapper (chevron sits
    // to the LEFT of the title). StyleX compiles the inline-flex layout to a
    // class on this wrapper; assert the class is present (real CSS is not
    // applied in jsdom, so we check the class hook, not computed display).
    expect(wrapper.className).not.toBe('');
    const kids = Array.from(wrapper.childNodes);
    expect(kids.indexOf(toggle)).toBeLessThan(
      kids.findIndex(n => n.textContent === 'Name' || n.contains(label)),
    );
  });

  it('draws the shared focus ring on the toggle', () => {
    render(<TreeTable hasExpandAllControl />);

    expectSharedFocusRing(
      within(screen.getAllByRole('row')[0]).getByRole('button', {
        name: /expand all/i,
      }),
    );
  });
});

// =============================================================================
// Treegrid semantics
// =============================================================================

const flatRows: FileRow[] = [
  {id: 'a', name: 'alpha', size: 1},
  {id: 'b', name: 'beta', size: 2},
];

/** Tree + selection, nothing expanded: a row with a checkbox and a chevron. */
function TreeWithSelectionTable() {
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(
    () => new Set(),
  );
  const {visibleData, treeConfig} = useTableTreeState<FileRow>({
    data: fileTree,
    idKey: 'id',
  });
  const {selectionConfig} = useTableSelectionState({
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
      plugins={{tree, selection}}
    />
  );
}

function focusRow(text: string): HTMLElement {
  const row = getRowByText(text);
  row.focus();
  return row;
}

describe('useTableTreeData — treegrid role', () => {
  it('exposes the table as a treegrid when rows are expandable', () => {
    render(<TreeTable />);

    expect(screen.getByRole('treegrid')).toBeInTheDocument();
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('keeps the native table role for flat data', () => {
    render(<TreeTable data={flatRows} />);

    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.queryByRole('treegrid')).toBeNull();
  });

  it('drops the treegrid role when nested data becomes flat', () => {
    const {rerender} = render(<TreeTable data={fileTree} />);
    expect(screen.getByRole('treegrid')).toBeInTheDocument();

    rerender(<TreeTable data={flatRows} />);

    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.queryByRole('treegrid')).toBeNull();
  });

  it('sets aria-posinset / aria-setsize from each sibling group', () => {
    render(<TreeTable defaultExpandedIds={['src']} />);

    // Roots: src, README.md. Under src: components, utils.ts.
    expect(getRowByText('src')).toHaveAttribute('aria-posinset', '1');
    expect(getRowByText('src')).toHaveAttribute('aria-setsize', '2');
    expect(getRowByText('README.md')).toHaveAttribute('aria-posinset', '2');
    expect(getRowByText('README.md')).toHaveAttribute('aria-setsize', '2');
    expect(getRowByText('components')).toHaveAttribute('aria-posinset', '1');
    expect(getRowByText('components')).toHaveAttribute('aria-setsize', '2');
    expect(getRowByText('utils.ts')).toHaveAttribute('aria-posinset', '2');
    expect(getRowByText('utils.ts')).toHaveAttribute('aria-setsize', '2');
  });

  it('numbers aria-posinset in the sorted sibling order', () => {
    render(
      <TreeTable
        sortSiblings={siblings =>
          [...siblings].sort((a, b) =>
            a.name < b.name ? -1 : a.name > b.name ? 1 : 0,
          )
        }
      />,
    );

    // 'README.md' sorts before 'src'.
    expect(getRowByText('README.md')).toHaveAttribute('aria-posinset', '1');
    expect(getRowByText('src')).toHaveAttribute('aria-posinset', '2');
  });

  it('preserves a table ref set by an earlier plugin', () => {
    const earlierRef = vi.fn();
    function TwoPluginTable() {
      const {visibleData, treeConfig} = useTableTreeState<FileRow>({
        data: fileTree,
        idKey: 'id',
      });
      const tree = useTableTreeData(treeConfig);
      const earlier: TablePlugin<FileRow> = {
        transformTable: props => ({...props, ref: earlierRef}),
      };
      return (
        <Table
          data={visibleData}
          columns={columns}
          idKey="id"
          plugins={{earlier, tree}}
        />
      );
    }

    render(<TwoPluginTable />);

    expect(earlierRef).toHaveBeenCalledWith(screen.getByRole('treegrid'));
  });
});

// =============================================================================
// Caller props on the <Table> root
// =============================================================================

describe('useTableTreeData — caller props on the Table root', () => {
  it('keeps row navigation when the caller passes onKeyDown', () => {
    const onKeyDown = vi.fn();
    render(<TreeTable defaultExpandedIds={['src']} tableProps={{onKeyDown}} />);
    const src = focusRow('src');

    fireEvent.keyDown(src, {key: 'ArrowDown'});

    expect(onKeyDown).toHaveBeenCalledTimes(1);
    expect(getRowByText('components')).toHaveFocus();
  });

  it("lets the caller's onKeyDown opt out of row navigation with preventDefault", () => {
    render(
      <TreeTable
        defaultExpandedIds={['src']}
        tableProps={{onKeyDown: event => event.preventDefault()}}
      />,
    );
    const src = focusRow('src');

    fireEvent.keyDown(src, {key: 'ArrowDown'});

    expect(src).toHaveFocus();
  });

  it('keeps row navigation when a wrapper forwards an unset onKeyDown', () => {
    render(
      <TreeTable
        defaultExpandedIds={['src']}
        tableProps={{onKeyDown: undefined}}
      />,
    );
    const src = focusRow('src');

    fireEvent.keyDown(src, {key: 'ArrowDown'});

    expect(getRowByText('components')).toHaveFocus();
  });

  it('stays a treegrid when the caller passes a role', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    render(<TreeTable tableProps={{role: 'grid'}} />);

    expect(screen.getByRole('treegrid')).toBeInTheDocument();
    expect(warnSpy).toHaveBeenCalledTimes(1);
    warnSpy.mockRestore();
  });

  it('keeps the roving tab stop in sync when the caller passes onFocus', () => {
    const onFocus = vi.fn();
    render(<TreeTable defaultExpandedIds={['src']} tableProps={{onFocus}} />);

    const utils = getRowByText('utils.ts');
    act(() => utils.focus());

    expect(onFocus).toHaveBeenCalled();
    expect(utils).toHaveAttribute('tabindex', '0');
    expect(getRowByText('src')).toHaveAttribute('tabindex', '-1');
  });

  it('keeps the roving tab stop in sync when a wrapper forwards an unset onFocus', () => {
    render(
      <TreeTable
        defaultExpandedIds={['src']}
        tableProps={{onFocus: undefined}}
      />,
    );

    const utils = getRowByText('utils.ts');
    act(() => utils.focus());

    expect(utils).toHaveAttribute('tabindex', '0');
    expect(getRowByText('src')).toHaveAttribute('tabindex', '-1');
  });
});

// =============================================================================
// Roving tabindex (row focus)
// =============================================================================

describe('useTableTreeData — roving tabindex', () => {
  it('makes exactly one body row tabbable and the rest tabindex=-1', () => {
    render(<TreeTable defaultExpandedIds={['src']} />);

    const rows = getBodyRows();
    expect(rows[0]).toHaveAttribute('tabindex', '0');
    for (const row of rows.slice(1)) {
      expect(row).toHaveAttribute('tabindex', '-1');
    }
    // The header row is not part of the roving set.
    expect(screen.getAllByRole('row')[0]).not.toHaveAttribute('tabindex');
  });

  it('leaves rows out of the tab order for flat data', () => {
    render(<TreeTable data={flatRows} />);

    for (const row of getBodyRows()) {
      expect(row).not.toHaveAttribute('tabindex');
    }
  });

  it('drops the row tab stop when nested data becomes flat', () => {
    const {rerender} = render(<TreeTable data={fileTree} />);
    expect(getBodyRows()[0]).toHaveAttribute('tabindex', '0');

    rerender(<TreeTable data={flatRows} />);

    for (const row of getBodyRows()) {
      expect(row).not.toHaveAttribute('tabindex');
    }
  });

  it('moves the tab stop with keyboard focus', () => {
    render(<TreeTable defaultExpandedIds={['src']} />);
    const src = focusRow('src');

    fireEvent.keyDown(src, {key: 'ArrowDown'});

    expect(getRowByText('components')).toHaveAttribute('tabindex', '0');
    expect(src).toHaveAttribute('tabindex', '-1');
  });

  it('keeps the in-cell controls reachable by Tab from the focused row', async () => {
    const user = userEvent.setup();
    render(<TreeTable />);
    const src = focusRow('src');
    expect(src).toHaveFocus();

    await user.tab();

    expect(within(src).getByRole('button', {name: 'Expand row'})).toHaveFocus();
  });

  it('moves the tab stop to a row that is focused programmatically', () => {
    render(<TreeTable defaultExpandedIds={['src']} />);
    const utils = getRowByText('utils.ts');

    act(() => utils.focus());

    expect(utils).toHaveAttribute('tabindex', '0');
    expect(getRowByText('src')).toHaveAttribute('tabindex', '-1');
  });

  it('moves the tab stop to a row that is clicked', async () => {
    const user = userEvent.setup();
    render(<TreeTable defaultExpandedIds={['src']} />);
    const readme = getRowByText('README.md');

    await user.click(within(readme).getByText('README.md'));

    expect(readme).toHaveFocus();
    expect(readme).toHaveAttribute('tabindex', '0');
    expect(getRowByText('src')).toHaveAttribute('tabindex', '-1');
  });

  it('keeps the tab stop on its row when an in-cell control takes focus', () => {
    render(<TreeTable defaultExpandedIds={['src']} />);
    const chevron = within(getRowByText('components')).getByRole('button', {
      name: 'Expand row',
    });

    act(() => chevron.focus());

    expect(getRowByText('src')).toHaveAttribute('tabindex', '0');
    expect(getRowByText('components')).toHaveAttribute('tabindex', '-1');
  });

  it('walks Tab through header controls, then in-cell controls and the active row in DOM order', async () => {
    const user = userEvent.setup();
    render(
      <>
        <button type="button">Before</button>
        <TreeTable hasExpandAllControl defaultExpandedIds={['src']} />
        <button type="button">After</button>
      </>,
    );
    // Make the second row the active one.
    const src = focusRow('src');
    fireEvent.keyDown(src, {key: 'ArrowDown'});
    const components = getRowByText('components');
    expect(components).toHaveAttribute('tabindex', '0');
    act(() => screen.getByRole('button', {name: 'Before'}).focus());

    const stops: Element[] = [];
    for (let i = 0; i < 5; i++) {
      await user.tab();
      stops.push(document.activeElement!);
    }

    // A fitting table's scroll region is not a stop (it is one only while the
    // table overflows inline). Rows before the active row contribute only
    // their controls; the active row sits at its place in DOM order.
    expect(stops).toEqual([
      within(screen.getAllByRole('row')[0]).getByRole('button', {
        name: /expand all/i,
      }),
      within(src).getByRole('button', {name: 'Collapse row'}),
      components,
      within(components).getByRole('button', {name: 'Expand row'}),
      screen.getByRole('button', {name: 'After'}),
    ]);
  });
});

// =============================================================================
// Keyboard model (row focus)
// =============================================================================

describe('useTableTreeData — keyboard model', () => {
  it('ArrowDown / ArrowUp move focus across the visible rows', () => {
    render(<TreeTable defaultExpandedIds={['src']} />);
    const src = focusRow('src');

    fireEvent.keyDown(src, {key: 'ArrowDown'});
    expect(getRowByText('components')).toHaveFocus();
    fireEvent.keyDown(getRowByText('components'), {key: 'ArrowDown'});
    expect(getRowByText('utils.ts')).toHaveFocus();
    fireEvent.keyDown(getRowByText('utils.ts'), {key: 'ArrowUp'});
    expect(getRowByText('components')).toHaveFocus();
  });

  it('Home / End jump to the first and last visible rows', () => {
    render(<TreeTable defaultExpandedIds={['src']} />);
    const components = focusRow('components');

    fireEvent.keyDown(components, {key: 'End'});
    expect(getRowByText('README.md')).toHaveFocus();
    fireEvent.keyDown(getRowByText('README.md'), {key: 'Home'});
    expect(getRowByText('src')).toHaveFocus();
  });

  it('ArrowRight expands a collapsed row in place, then holds focus on the expanded row', () => {
    render(<TreeTable />);
    const src = focusRow('src');

    fireEvent.keyDown(src, {key: 'ArrowRight'});

    expect(src).toHaveAttribute('aria-expanded', 'true');
    // Focus survives the expand re-render.
    expect(src).toHaveFocus();
    expect(getRowByText('components')).toBeInTheDocument();

    // APG treegrid: ArrowRight on an expanded row moves into its first cell.
    // Row focus only (v1) has no cell to enter, so focus stays on the row
    // rather than jumping to the first child (the tree-view behavior).
    const notPrevented = fireEvent.keyDown(src, {key: 'ArrowRight'});
    expect(src).toHaveFocus();
    expect(src).toHaveAttribute('aria-expanded', 'true');
    expect(notPrevented).toBe(false);
  });

  it('ArrowLeft collapses an expanded row and holds focus on it', () => {
    render(<TreeTable defaultExpandedIds={['src']} />);
    const src = focusRow('src');

    fireEvent.keyDown(src, {key: 'ArrowLeft'});

    expect(src).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('utils.ts')).toBeNull();
    expect(src).toHaveFocus();
  });

  it('ArrowLeft on a leaf or collapsed child row does not move focus to its parent', () => {
    render(<TreeTable defaultExpandedIds={['src']} />);

    // APG treegrid: ArrowLeft on a collapsed row or a row without children
    // does not move focus (the tree-view behavior moves to the parent).
    const utils = focusRow('utils.ts');
    const notPrevented = fireEvent.keyDown(utils, {key: 'ArrowLeft'});
    expect(utils).toHaveFocus();
    expect(notPrevented).toBe(false);

    const components = focusRow('components');
    fireEvent.keyDown(components, {key: 'ArrowLeft'});
    expect(components).toHaveFocus();
    expect(components).toHaveAttribute('aria-expanded', 'false');
    expect(getRowByText('src')).toHaveAttribute('aria-expanded', 'true');
  });

  it('Enter toggles an expandable row and is inert on a leaf', () => {
    render(<TreeTable />);
    const src = focusRow('src');

    fireEvent.keyDown(src, {key: 'Enter'});
    expect(src).toHaveAttribute('aria-expanded', 'true');

    const readme = focusRow('README.md');
    fireEvent.keyDown(readme, {key: 'Enter'});
    expect(readme).not.toHaveAttribute('aria-expanded');
    expect(readme).toHaveFocus();
  });

  it('follows the reading direction: ArrowLeft expands, then holds focus, under dir="rtl"', () => {
    // jsdom resolves `direction` from an element's own `dir` only (no
    // inheritance), so the attribute goes on the <table> the hook reads.
    const rtl: TablePlugin<FileRow> = {
      transformTable: props => ({
        ...props,
        htmlProps: {...props.htmlProps, dir: 'rtl'},
      }),
    };
    function RtlTreeTable() {
      const {visibleData, treeConfig} = useTableTreeState<FileRow>({
        data: fileTree,
        idKey: 'id',
      });
      const tree = useTableTreeData(treeConfig);
      return (
        <Table
          data={visibleData}
          columns={columns}
          idKey="id"
          plugins={{rtl, tree}}
        />
      );
    }
    render(<RtlTreeTable />);
    const src = focusRow('src');

    fireEvent.keyDown(src, {key: 'ArrowLeft'});

    expect(src).toHaveAttribute('aria-expanded', 'true');

    // Inline-end on the expanded row: no first child jump, as in LTR.
    fireEvent.keyDown(src, {key: 'ArrowLeft'});
    expect(src).toHaveFocus();

    // Inline-start (ArrowRight under RTL) collapses it.
    fireEvent.keyDown(src, {key: 'ArrowRight'});
    expect(src).toHaveAttribute('aria-expanded', 'false');
  });

  it('does not typeahead on printable characters', () => {
    render(<TreeTable defaultExpandedIds={['src']} />);
    const src = focusRow('src');

    // 'r' would match README.md under tree typeahead.
    const notPrevented = fireEvent.keyDown(src, {key: 'r'});

    expect(notPrevented).toBe(true);
    expect(src).toHaveFocus();
  });

  it('leaves keys alone when they originate from a control inside a cell', () => {
    render(<TreeWithSelectionTable />);
    const src = getRowByText('src');

    // Space on the selection checkbox must keep its native meaning.
    const checkbox = within(src).getByRole('checkbox');
    checkbox.focus();
    const notPrevented = fireEvent.keyDown(checkbox, {key: ' '});
    expect(notPrevented).toBe(true);
    expect(src).toHaveAttribute('aria-expanded', 'false');

    // Arrow keys from the chevron button do not move row focus.
    const chevron = within(src).getByRole('button', {name: 'Expand row'});
    chevron.focus();
    fireEvent.keyDown(chevron, {key: 'ArrowDown'});
    expect(chevron).toHaveFocus();
  });
});

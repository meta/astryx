// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file useTableTreeState.test.tsx
 * @input Uses vitest, @testing-library/react
 * @output Unit tests for useTableTreeState hook
 * @position Testing; validates tree expansion state + nested-data flattening
 */

import {describe, it, expect, vi} from 'vitest';
import {Suspense, startTransition, use} from 'react';
import {act, render, renderHook, screen, within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {Table} from '../../Table';
import type {TableColumn} from '../../types';
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

/**
 * src/
 *   components/
 *     Button.tsx
 *     Input.tsx
 *   utils.ts
 * README.md
 */
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
        children: [
          {id: 'button', name: 'Button.tsx', size: 120},
          {id: 'input', name: 'Input.tsx', size: 80},
        ],
      },
      {id: 'utils', name: 'utils.ts', size: 40},
    ],
  },
  {id: 'readme', name: 'README.md', size: 10},
];

const ids = (rows: FileRow[]) => rows.map(r => r.id);

// =============================================================================
// Flattening
// =============================================================================

describe('useTableTreeState — flattening', () => {
  it('emits only root rows when nothing is expanded', () => {
    const {result} = renderHook(() =>
      useTableTreeState({data: fileTree, idKey: 'id'}),
    );

    expect(ids(result.current.visibleData)).toEqual(['src', 'readme']);
  });

  it('reveals children of defaultExpandedIds in depth-first order', () => {
    const {result} = renderHook(() =>
      useTableTreeState({
        data: fileTree,
        idKey: 'id',
        defaultExpandedIds: ['src', 'components'],
      }),
    );

    expect(ids(result.current.visibleData)).toEqual([
      'src',
      'components',
      'button',
      'input',
      'utils',
      'readme',
    ]);
  });

  it('keeps a collapsed subtree unmounted even when its descendants are in the expanded set', () => {
    // 'components' is expanded but its parent 'src' is not — nothing below
    // 'src' is visible.
    const {result} = renderHook(() =>
      useTableTreeState({
        data: fileTree,
        idKey: 'id',
        defaultExpandedIds: ['components'],
      }),
    );

    expect(ids(result.current.visibleData)).toEqual(['src', 'readme']);
  });
});

// =============================================================================
// Toggling (uncontrolled)
// =============================================================================

describe('useTableTreeState — uncontrolled toggling', () => {
  it('expands a row via treeConfig.onToggleItem', () => {
    const {result} = renderHook(() =>
      useTableTreeState({data: fileTree, idKey: 'id'}),
    );

    act(() => {
      result.current.treeConfig.onToggleItem(fileTree[0]);
    });

    expect(ids(result.current.visibleData)).toEqual([
      'src',
      'components',
      'utils',
      'readme',
    ]);
  });

  it('collapses an expanded row via treeConfig.onToggleItem', () => {
    const {result} = renderHook(() =>
      useTableTreeState({
        data: fileTree,
        idKey: 'id',
        defaultExpandedIds: ['src'],
      }),
    );

    act(() => {
      result.current.treeConfig.onToggleItem(fileTree[0]);
    });

    expect(ids(result.current.visibleData)).toEqual(['src', 'readme']);
  });
});

// =============================================================================
// Controlled mode
// =============================================================================

describe('useTableTreeState — controlled mode', () => {
  it('derives visibility from the controlled expandedIds set', () => {
    const {result, rerender} = renderHook(
      ({expanded}: {expanded: ReadonlySet<string>}) =>
        useTableTreeState({
          data: fileTree,
          idKey: 'id',
          expandedIds: expanded,
          onExpandedIdsChange: () => {},
        }),
      {initialProps: {expanded: new Set<string>()}},
    );

    expect(ids(result.current.visibleData)).toEqual(['src', 'readme']);

    rerender({expanded: new Set(['src'])});
    expect(ids(result.current.visibleData)).toEqual([
      'src',
      'components',
      'utils',
      'readme',
    ]);
  });

  it('reports toggles through onExpandedIdsChange without mutating its own state', () => {
    const onExpandedIdsChange = vi.fn();
    const {result} = renderHook(() =>
      useTableTreeState({
        data: fileTree,
        idKey: 'id',
        expandedIds: new Set<string>(),
        onExpandedIdsChange,
      }),
    );

    act(() => {
      result.current.treeConfig.onToggleItem(fileTree[0]);
    });

    expect(onExpandedIdsChange).toHaveBeenCalledWith(new Set(['src']));
    // Controlled: the visible rows only change when the owner passes a new set.
    expect(ids(result.current.visibleData)).toEqual(['src', 'readme']);
  });

  it('fires onExpandedIdsChange in uncontrolled mode too', () => {
    const onExpandedIdsChange = vi.fn();
    const {result} = renderHook(() =>
      useTableTreeState({
        data: fileTree,
        idKey: 'id',
        onExpandedIdsChange,
      }),
    );

    act(() => {
      result.current.treeConfig.onToggleItem(fileTree[0]);
    });

    expect(onExpandedIdsChange).toHaveBeenCalledWith(new Set(['src']));
    expect(ids(result.current.visibleData)).toEqual([
      'src',
      'components',
      'utils',
      'readme',
    ]);
  });
});

// =============================================================================
// expandAll / collapseAll
// =============================================================================

describe('useTableTreeState — expandAll / collapseAll', () => {
  it('expandAll reveals every level of the tree', () => {
    const {result} = renderHook(() =>
      useTableTreeState({data: fileTree, idKey: 'id'}),
    );

    act(() => {
      result.current.expandAll();
    });

    expect(ids(result.current.visibleData)).toEqual([
      'src',
      'components',
      'button',
      'input',
      'utils',
      'readme',
    ]);
  });

  it('collapseAll returns to roots only', () => {
    const {result} = renderHook(() =>
      useTableTreeState({
        data: fileTree,
        idKey: 'id',
        defaultExpandedIds: ['src', 'components'],
      }),
    );

    act(() => {
      result.current.collapseAll();
    });

    expect(ids(result.current.visibleData)).toEqual(['src', 'readme']);
  });

  it('exposes the current expandedIds set', () => {
    const {result} = renderHook(() =>
      useTableTreeState({
        data: fileTree,
        idKey: 'id',
        defaultExpandedIds: ['src'],
      }),
    );

    expect(result.current.expandedIds).toEqual(new Set(['src']));
  });
});

// =============================================================================
// Row meta
// =============================================================================

describe('useTableTreeState — row meta', () => {
  it('reports 0-based level, hasChildren, and isExpanded per row', () => {
    const {result} = renderHook(() =>
      useTableTreeState({
        data: fileTree,
        idKey: 'id',
        defaultExpandedIds: ['src', 'components'],
      }),
    );

    const meta = (id: string) => {
      const item = result.current.visibleData.find(r => r.id === id);
      if (!item) {
        throw new Error(`row ${id} not visible`);
      }
      return result.current.treeConfig.getRowMeta(item);
    };

    expect(meta('src')).toEqual({
      id: 'src',
      level: 0,
      hasChildren: true,
      isExpanded: true,
    });
    expect(meta('components')).toEqual({
      id: 'components',
      level: 1,
      hasChildren: true,
      isExpanded: true,
    });
    expect(meta('button')).toEqual({
      id: 'button',
      level: 2,
      hasChildren: false,
      isExpanded: false,
    });
    expect(meta('readme')).toEqual({
      id: 'readme',
      level: 0,
      hasChildren: false,
      isExpanded: false,
    });
  });

  it('treats an empty children array as a leaf', () => {
    const data: FileRow[] = [
      {id: 'a', name: 'a', size: 0, children: []},
      {id: 'b', name: 'b', size: 0, children: [{id: 'c', name: 'c', size: 0}]},
    ];
    const {result} = renderHook(() => useTableTreeState({data, idKey: 'id'}));

    expect(result.current.treeConfig.getRowMeta(data[0])?.hasChildren).toBe(
      false,
    );
    expect(result.current.treeConfig.getRowMeta(data[1])?.hasChildren).toBe(
      true,
    );
  });

  it('flags hasExpandableRows=false for flat data (migration no-op)', () => {
    const flat: FileRow[] = [
      {id: 'a', name: 'a', size: 1},
      {id: 'b', name: 'b', size: 2},
    ];
    const {result} = renderHook(() =>
      useTableTreeState({data: flat, idKey: 'id'}),
    );

    expect(result.current.treeConfig.hasExpandableRows).toBe(false);
  });

  it('flags hasExpandableRows=true when any row has children', () => {
    const {result} = renderHook(() =>
      useTableTreeState({data: fileTree, idKey: 'id'}),
    );

    expect(result.current.treeConfig.hasExpandableRows).toBe(true);
  });
});

// =============================================================================
// Lazy loading (isItemExpandable)
// =============================================================================

describe('useTableTreeState — isItemExpandable', () => {
  it('forces an expander on rows whose children have not loaded yet', () => {
    const lazy: FileRow[] = [
      {id: 'folder', name: 'folder', size: 0}, // no children yet
      {id: 'file', name: 'file', size: 5},
    ];
    const {result} = renderHook(() =>
      useTableTreeState({
        data: lazy,
        idKey: 'id',
        isItemExpandable: item => item.id === 'folder',
      }),
    );

    expect(result.current.treeConfig.getRowMeta(lazy[0])?.hasChildren).toBe(
      true,
    );
    expect(result.current.treeConfig.getRowMeta(lazy[1])?.hasChildren).toBe(
      false,
    );
    expect(result.current.treeConfig.hasExpandableRows).toBe(true);
  });

  it('expandAll includes isItemExpandable rows without loaded children', () => {
    const lazy: FileRow[] = [{id: 'folder', name: 'folder', size: 0}];
    const onExpandedIdsChange = vi.fn();
    const {result} = renderHook(() =>
      useTableTreeState({
        data: lazy,
        idKey: 'id',
        isItemExpandable: () => true,
        onExpandedIdsChange,
      }),
    );

    act(() => {
      result.current.expandAll();
    });

    expect(onExpandedIdsChange).toHaveBeenCalledWith(new Set(['folder']));
  });
});

// =============================================================================
// Sibling sorting
// =============================================================================

describe('useTableTreeState — sortSiblings', () => {
  it('sorts within sibling groups, never across levels', () => {
    const byNameDesc = (siblings: FileRow[]) =>
      [...siblings].sort((a, b) => b.name.localeCompare(a.name));

    const {result} = renderHook(() =>
      useTableTreeState({
        data: fileTree,
        idKey: 'id',
        defaultExpandedIds: ['src', 'components'],
        sortSiblings: byNameDesc,
      }),
    );

    // Roots sorted desc: src > README.md; src's children desc: utils > components;
    // components' children desc: Input.tsx > Button.tsx. Children always stay
    // directly under their parent.
    expect(ids(result.current.visibleData)).toEqual([
      'src',
      'utils',
      'components',
      'input',
      'button',
      'readme',
    ]);
  });
});

// =============================================================================
// Accessors
// =============================================================================

describe('useTableTreeState — accessors', () => {
  it('supports a custom childrenKey', () => {
    interface OrgRow extends Record<string, unknown> {
      id: string;
      reports?: OrgRow[];
    }
    const org: OrgRow[] = [{id: 'ceo', reports: [{id: 'cto'}, {id: 'cfo'}]}];
    const {result} = renderHook(() =>
      useTableTreeState({
        data: org,
        idKey: 'id',
        childrenKey: 'reports',
        defaultExpandedIds: ['ceo'],
      }),
    );

    expect(result.current.visibleData.map(r => r.id)).toEqual([
      'ceo',
      'cto',
      'cfo',
    ]);
  });

  it('supports a function idKey returning numbers', () => {
    interface NumRow extends Record<string, unknown> {
      num: number;
      children?: NumRow[];
    }
    const data: NumRow[] = [{num: 1, children: [{num: 2}]}];
    const {result} = renderHook(() =>
      useTableTreeState({
        data,
        idKey: item => item.num,
        defaultExpandedIds: ['1'],
      }),
    );

    expect(result.current.visibleData.map(r => r.num)).toEqual([1, 2]);
  });

  it('passes indent and treeColumnKey through to the tree config', () => {
    const {result} = renderHook(() =>
      useTableTreeState({
        data: fileTree,
        idKey: 'id',
        indent: 'lg',
        treeColumnKey: 'name',
      }),
    );

    expect(result.current.treeConfig.indent).toBe('lg');
    expect(result.current.treeConfig.treeColumnKey).toBe('name');
  });
});

// =============================================================================
// Hostile / degenerate data
// =============================================================================

describe('useTableTreeState — hostile data', () => {
  it('does not blow the stack on a self-referencing cycle', () => {
    const a: FileRow = {id: 'a', name: 'a', size: 0};
    a.children = [a]; // self-cycle
    const {result} = renderHook(() =>
      useTableTreeState({
        data: [a],
        idKey: 'id',
        defaultExpandedIds: ['a'],
      }),
    );

    // The cyclic edge is skipped: 'a' renders exactly once.
    expect(ids(result.current.visibleData)).toEqual(['a']);
  });

  it('does not blow the stack when a descendant points back at an ancestor', () => {
    const parent: FileRow = {id: 'p', name: 'p', size: 0};
    const child: FileRow = {id: 'c', name: 'c', size: 0, children: [parent]};
    parent.children = [child];
    const {result} = renderHook(() =>
      useTableTreeState({
        data: [parent],
        idKey: 'id',
        defaultExpandedIds: ['p', 'c'],
      }),
    );

    expect(ids(result.current.visibleData)).toEqual(['p', 'c']);
  });

  it('renders duplicate ids in different subtrees without crashing (shared expansion state)', () => {
    const data: FileRow[] = [
      {
        id: 'x',
        name: 'first-x',
        size: 0,
        children: [{id: 'dup', name: 'dup-under-x', size: 1}],
      },
      {
        id: 'y',
        name: 'second-y',
        size: 0,
        children: [{id: 'dup', name: 'dup-under-y', size: 2}],
      },
    ];
    const {result} = renderHook(() =>
      useTableTreeState({
        data,
        idKey: 'id',
        defaultExpandedIds: ['x', 'y'],
      }),
    );

    // Both duplicate rows stay visible; ids sharing a key share expansion.
    expect(ids(result.current.visibleData)).toEqual(['x', 'dup', 'y', 'dup']);
  });

  it('ignores expanded ids that match no row', () => {
    const {result} = renderHook(() =>
      useTableTreeState({
        data: fileTree,
        idKey: 'id',
        defaultExpandedIds: ['ghost', 'src'],
      }),
    );

    expect(ids(result.current.visibleData)).toEqual([
      'src',
      'components',
      'utils',
      'readme',
    ]);
  });

  it('handles empty data', () => {
    const {result} = renderHook(() =>
      useTableTreeState<FileRow>({data: [], idKey: 'id'}),
    );

    expect(result.current.visibleData).toEqual([]);
    expect(result.current.treeConfig.hasExpandableRows).toBe(false);
    act(() => {
      result.current.expandAll(); // must not throw
    });
    expect(result.current.expandedIds).toEqual(new Set());
  });

  it('never mutates the consumer data when sortSiblings sorts in place', () => {
    const inPlaceSorter = (siblings: FileRow[]) =>
      siblings.sort((a, b) => b.name.localeCompare(a.name));

    const childOrderBefore = fileTree[0].children!.map(c => c.id);
    renderHook(() =>
      useTableTreeState({
        data: fileTree,
        idKey: 'id',
        defaultExpandedIds: ['src'],
        sortSiblings: inPlaceSorter,
      }),
    );

    expect(fileTree[0].children!.map(c => c.id)).toEqual(childOrderBefore);
  });
});

// =============================================================================
// Semantics edge cases
// =============================================================================

describe('useTableTreeState — semantics edges', () => {
  it('defaultExpandedIds is ignored when expandedIds is controlled', () => {
    const {result} = renderHook(() =>
      useTableTreeState({
        data: fileTree,
        idKey: 'id',
        defaultExpandedIds: ['src'],
        expandedIds: new Set<string>(),
        onExpandedIdsChange: () => {},
      }),
    );

    expect(ids(result.current.visibleData)).toEqual(['src', 'readme']);
  });

  it('toggling a leaf never marks it expanded', () => {
    const {result} = renderHook(() =>
      useTableTreeState({data: fileTree, idKey: 'id'}),
    );
    const readme = fileTree[1];

    act(() => {
      result.current.treeConfig.onToggleItem(readme);
    });

    expect(result.current.treeConfig.getRowMeta(readme)).toEqual({
      id: 'readme',
      level: 0,
      hasChildren: false,
      isExpanded: false,
    });
    expect(ids(result.current.visibleData)).toEqual(['src', 'readme']);
  });
});

// =============================================================================
// isAllExpanded (drives the header expand-all control)
// =============================================================================

describe('useTableTreeState: isAllExpanded', () => {
  it('reports false when nothing is expanded', () => {
    const {result} = renderHook(() =>
      useTableTreeState({data: fileTree, idKey: 'id'}),
    );

    expect(result.current.isAllExpanded).toBe(false);
  });

  it('reports true only when every expandable row is expanded', () => {
    const {result} = renderHook(() =>
      useTableTreeState({data: fileTree, idKey: 'id'}),
    );

    act(() => {
      result.current.expandAll();
    });

    expect(result.current.isAllExpanded).toBe(true);
  });

  it("reports 'indeterminate' when some but not all expandable rows are expanded", () => {
    const {result} = renderHook(() =>
      useTableTreeState({
        data: fileTree,
        idKey: 'id',
        defaultExpandedIds: ['src'],
      }),
    );

    // 'src' and 'components' are both expandable; only 'src' is expanded.
    expect(result.current.isAllExpanded).toBe('indeterminate');
  });

  it('returns to false after collapseAll', () => {
    const {result} = renderHook(() =>
      useTableTreeState({
        data: fileTree,
        idKey: 'id',
        defaultExpandedIds: ['src', 'components'],
      }),
    );

    act(() => {
      result.current.collapseAll();
    });

    expect(result.current.isAllExpanded).toBe(false);
  });

  it('reports false for flat data (no expandable rows)', () => {
    const flat: FileRow[] = [
      {id: 'a', name: 'A', size: 1},
      {id: 'b', name: 'B', size: 2},
    ];
    const {result} = renderHook(() =>
      useTableTreeState({data: flat, idKey: 'id'}),
    );

    expect(result.current.isAllExpanded).toBe(false);
  });

  it('ignores expanded ids that match no expandable row when aggregating', () => {
    // 'readme' is a leaf (not expandable) and 'ghost' matches nothing; neither
    // should count toward the expandable total, so an all-expandable set that
    // omits them still reads as fully expanded.
    const {result} = renderHook(() =>
      useTableTreeState({
        data: fileTree,
        idKey: 'id',
        defaultExpandedIds: ['src', 'components', 'readme', 'ghost'],
      }),
    );

    expect(result.current.isAllExpanded).toBe(true);
  });

  it('exposes the aggregate state and expand/collapse handlers through treeConfig', () => {
    const {result} = renderHook(() =>
      useTableTreeState({data: fileTree, idKey: 'id'}),
    );

    // The headless plugin reads everything it needs to render the header
    // expand-all control from treeConfig, not from the state hook directly.
    expect(result.current.treeConfig.isAllExpanded).toBe(false);

    act(() => {
      result.current.treeConfig.onExpandAll?.();
    });
    expect(result.current.isAllExpanded).toBe(true);
    expect(result.current.treeConfig.isAllExpanded).toBe(true);

    act(() => {
      result.current.treeConfig.onCollapseAll?.();
    });
    expect(result.current.isAllExpanded).toBe(false);
    expect(result.current.treeConfig.isAllExpanded).toBe(false);
  });
});

// A render that reads this promise suspends for good.
const pending = new Promise<never>(() => {});
function Pending(): null {
  use(pending);
  return null;
}

const nameColumn: TableColumn<FileRow>[] = [{key: 'name', header: 'Name'}];

type FileTreeState = Pick<
  UseTableTreeStateConfig<FileRow>,
  'expandedIds' | 'onExpandedIdsChange'
>;

function FileTree(state: FileTreeState) {
  const {visibleData, treeConfig} = useTableTreeState<FileRow>({
    data: fileTree,
    idKey: 'id',
    ...state,
  });
  const tree = useTableTreeData(treeConfig);
  return (
    <Table
      data={visibleData}
      columns={nameColumn}
      idKey="id"
      plugins={{tree}}
    />
  );
}

function FileTable({
  isPending,
  ...state
}: FileTreeState & {isPending: boolean}) {
  return (
    <Suspense fallback={null}>
      <FileTree {...state} />
      {isPending ? <Pending /> : null}
    </Suspense>
  );
}

describe('useTableTreeState after a render React discards', () => {
  it('a row toggle starts from the rows on screen and reports to the committed callback', async () => {
    const user = userEvent.setup();
    const committed: string[][] = [];
    const discarded: string[][] = [];
    const {rerender} = render(
      <FileTable
        expandedIds={new Set()}
        onExpandedIdsChange={next => committed.push([...next])}
        isPending={false}
      />,
    );
    // The next props render in a transition, then suspend for good, so React
    // keeps the committed tree and never commits that render.
    await act(async () => {
      startTransition(() => {
        rerender(
          <FileTable
            expandedIds={new Set(['src'])}
            onExpandedIdsChange={next => discarded.push([...next])}
            isPending
          />,
        );
      });
    });
    const srcRow = screen
      .getAllByRole('row')
      .find(row => within(row).queryByText('src') != null);

    await user.click(
      within(srcRow as HTMLElement).getByRole('button', {name: 'Expand row'}),
    );

    expect(discarded).toEqual([]);
    expect(committed).toEqual([['src']]);
  });
});

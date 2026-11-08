// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file useTableStickyColumns.test.tsx
 * @input useTableStickyColumns, Table, React testing utilities
 * @output Functional tests for the sticky-columns plugin
 * @position Test file; validates pinning, cumulative offsets, edges, no-op
 *
 * Note: `position: sticky` and the z-index/background are applied via StyleX
 * (compiled to classNames), which jsdom does not resolve to `element.style`.
 * The plugin sets the per-column *offset* (`insetInlineStart`/`insetInlineEnd`)
 * as an inline style, so these tests assert on those inline offsets — the
 * jsdom-visible, plugin-owned signal that a column is pinned and at what offset.
 */

import {afterEach, describe, it, expect, vi} from 'vitest';
import {render, screen} from '@testing-library/react';
import {Table} from '../../Table';
import {useTableStickyColumns} from './useTableStickyColumns';
import {useTableColumnResize} from '../columnResize/useTableColumnResize';
import {pixel, proportional} from '../../columnUtils';
import type {TableColumn} from '../../types';

// =============================================================================
// Test Data
// =============================================================================

interface Row extends Record<string, unknown> {
  id: string;
  name: string;
  email: string;
  team: string;
  status: string;
}

const data: Row[] = [
  {id: '1', name: 'Alice', email: 'a@x.com', team: 'DS', status: 'Active'},
  {id: '2', name: 'Bob', email: 'b@x.com', team: 'Plat', status: 'Away'},
];

const columns: TableColumn<Row>[] = [
  {key: 'name', header: 'Name', width: pixel(180)},
  {key: 'email', header: 'Email', width: pixel(220)},
  {key: 'team', header: 'Team', width: pixel(160)},
  {key: 'status', header: 'Status', width: pixel(140)},
];

function getHeader(name: string): HTMLElement {
  return screen.getByRole('columnheader', {name});
}

// =============================================================================
// Tests
// =============================================================================

describe('useTableStickyColumns', () => {
  it('pins a start column at inset-inline-start: 0', () => {
    function Harness() {
      const sticky = useTableStickyColumns<Row>({startKeys: ['name']});
      return (
        <Table
          data={data}
          columns={columns}
          idKey="id"
          plugins={{stickyColumns: sticky}}
        />
      );
    }
    render(<Harness />);
    expect(getHeader('Name').style.insetInlineStart).toBe('0px');
  });

  it('computes cumulative start offsets for contiguous pinned columns', () => {
    function Harness() {
      const sticky = useTableStickyColumns<Row>({
        startKeys: ['name', 'email'],
      });
      return (
        <Table
          data={data}
          columns={columns}
          idKey="id"
          plugins={{stickyColumns: sticky}}
        />
      );
    }
    render(<Harness />);
    // name is first → offset 0; email follows → offset = name width (180px)
    expect(getHeader('Name').style.insetInlineStart).toBe('0px');
    expect(getHeader('Email').style.insetInlineStart).toBe('180px');
  });

  it('uses the width-less floor for cumulative pinned offsets', () => {
    const widthLessColumns: TableColumn<Row>[] = [
      {key: 'name', header: 'Name'},
      {key: 'email', header: 'Email'},
      {key: 'team', header: 'Team'},
    ];

    function Harness() {
      const sticky = useTableStickyColumns<Row>({
        startKeys: ['name', 'email'],
      });
      return (
        <Table
          data={data}
          columns={widthLessColumns}
          idKey="id"
          plugins={{stickyColumns: sticky}}
        />
      );
    }

    render(<Harness />);
    expect(getHeader('Name').style.insetInlineStart).toBe('0px');
    expect(getHeader('Email').style.insetInlineStart).toBe('60px');
  });

  it('offsets a pinned column by the rendered width of a width-less neighbor', () => {
    // At overflow the table sits at its minimum width (3 × 120px here), so the
    // width-less Name column renders at 120px, not its own 60px floor.
    const mixedColumns: TableColumn<Row>[] = [
      {key: 'name', header: 'Name'},
      {key: 'email', header: 'Email', width: proportional(1)},
      {key: 'team', header: 'Team', width: proportional(1)},
    ];

    function Harness() {
      const sticky = useTableStickyColumns<Row>({
        startKeys: ['name', 'email'],
      });
      return (
        <Table
          data={data}
          columns={mixedColumns}
          idKey="id"
          plugins={{stickyColumns: sticky}}
        />
      );
    }

    render(<Harness />);
    expect(getHeader('Name').style.insetInlineStart).toBe('0px');
    expect(getHeader('Email').style.insetInlineStart).toBe('120px');
  });

  it('pins an end column at inset-inline-end: 0', () => {
    function Harness() {
      const sticky = useTableStickyColumns<Row>({endKeys: ['status']});
      return (
        <Table
          data={data}
          columns={columns}
          idKey="id"
          plugins={{stickyColumns: sticky}}
        />
      );
    }
    render(<Harness />);
    expect(getHeader('Status').style.insetInlineEnd).toBe('0px');
  });

  it('pins body cells, not just headers', () => {
    function Harness() {
      const sticky = useTableStickyColumns<Row>({startKeys: ['name']});
      return (
        <Table
          data={data}
          columns={columns}
          idKey="id"
          plugins={{stickyColumns: sticky}}
        />
      );
    }
    render(<Harness />);
    const firstBodyCell = screen.getByText('Alice').closest('td');
    expect(firstBodyCell).not.toBeNull();
    expect(firstBodyCell!.style.insetInlineStart).toBe('0px');
  });

  it('is a no-op with an empty config — no cell gets an offset', () => {
    function Harness() {
      const sticky = useTableStickyColumns<Row>({});
      return (
        <Table
          data={data}
          columns={columns}
          idKey="id"
          plugins={{stickyColumns: sticky}}
        />
      );
    }
    render(<Harness />);
    for (const header of ['Name', 'Email', 'Team', 'Status']) {
      const th = getHeader(header);
      expect(th.style.insetInlineStart).toBe('');
      expect(th.style.insetInlineEnd).toBe('');
    }
  });

  it('only pins configured columns, leaving others unset', () => {
    function Harness() {
      const sticky = useTableStickyColumns<Row>({startKeys: ['name']});
      return (
        <Table
          data={data}
          columns={columns}
          idKey="id"
          plugins={{stickyColumns: sticky}}
        />
      );
    }
    render(<Harness />);
    expect(getHeader('Name').style.insetInlineStart).toBe('0px');
    expect(getHeader('Team').style.insetInlineStart).toBe('');
    expect(getHeader('Team').style.insetInlineEnd).toBe('');
  });

  /**
   * Composition with the resize plugin. Both plugins contribute `position` to
   * the same header cell — resize appends `relative` for its handle's
   * containing block — so the pin has to survive either insertion order. The
   * plugin writes `position` inline for exactly that reason, which also makes
   * it the jsdom-visible signal.
   */
  describe('composition with the column-resize plugin', () => {
    /**
     * With the resize plugin mounted, each header cell also contains the
     * handle's own labelled element, so the cell's accessible name is no
     * longer just its header text. Address the cell by its column key.
     */
    function getHeaderCell(key: string): HTMLElement {
      const cell = document.querySelector<HTMLElement>(
        `th[data-column-key="${key}"]`,
      );
      if (!cell) {
        throw new Error(`header cell not found: ${key}`);
      }
      return cell;
    }

    function StickyResizeHarness({
      resizeFirst,
    }: {
      resizeFirst: boolean;
    }): React.ReactElement {
      const sticky = useTableStickyColumns<Row>({startKeys: ['name']});
      const resize = useTableColumnResize<Row>({
        columns: columns as TableColumn<Record<string, unknown>>[],
      });
      return (
        <Table
          data={data}
          columns={columns}
          idKey="id"
          plugins={
            resizeFirst
              ? {resize, stickyColumns: sticky}
              : {stickyColumns: sticky, resize}
          }
        />
      );
    }

    it('keeps a pinned column sticky with resize declared first', () => {
      render(<StickyResizeHarness resizeFirst={true} />);
      expect(getHeaderCell('name').style.position).toBe('sticky');
      expect(getHeaderCell('name').style.insetInlineStart).toBe('0px');
    });

    it('keeps a pinned column sticky with sticky declared first', () => {
      render(<StickyResizeHarness resizeFirst={false} />);
      expect(getHeaderCell('name').style.position).toBe('sticky');
      expect(getHeaderCell('name').style.insetInlineStart).toBe('0px');
    });

    it('leaves unpinned columns to the resize plugin', () => {
      render(<StickyResizeHarness resizeFirst={true} />);
      // Only pinned cells get an inline position; the rest keep whatever the
      // resize plugin's own styles give them.
      expect(getHeaderCell('team').style.position).toBe('');
    });
  });

  describe('the scroll container attaches once', () => {
    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it.each([true, false])(
      'keeps one attach across renders with column resize composed (resize first: %s)',
      resizeFirst => {
        let observers = 0;
        vi.stubGlobal(
          'ResizeObserver',
          class {
            constructor() {
              observers += 1;
            }
            observe() {}
            unobserve() {}
            disconnect() {}
          },
        );
        function Harness({tick}: {tick: number}) {
          const sticky = useTableStickyColumns<Row>({startKeys: ['name']});
          const resize = useTableColumnResize<Row>({
            columns: columns as TableColumn<Record<string, unknown>>[],
          });
          return (
            <Table
              data={data}
              columns={columns}
              idKey="id"
              aria-describedby={`tick-${tick}`}
              plugins={
                resizeFirst
                  ? {resize, stickyColumns: sticky}
                  : {stickyColumns: sticky, resize}
              }
            />
          );
        }
        const {rerender} = render(<Harness tick={0} />);
        const attached = observers;
        rerender(<Harness tick={1} />);
        rerender(<Harness tick={2} />);
        rerender(<Harness tick={3} />);
        // Three plain re-renders: no plugin's scroll container re-attaches.
        expect(observers).toBe(attached);
      },
    );
  });
});

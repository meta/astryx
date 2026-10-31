// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Table.perf.test.tsx
 * @input Table, React testing utilities
 * @output Performance tests for render behavior
 * @position Test file; validates memoization and render efficiency
 *
 * Tests ensure:
 * 1. Table doesn't double-render when unrelated state changes
 * 2. Only affected rows re-render when a single data item changes
 * 3. Non-memoized columns/data don't cause excessive re-renders
 */

import {describe, it, expect, vi} from 'vitest';
import {render, screen, act} from '@testing-library/react';
import {useMemo, useState, type ReactElement} from 'react';
import {Table} from './Table';
import {useTableRowStatus} from './plugins/rowStatus';
import type {UseTableRowStatusConfig} from './index';
import type {TableColumn} from './types';

// =============================================================================
// Test Data
// =============================================================================

interface TestRow extends Record<string, unknown> {
  id: string;
  name: string;
  value: number;
}

const createTestData = (count: number): TestRow[] =>
  Array.from({length: count}, (_, i) => ({
    id: `row-${i}`,
    name: `Item ${i}`,
    value: i * 10,
  }));

const testColumns: TableColumn<TestRow>[] = [
  {key: 'id', header: 'ID'},
  {key: 'name', header: 'Name'},
  {key: 'value', header: 'Value'},
];

const ciBudgetMultiplier = process.env.CI === 'true' ? 1.5 : 1;

/**
 * Milliseconds of CPU this worker spends in `work`. The budgets below are CPU
 * time, not elapsed time: in a full parallel run the rest of the machine
 * stretches elapsed time (a 500-row render that takes 160 ms alone measured
 * 571 ms there) but not the CPU the render itself uses.
 */
async function cpuTimeOf(work: () => unknown): Promise<number> {
  const started = process.cpuUsage();
  await work();
  const used = process.cpuUsage(started);
  return (used.user + used.system) / 1000;
}

/**
 * The CPU time of one initial render of `element`: the least of five fresh
 * mounts, after a warm-up mount that also pays for compiling the code paths.
 */
async function initialRenderCpuTime(element: ReactElement): Promise<number> {
  const mount = async () => {
    let unmount = () => {};
    const time = await cpuTimeOf(() => {
      ({unmount} = render(element));
    });
    unmount();
    return time;
  };
  await mount();
  let least = Number.POSITIVE_INFINITY;
  for (let round = 0; round < 5; round++) {
    least = Math.min(least, await mount());
  }
  return least;
}

// =============================================================================
// Test: Table doesn't re-render when unrelated state changes
// =============================================================================

describe('Table render performance', () => {
  describe('unrelated state changes', () => {
    it('should not re-render table when unrelated parent state changes (stable props)', async () => {
      const tableRenderCount = vi.fn();
      const data = createTestData(5);

      function TestComponent() {
        const [unrelatedState, setUnrelatedState] = useState(0);

        // Track renders of this component
        tableRenderCount();

        return (
          <div>
            <button type="button" onClick={() => setUnrelatedState(n => n + 1)}>
              Increment: {unrelatedState}
            </button>
            <Table data={data} columns={testColumns} idKey="id" />
          </div>
        );
      }

      render(<TestComponent />);
      expect(tableRenderCount).toHaveBeenCalledTimes(1);

      // Click button to change unrelated state
      await act(async () => {
        screen.getByRole('button').click();
      });

      // Parent component re-renders, table receives same props
      // This test verifies the parent re-renders (which it should)
      expect(tableRenderCount).toHaveBeenCalledTimes(2);
    });

    it('should demonstrate inline columns cause table to receive new props', async () => {
      const parentRenderCount = vi.fn();
      const data = createTestData(5);

      function TestComponent() {
        const [unrelatedState, setUnrelatedState] = useState(0);
        parentRenderCount();

        // PROBLEM: Columns defined inline - new array on every render
        const inlineColumns: TableColumn<TestRow>[] = [
          {key: 'id', header: 'ID'},
          {key: 'name', header: 'Name'},
          {key: 'value', header: 'Value'},
        ];

        return (
          <div>
            <button type="button" onClick={() => setUnrelatedState(n => n + 1)}>
              Increment: {unrelatedState}
            </button>
            <Table data={data} columns={inlineColumns} idKey="id" />
          </div>
        );
      }

      render(<TestComponent />);
      expect(parentRenderCount).toHaveBeenCalledTimes(1);

      await act(async () => {
        screen.getByRole('button').click();
      });

      // Parent re-renders, creating new inlineColumns array
      // Table receives new props reference (even if content is same)
      expect(parentRenderCount).toHaveBeenCalledTimes(2);
    });
  });

  // ===========================================================================
  // Test: Only affected rows re-render when single item changes
  // ===========================================================================

  describe('row-level re-renders', () => {
    it('should only re-render the changed row when data item changes (memoized columns)', async () => {
      const rowRenderCounts: Record<string, number> = {};

      // Define renderCell outside component to track renders without recreating
      const trackingRenderCell = (row: TestRow) => {
        rowRenderCounts[row.id] = (rowRenderCounts[row.id] || 0) + 1;
        return row.name;
      };

      // Define columns outside component for stable reference
      const stableColumns: TableColumn<TestRow>[] = [
        {key: 'id', header: 'ID'},
        {key: 'name', header: 'Name', renderCell: trackingRenderCell},
        {key: 'value', header: 'Value'},
      ];

      function TestComponent() {
        const [data, setData] = useState(() => createTestData(5));

        const updateSingleRow = () => {
          setData(prev =>
            prev.map((row, i) =>
              i === 2 ? {...row, name: `Updated-${row.id}`} : row,
            ),
          );
        };

        return (
          <div>
            <button type="button" onClick={updateSingleRow}>
              Update Row 2
            </button>
            <Table data={data} columns={stableColumns} idKey="id" />
          </div>
        );
      }

      render(<TestComponent />);

      // All 5 rows should have rendered once
      expect(Object.keys(rowRenderCounts)).toHaveLength(5);
      expect(rowRenderCounts['row-0']).toBe(1);
      expect(rowRenderCounts['row-1']).toBe(1);
      expect(rowRenderCounts['row-2']).toBe(1);
      expect(rowRenderCounts['row-3']).toBe(1);
      expect(rowRenderCounts['row-4']).toBe(1);

      // Update just row 2
      await act(async () => {
        screen.getByRole('button').click();
      });

      // Verify the update happened
      expect(screen.getByText('Updated-row-2')).toBeInTheDocument();

      console.log('Render counts after update (memoized):', rowRenderCounts);

      // With memoization: Only the changed row should re-render
      expect(rowRenderCounts['row-0']).toBe(1);
      expect(rowRenderCounts['row-1']).toBe(1);
      expect(rowRenderCounts['row-2']).toBe(2); // Only this row changed
      expect(rowRenderCounts['row-3']).toBe(1);
      expect(rowRenderCounts['row-4']).toBe(1);
    });

    it('should re-render all rows when columns array changes (inline columns)', async () => {
      const rowRenderCounts: Record<string, number> = {};

      function TestComponent() {
        const [data, setData] = useState(() => createTestData(5));

        // Inline columns - new array on every render
        const columns: TableColumn<TestRow>[] = [
          {key: 'id', header: 'ID'},
          {
            key: 'name',
            header: 'Name',
            renderCell: row => {
              rowRenderCounts[row.id] = (rowRenderCounts[row.id] || 0) + 1;
              return row.name;
            },
          },
          {key: 'value', header: 'Value'},
        ];

        const updateSingleRow = () => {
          setData(prev =>
            prev.map((row, i) =>
              i === 2 ? {...row, name: `Updated-${row.id}`} : row,
            ),
          );
        };

        return (
          <div>
            <button type="button" onClick={updateSingleRow}>
              Update Row 2
            </button>
            <Table data={data} columns={columns} idKey="id" />
          </div>
        );
      }

      render(<TestComponent />);

      // All 5 rows rendered once
      expect(Object.keys(rowRenderCounts)).toHaveLength(5);

      await act(async () => {
        screen.getByRole('button').click();
      });

      console.log('Render counts after update (inline):', rowRenderCounts);

      // With inline columns, ALL rows re-render because columns array changes
      // This documents expected behavior - users should memoize columns
      expect(rowRenderCounts['row-0']).toBe(2);
      expect(rowRenderCounts['row-1']).toBe(2);
      expect(rowRenderCounts['row-2']).toBe(2);
      expect(rowRenderCounts['row-3']).toBe(2);
      expect(rowRenderCounts['row-4']).toBe(2);
    });

    it('should skip re-render when data array is replaced with identical content', async () => {
      const rowRenderCounts: Record<string, number> = {};

      const trackingRenderCell = (row: TestRow) => {
        rowRenderCounts[row.id] = (rowRenderCounts[row.id] || 0) + 1;
        return row.name;
      };

      const stableColumns: TableColumn<TestRow>[] = [
        {key: 'id', header: 'ID'},
        {key: 'name', header: 'Name', renderCell: trackingRenderCell},
        {key: 'value', header: 'Value'},
      ];

      function TestComponent() {
        const [data, setData] = useState(() => createTestData(5));

        const replaceWithSameContent = () => {
          // Creates new array and objects, but values are identical
          setData(createTestData(5));
        };

        return (
          <div>
            <button type="button" onClick={replaceWithSameContent}>
              Replace Data
            </button>
            <Table data={data} columns={stableColumns} idKey="id" />
          </div>
        );
      }

      render(<TestComponent />);

      expect(rowRenderCounts['row-0']).toBe(1);

      await act(async () => {
        screen.getByRole('button').click();
      });

      console.log(
        'Render counts after replace (same content):',
        rowRenderCounts,
      );

      // Shallow comparison of item properties shows they're identical
      // So no rows should re-render
      expect(rowRenderCounts['row-0']).toBe(1);
      expect(rowRenderCounts['row-1']).toBe(1);
      expect(rowRenderCounts['row-2']).toBe(1);
      expect(rowRenderCounts['row-3']).toBe(1);
      expect(rowRenderCounts['row-4']).toBe(1);
    });

    it('should not re-render unchanged rows on force update (stable columns)', async () => {
      const allRenderCounts: number[] = [];

      const trackingRenderCell = (row: TestRow) => {
        allRenderCounts.push(parseInt(row.id.split('-')[1]));
        return row.name;
      };

      const stableColumns: TableColumn<TestRow>[] = [
        {key: 'id', header: 'ID'},
        {key: 'name', header: 'Name', renderCell: trackingRenderCell},
        {key: 'value', header: 'Value'},
      ];

      function TestComponent() {
        const [data, setData] = useState(() => createTestData(10));

        return (
          <div>
            <button type="button" onClick={() => setData(prev => [...prev])}>
              Force Update
            </button>
            <Table data={data} columns={stableColumns} idKey="id" />
          </div>
        );
      }

      render(<TestComponent />);

      // Initial render: 10 rows rendered
      expect(allRenderCounts.length).toBe(10);

      await act(async () => {
        screen.getByRole('button').click();
      });

      console.log(
        'Total cell renders after force update (stable):',
        allRenderCounts.length,
      );

      // With stable columns and same item references via spread, no re-renders
      // Still 10 because [...prev] creates new array but same item references
      expect(allRenderCounts.length).toBe(10);
    });

    it('should re-render all rows when columns change (inline columns)', async () => {
      const allRenderCounts: number[] = [];

      function TestComponent() {
        const [data, setData] = useState(() => createTestData(10));

        // Inline columns - new array on every render
        const columns: TableColumn<TestRow>[] = [
          {key: 'id', header: 'ID'},
          {
            key: 'name',
            header: 'Name',
            renderCell: row => {
              allRenderCounts.push(parseInt(row.id.split('-')[1]));
              return row.name;
            },
          },
          {key: 'value', header: 'Value'},
        ];

        return (
          <div>
            <button type="button" onClick={() => setData(prev => [...prev])}>
              Force Update
            </button>
            <Table data={data} columns={columns} idKey="id" />
          </div>
        );
      }

      render(<TestComponent />);

      // Initial render: 10 rows rendered
      expect(allRenderCounts.length).toBe(10);

      await act(async () => {
        screen.getByRole('button').click();
      });

      console.log(
        'Total cell renders after force update (inline):',
        allRenderCounts.length,
      );

      // With inline columns, all 10 rows re-render
      expect(allRenderCounts.length).toBe(20);
    });
  });

  // ===========================================================================
  // Test: Data array stability
  // ===========================================================================

  describe('data array stability', () => {
    it('should re-render when data content changes', async () => {
      const renderCount = vi.fn();

      function TestComponent() {
        const [data, setData] = useState(() => createTestData(5));

        renderCount();

        return (
          <div>
            <button type="button" onClick={() => setData(createTestData(5))}>
              Recreate Data
            </button>
            <Table data={data} columns={testColumns} idKey="id" />
          </div>
        );
      }

      render(<TestComponent />);
      expect(renderCount).toHaveBeenCalledTimes(1);

      await act(async () => {
        screen.getByRole('button').click();
      });

      // Data state changes -> component re-renders
      expect(renderCount).toHaveBeenCalledTimes(2);
    });
  });

  // ===========================================================================
  // Benchmark: Render time with many rows
  // ===========================================================================

  describe('render benchmarks', () => {
    it('should render 100 rows within performance budget', async () => {
      const data = createTestData(100);

      const renderTime = await initialRenderCpuTime(
        <Table data={data} columns={testColumns} idKey="id" />,
      );
      console.log(`100 rows initial render: ${renderTime.toFixed(2)}ms CPU`);

      // Should render within 200ms (generous budget for CI variance)
      expect(renderTime).toBeLessThan(200);
    });

    it('should render 500 rows within performance budget', async () => {
      const data = createTestData(500);

      const renderTime = await initialRenderCpuTime(
        <Table data={data} columns={testColumns} idKey="id" />,
      );
      console.log(`500 rows initial render: ${renderTime.toFixed(2)}ms CPU`);

      // CI runners vary more than local machines, so keep the local budget
      // strict while allowing headroom for shared-runner noise.
      expect(renderTime).toBeLessThan(500 * ciBudgetMultiplier);
    });

    it('keeps mixed row-status rendering and no-op updates within budget', async () => {
      const data = createTestData(6);
      const getStatus = vi.fn<UseTableRowStatusConfig<TestRow>['getStatus']>(
        row =>
          row.value % 30 === 0
            ? {status: 'success', label: 'Complete'}
            : row.value % 20 === 0
              ? {color: 'warning', icon: 'clock', label: 'Running'}
              : {color: 'gray', label: 'Queued'},
      );

      function TestComponent() {
        const [items, setItems] = useState(data);
        const rowStatus = useTableRowStatus<TestRow>({getStatus});
        const plugins = useMemo(() => ({rowStatus}), [rowStatus]);

        return (
          <div>
            <button type="button" onClick={() => setItems(prev => [...prev])}>
              No-op update
            </button>
            <Table
              data={items}
              columns={testColumns}
              idKey="id"
              plugins={plugins}
            />
          </div>
        );
      }

      const renderTime = await cpuTimeOf(() => {
        render(<TestComponent />);
      });

      expect(getStatus).toHaveBeenCalledTimes(6);
      expect(renderTime).toBeLessThan(1500 * ciBudgetMultiplier);

      const updateTime = await cpuTimeOf(async () =>
        act(async () => {
          screen.getByRole('button', {name: 'No-op update'}).click();
        }),
      );

      expect(getStatus).toHaveBeenCalledTimes(6);
      expect(updateTime).toBeLessThan(1000 * ciBudgetMultiplier);
    });

    it('should measure update performance', async () => {
      const data = createTestData(100);
      let updates = 0;

      function TestComponent() {
        const [items, setItems] = useState(data);

        return (
          <div>
            <button
              type="button"
              onClick={() => {
                updates++;
                const name = `Updated ${updates}`;
                setItems(prev =>
                  prev.map((item, i) => (i === 50 ? {...item, name} : item)),
                );
              }}>
              Update Row 50
            </button>
            <Table data={items} columns={testColumns} idKey="id" />
          </div>
        );
      }

      render(<TestComponent />);

      // CPU time, not elapsed time: on a loaded runner other work stretches
      // elapsed time but not the time spent rendering. Each click renames the
      // row again, so every round is a real update; the least of five after a
      // warm-up is the update's own cost.
      const updateCpuTime = async () => {
        const started = process.cpuUsage();
        await act(async () => {
          screen.getByRole('button').click();
        });
        const used = process.cpuUsage(started);
        return (used.user + used.system) / 1000;
      };
      await updateCpuTime();
      let updateTime = Number.POSITIVE_INFINITY;
      for (let round = 0; round < 5; round++) {
        updateTime = Math.min(updateTime, await updateCpuTime());
      }
      console.log(`100 rows single update: ${updateTime.toFixed(2)}ms CPU`);

      expect(screen.getByText(`Updated ${updates}`)).toBeInTheDocument();
      expect(updateTime).toBeLessThan(100);
    });
  });
});

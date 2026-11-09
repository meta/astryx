// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file useTableSortableState.test.tsx
 * @input Uses vitest, @testing-library/react, Table components
 * @output Unit tests for useTableSortableState hook
 * @position Testing; validates sortable state + data sorting
 */

import {describe, it, expect, vi} from 'vitest';
import {render, renderHook, screen, within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {useState} from 'react';
import {Table} from '../../Table';
import type {TableColumn} from '../../types';
import {useTableSortable} from './useTableSortable';
import type {TableSortState} from './useTableSortable';
import {useTableSortableState} from './useTableSortableState';
import type {UseTableSortableStateConfig} from './useTableSortableState';
import {InternationalizationProvider} from '../../../i18n';

// =============================================================================
// Test Data
// =============================================================================

interface Employee extends Record<string, unknown> {
  id: string;
  name: string;
  age: number;
  department: string;
  salary: number;
}

const employees: Employee[] = [
  {
    id: '1',
    name: 'Charlie',
    age: 35,
    department: 'Engineering',
    salary: 120000,
  },
  {id: '2', name: 'Alice', age: 28, department: 'Design', salary: 95000},
  {id: '3', name: 'Bob', age: 42, department: 'Engineering', salary: 140000},
  {id: '4', name: 'Diana', age: 31, department: 'PM', salary: 110000},
];

const columns: TableColumn<Employee>[] = [
  {key: 'name', header: 'Name', sortable: true},
  {key: 'age', header: 'Age', sortable: true},
  {key: 'department', header: 'Department', sortable: true},
  {key: 'salary', header: 'Salary', sortable: true},
];

// =============================================================================
// Test Helpers
// =============================================================================

/** Reads the text content of every first-column cell in order. */
function getNameColumnValues(): string[] {
  const rows = screen.getAllByRole('row');
  // Skip header row
  return rows.slice(1).map(row => {
    const cells = within(row).getAllByRole('cell');
    return cells[0].textContent ?? '';
  });
}

function SortableStateTable({
  data = employees,
  columns: cols = columns,
  defaultSort,
  sort: controlledSort,
  onSortChange: controlledOnSortChange,
  comparators,
  allowUnsortedState,
  isMultiSortEnabled,
}: Partial<UseTableSortableStateConfig<Employee>> & {
  columns?: TableColumn<Employee>[];
}) {
  const {sortedData, sortConfig} = useTableSortableState<Employee>({
    data,
    defaultSort,
    sort: controlledSort,
    onSortChange: controlledOnSortChange,
    comparators,
    allowUnsortedState,
    isMultiSortEnabled,
  });

  const sortPlugin = useTableSortable<Employee>(sortConfig);

  return (
    <Table
      data={sortedData}
      columns={cols}
      idKey="id"
      plugins={{sort: sortPlugin}}
    />
  );
}

// =============================================================================
// Sorting Tests
// =============================================================================

describe('useTableSortableState', () => {
  describe('default sort', () => {
    it('applies defaultSort on initial render', () => {
      render(
        <SortableStateTable
          defaultSort={[{sortKey: 'name', direction: 'ascending'}]}
        />,
      );

      expect(getNameColumnValues()).toEqual([
        'Alice',
        'Bob',
        'Charlie',
        'Diana',
      ]);
    });

    it('re-sorts strings when the provider locale changes', () => {
      const localeData: Employee[] = [
        {
          id: '1',
          name: 'z',
          age: 1,
          department: 'Test',
          salary: 1,
        },
        {
          id: '2',
          name: 'ä',
          age: 2,
          department: 'Test',
          salary: 2,
        },
      ];
      const table = (locale: string) => (
        <InternationalizationProvider locale={locale}>
          <SortableStateTable
            data={localeData}
            defaultSort={[{sortKey: 'name', direction: 'ascending'}]}
          />
        </InternationalizationProvider>
      );

      const {rerender} = render(table('sv-SE'));
      expect(getNameColumnValues()).toEqual(['z', 'ä']);

      rerender(table('de-DE'));
      expect(getNameColumnValues()).toEqual(['ä', 'z']);
    });

    it('renders unsorted when no defaultSort', () => {
      render(<SortableStateTable />);

      // Original order
      expect(getNameColumnValues()).toEqual([
        'Charlie',
        'Alice',
        'Bob',
        'Diana',
      ]);
    });

    it('applies descending defaultSort', () => {
      render(
        <SortableStateTable
          defaultSort={[{sortKey: 'name', direction: 'descending'}]}
        />,
      );

      expect(getNameColumnValues()).toEqual([
        'Diana',
        'Charlie',
        'Bob',
        'Alice',
      ]);
    });
  });

  describe('interactive sorting', () => {
    it('clicking a header sorts ascending then descending', async () => {
      render(<SortableStateTable />);

      // Click Name header to sort ascending
      await userEvent.click(screen.getByRole('button', {name: 'Name'}));
      expect(getNameColumnValues()).toEqual([
        'Alice',
        'Bob',
        'Charlie',
        'Diana',
      ]);

      // Click again to sort descending
      await userEvent.click(screen.getByRole('button', {name: 'Name'}));
      expect(getNameColumnValues()).toEqual([
        'Diana',
        'Charlie',
        'Bob',
        'Alice',
      ]);
    });

    it('clicking a different column replaces sort', async () => {
      render(
        <SortableStateTable
          defaultSort={[{sortKey: 'name', direction: 'ascending'}]}
        />,
      );

      expect(getNameColumnValues()).toEqual([
        'Alice',
        'Bob',
        'Charlie',
        'Diana',
      ]);

      // Sort by age instead
      await userEvent.click(screen.getByRole('button', {name: 'Age'}));

      // Age ascending: Alice(28), Diana(31), Charlie(35), Bob(42)
      expect(getNameColumnValues()).toEqual([
        'Alice',
        'Diana',
        'Charlie',
        'Bob',
      ]);
    });

    it('unsorted state clears sort (allowUnsortedState=true)', async () => {
      render(
        <SortableStateTable
          defaultSort={[{sortKey: 'name', direction: 'ascending'}]}
          allowUnsortedState
        />,
      );

      // Click to descending
      await userEvent.click(screen.getByRole('button', {name: 'Name'}));
      // Click to unsorted
      await userEvent.click(screen.getByRole('button', {name: 'Name'}));

      // Back to original order
      expect(getNameColumnValues()).toEqual([
        'Charlie',
        'Alice',
        'Bob',
        'Diana',
      ]);
    });
  });

  describe('numeric sorting', () => {
    it('sorts numbers correctly without custom comparator', async () => {
      render(<SortableStateTable />);

      await userEvent.click(screen.getByRole('button', {name: 'Age'}));

      // Age ascending: 28, 31, 35, 42
      expect(getNameColumnValues()).toEqual([
        'Alice',
        'Diana',
        'Charlie',
        'Bob',
      ]);
    });
  });

  describe('custom comparators', () => {
    it('uses custom comparator when provided', () => {
      render(
        <SortableStateTable
          defaultSort={[{sortKey: 'salary', direction: 'ascending'}]}
          comparators={{
            salary: (a, b) => a.salary - b.salary,
          }}
        />,
      );

      // Salary ascending: Alice(95k), Diana(110k), Charlie(120k), Bob(140k)
      expect(getNameColumnValues()).toEqual([
        'Alice',
        'Diana',
        'Charlie',
        'Bob',
      ]);
    });

    it('falls back to default compare for keys without custom comparator', () => {
      render(
        <SortableStateTable
          defaultSort={[{sortKey: 'name', direction: 'ascending'}]}
          comparators={{
            salary: (a, b) => a.salary - b.salary,
          }}
        />,
      );

      // Name uses default string compare
      expect(getNameColumnValues()).toEqual([
        'Alice',
        'Bob',
        'Charlie',
        'Diana',
      ]);
    });
  });

  describe('controlled mode', () => {
    function ControlledWrapper() {
      const [sort, setSort] = useState<TableSortState>([
        {sortKey: 'name', direction: 'ascending'},
      ]);

      return (
        <>
          <button
            type="button"
            data-testid="external-sort"
            onClick={() =>
              setSort([{sortKey: 'age', direction: 'descending'}])
            }>
            Sort by age desc
          </button>
          <button
            type="button"
            data-testid="clear-sort"
            onClick={() => setSort([])}>
            Clear sort
          </button>
          <SortableStateTable sort={sort} onSortChange={setSort} />
        </>
      );
    }

    it('uses controlled sort state', () => {
      render(<ControlledWrapper />);

      expect(getNameColumnValues()).toEqual([
        'Alice',
        'Bob',
        'Charlie',
        'Diana',
      ]);
    });

    it('responds to external sort state changes', async () => {
      render(<ControlledWrapper />);

      await userEvent.click(screen.getByTestId('external-sort'));

      // Age descending: Bob(42), Charlie(35), Diana(31), Alice(28)
      expect(getNameColumnValues()).toEqual([
        'Bob',
        'Charlie',
        'Diana',
        'Alice',
      ]);
    });

    it('responds to sort clear', async () => {
      render(<ControlledWrapper />);

      await userEvent.click(screen.getByTestId('clear-sort'));

      // Original order
      expect(getNameColumnValues()).toEqual([
        'Charlie',
        'Alice',
        'Bob',
        'Diana',
      ]);
    });

    it('header clicks update controlled state', async () => {
      const onSortChange = vi.fn();

      function ControlledWithSpy() {
        const [sort, setSort] = useState<TableSortState>([]);
        const handleChange = (newSort: TableSortState) => {
          setSort(newSort);
          onSortChange(newSort);
        };
        return <SortableStateTable sort={sort} onSortChange={handleChange} />;
      }

      render(<ControlledWithSpy />);

      await userEvent.click(screen.getByRole('button', {name: 'Name'}));

      expect(onSortChange).toHaveBeenCalledWith([
        {sortKey: 'name', direction: 'ascending'},
      ]);
    });
  });

  describe('multi-sort', () => {
    it('supports multi-sort via shift+click', async () => {
      const user = userEvent.setup();

      // Employees with same department
      const data: Employee[] = [
        {
          id: '1',
          name: 'Charlie',
          age: 35,
          department: 'Engineering',
          salary: 120000,
        },
        {
          id: '2',
          name: 'Alice',
          age: 28,
          department: 'Engineering',
          salary: 95000,
        },
        {id: '3', name: 'Bob', age: 42, department: 'Design', salary: 140000},
        {id: '4', name: 'Diana', age: 31, department: 'Design', salary: 110000},
      ];

      render(
        <SortableStateTable
          data={data}
          defaultSort={[{sortKey: 'department', direction: 'ascending'}]}
          isMultiSortEnabled
        />,
      );

      // Department ascending: Design(Bob, Diana), Engineering(Alice, Charlie)
      // Now shift+click Name to add secondary sort
      await user.keyboard('{Shift>}');
      await user.click(screen.getByRole('button', {name: 'Name'}));
      await user.keyboard('{/Shift}');

      // Design: Bob, Diana; Engineering: Alice, Charlie
      expect(getNameColumnValues()).toEqual([
        'Bob',
        'Diana',
        'Alice',
        'Charlie',
      ]);
    });
  });

  describe('NaN handling', () => {
    it('keeps valid numbers sorted when a NaN cell is present', () => {
      const data: Employee[] = [
        {id: '1', name: 'A', age: 5, department: 'X', salary: 1},
        {id: '2', name: 'B', age: NaN, department: 'X', salary: 1},
        {id: '3', name: 'C', age: 1, department: 'X', salary: 1},
        {id: '4', name: 'D', age: 3, department: 'X', salary: 1},
      ];
      const {result} = renderHook(() =>
        useTableSortableState({
          data,
          defaultSort: [{sortKey: 'age', direction: 'ascending'}],
        }),
      );
      // NaN groups at the end like null; the valid numbers stay ordered.
      expect(result.current.sortedData.map(e => e.age)).toEqual([1, 3, 5, NaN]);
    });

    it('sorts NaN to the start in descending order, like null', () => {
      const data: Employee[] = [
        {id: '1', name: 'A', age: 5, department: 'X', salary: 1},
        {id: '2', name: 'B', age: NaN, department: 'X', salary: 1},
        {id: '3', name: 'C', age: 1, department: 'X', salary: 1},
      ];
      const {result} = renderHook(() =>
        useTableSortableState({
          data,
          defaultSort: [{sortKey: 'age', direction: 'descending'}],
        }),
      );
      expect(result.current.sortedData.map(e => e.age)).toEqual([NaN, 5, 1]);
    });
  });

  describe('null/undefined handling', () => {
    it('sorts null values to the end', () => {
      const data: Employee[] = [
        {
          id: '1',
          name: 'Charlie',
          age: 35,
          department: 'Engineering',
          salary: 120000,
        },
        {
          id: '2',
          name: null as unknown as string,
          age: 28,
          department: 'Design',
          salary: 95000,
        },
        {
          id: '3',
          name: 'Alice',
          age: 42,
          department: 'Engineering',
          salary: 140000,
        },
      ];

      render(
        <SortableStateTable
          data={data}
          defaultSort={[{sortKey: 'name', direction: 'ascending'}]}
        />,
      );

      const names = getNameColumnValues();
      // Alice, Charlie first; null last
      expect(names[0]).toBe('Alice');
      expect(names[1]).toBe('Charlie');
    });
  });

  describe('empty data', () => {
    it('handles empty data array', () => {
      render(
        <SortableStateTable
          data={[]}
          defaultSort={[{sortKey: 'name', direction: 'ascending'}]}
        />,
      );

      // Should render without throwing — table still mounts with empty data
      expect(screen.getByRole('table')).toBeInTheDocument();
      // Sort headers should still be interactive
      expect(screen.getByRole('button', {name: 'Name'})).toBeInTheDocument();
    });
  });

  describe('applySort', () => {
    it('exposes applySort for external use', () => {
      let capturedApplySort: ((data: Employee[]) => Employee[]) | null = null;

      function Capture() {
        const {sortedData, sortConfig, applySort} =
          useTableSortableState<Employee>({
            data: employees,
            defaultSort: [{sortKey: 'name', direction: 'ascending'}],
          });

        capturedApplySort = applySort;
        const sortPlugin = useTableSortable<Employee>(sortConfig);

        return (
          <Table
            data={sortedData}
            columns={columns}
            idKey="id"
            plugins={{sort: sortPlugin}}
          />
        );
      }

      render(<Capture />);

      // Use applySort on a different dataset
      const subset: Employee[] = [
        {id: '10', name: 'Zara', age: 25, department: 'PM', salary: 90000},
        {
          id: '11',
          name: 'Aaron',
          age: 30,
          department: 'Design',
          salary: 100000,
        },
      ];

      const sorted = capturedApplySort!(subset);
      expect(sorted.map(e => e.name)).toEqual(['Aaron', 'Zara']);
    });
  });
});

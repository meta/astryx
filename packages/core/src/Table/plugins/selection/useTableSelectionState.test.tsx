// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file useTableSelectionState.test.tsx
 * @input useTableSelectionState, useTableSelection, Table, React testing utilities
 * @output Tests for the selection state helper
 * @position Test file; validates disabled/selectable filtering in select-all
 */

import {describe, it, expect, vi} from 'vitest';
import {useState} from 'react';
import {act, render, renderHook, screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {Table} from '../../Table';
import {useTableSelection} from './useTableSelection';
import {useTableSelectionState} from './useTableSelectionState';
import type {TableColumn} from '../../types';

// =============================================================================
// Test Data
// =============================================================================

interface TestItem extends Record<string, unknown> {
  id: string;
  name: string;
  isLocked: boolean;
  isHidden: boolean;
}

const testData: TestItem[] = [
  {id: '1', name: 'Alice', isLocked: false, isHidden: false},
  {id: '2', name: 'Bob', isLocked: false, isHidden: false},
  {id: '3', name: 'Charlie', isLocked: true, isHidden: false},
  {id: '4', name: 'Diana', isLocked: false, isHidden: true},
];

const columns: TableColumn<TestItem>[] = [{key: 'name', header: 'Name'}];

// =============================================================================
// Helper
// =============================================================================

const EMPTY_SET = new Set<string>();

function StateHelperTable({
  data = testData,
  getIsItemEnabled,
  getIsItemSelectable,
  initialSelected = EMPTY_SET,
}: {
  data?: TestItem[];
  getIsItemEnabled?: (item: TestItem) => boolean;
  getIsItemSelectable?: (item: TestItem) => boolean;
  initialSelected?: Set<string>;
}) {
  const [selectedKeys, setSelectedKeys] =
    useState<Set<string>>(initialSelected);

  const {selectionConfig} = useTableSelectionState<TestItem>({
    data,
    idKey: 'id',
    selectedKeys,
    setSelectedKeys,
    getIsItemEnabled,
    getIsItemSelectable,
  });

  const plugin = useTableSelection<TestItem>(selectionConfig);

  return (
    <Table
      data={data}
      columns={columns}
      idKey="id"
      plugins={{selection: plugin}}
    />
  );
}

// =============================================================================
// Tests
// =============================================================================

describe('useTableSelectionState selection state output', () => {
  it('exposes selected keys, count, presence, and a complete clear command', () => {
    const selectedKeys = new Set(['2', '4']);
    const setSelectedKeys = vi.fn();
    const {result} = renderHook(() =>
      useTableSelectionState<TestItem>({
        data: testData,
        idKey: 'id',
        selectedKeys,
        setSelectedKeys,
      }),
    );

    const selectionState = result.current.selectionState;

    expect(selectionState).toMatchObject({
      selectedKeys,
      selectedCount: 2,
      hasSelection: true,
    });

    act(() => selectionState.clearSelection());
    expect(setSelectedKeys).toHaveBeenCalledWith(new Set());
  });
});

describe('useTableSelectionState', () => {
  it('select-all selects only enabled items', async () => {
    const user = userEvent.setup();
    render(<StateHelperTable getIsItemEnabled={item => !item.isLocked} />);

    await user.click(screen.getByLabelText('Select all rows'));

    const rows = screen.getAllByRole('row');
    // Alice, Bob, Diana selected (enabled)
    expect(rows[1]).toHaveAttribute('aria-selected', 'true');
    expect(rows[2]).toHaveAttribute('aria-selected', 'true');
    // Charlie disabled — NOT selected
    expect(rows[3]).not.toHaveAttribute('aria-selected');
    // Diana enabled
    expect(rows[4]).toHaveAttribute('aria-selected', 'true');
  });

  it('select-all preserves disabled-but-selected items', async () => {
    const user = userEvent.setup();
    // Charlie (id: 3) starts selected but is disabled
    render(
      <StateHelperTable
        getIsItemEnabled={item => !item.isLocked}
        initialSelected={new Set(['3'])}
      />,
    );

    const rows = screen.getAllByRole('row');
    // Charlie should be selected (was selected before becoming disabled)
    expect(rows[3]).toHaveAttribute('aria-selected', 'true');

    // Select all — Charlie should stay selected, others get selected
    await user.click(screen.getByLabelText('Select all rows'));

    expect(rows[1]).toHaveAttribute('aria-selected', 'true');
    expect(rows[2]).toHaveAttribute('aria-selected', 'true');
    expect(rows[3]).toHaveAttribute('aria-selected', 'true'); // preserved
    expect(rows[4]).toHaveAttribute('aria-selected', 'true');
  });

  it('deselect-all preserves disabled-but-selected items', async () => {
    const user = userEvent.setup();
    // Charlie (id: 3) starts selected but is disabled
    // Alice (id: 1) also starts selected
    render(
      <StateHelperTable
        getIsItemEnabled={item => !item.isLocked}
        initialSelected={new Set(['1', '3'])}
      />,
    );

    // Click select-all first to select all enabled
    await user.click(screen.getByLabelText('Select all rows'));
    // Now deselect all
    await user.click(screen.getByLabelText('Select all rows'));

    const rows = screen.getAllByRole('row');
    // Enabled items deselected
    expect(rows[1]).not.toHaveAttribute('aria-selected');
    expect(rows[2]).not.toHaveAttribute('aria-selected');
    // Charlie (disabled) stays selected
    expect(rows[3]).toHaveAttribute('aria-selected', 'true');
    expect(rows[4]).not.toHaveAttribute('aria-selected');
  });

  it('non-selectable items are excluded from select-all', async () => {
    const user = userEvent.setup();
    render(<StateHelperTable getIsItemSelectable={item => !item.isHidden} />);

    await user.click(screen.getByLabelText('Select all rows'));

    const rows = screen.getAllByRole('row');
    expect(rows[1]).toHaveAttribute('aria-selected', 'true');
    expect(rows[2]).toHaveAttribute('aria-selected', 'true');
    expect(rows[3]).toHaveAttribute('aria-selected', 'true');
    // Diana (non-selectable) — NOT selected
    expect(rows[4]).not.toHaveAttribute('aria-selected');
  });

  it('deselect-all does not affect non-selectable items', async () => {
    const user = userEvent.setup();
    // Diana (id: 4, hidden/non-selectable) starts selected somehow
    render(
      <StateHelperTable
        getIsItemSelectable={item => !item.isHidden}
        initialSelected={new Set(['4'])}
      />,
    );

    // Select all enabled+selectable
    await user.click(screen.getByLabelText('Select all rows'));
    // Deselect all
    await user.click(screen.getByLabelText('Select all rows'));

    const rows = screen.getAllByRole('row');
    expect(rows[1]).not.toHaveAttribute('aria-selected');
    expect(rows[2]).not.toHaveAttribute('aria-selected');
    expect(rows[3]).not.toHaveAttribute('aria-selected');
    // Diana (non-selectable) stays selected — frozen
    expect(rows[4]).toHaveAttribute('aria-selected', 'true');
  });

  it('handles both non-selectable and disabled rows together', async () => {
    const user = userEvent.setup();
    // Charlie is disabled, Diana is non-selectable, both start selected
    render(
      <StateHelperTable
        getIsItemEnabled={item => !item.isLocked}
        getIsItemSelectable={item => !item.isHidden}
        initialSelected={new Set(['3', '4'])}
      />,
    );

    const rows = screen.getAllByRole('row');
    // Both frozen items start selected
    expect(rows[3]).toHaveAttribute('aria-selected', 'true');
    expect(rows[4]).toHaveAttribute('aria-selected', 'true');

    // Select all — only Alice and Bob are actionable
    await user.click(screen.getByLabelText('Select all rows'));

    expect(rows[1]).toHaveAttribute('aria-selected', 'true');
    expect(rows[2]).toHaveAttribute('aria-selected', 'true');
    expect(rows[3]).toHaveAttribute('aria-selected', 'true'); // frozen
    expect(rows[4]).toHaveAttribute('aria-selected', 'true'); // frozen

    // Deselect all — only Alice and Bob deselected
    await user.click(screen.getByLabelText('Select all rows'));

    expect(rows[1]).not.toHaveAttribute('aria-selected');
    expect(rows[2]).not.toHaveAttribute('aria-selected');
    expect(rows[3]).toHaveAttribute('aria-selected', 'true'); // still frozen
    expect(rows[4]).toHaveAttribute('aria-selected', 'true'); // still frozen
  });

  it('individual selection works normally', async () => {
    const user = userEvent.setup();
    render(<StateHelperTable />);

    const checkboxes = screen.getAllByLabelText('Select row');
    await user.click(checkboxes[1]); // Bob

    const rows = screen.getAllByRole('row');
    expect(rows[1]).not.toHaveAttribute('aria-selected');
    expect(rows[2]).toHaveAttribute('aria-selected', 'true');
    expect(rows[3]).not.toHaveAttribute('aria-selected');
  });
});

// =============================================================================
// Filtering + Selection Interaction Tests
// =============================================================================

/**
 * Simulates the pattern where consumers pass filtered data to
 * useTableSelectionState, scoping select-all to visible rows.
 * Selections made on filtered views persist when the filter changes.
 */
function FilteredSelectionTable({
  initialFilter = '',
}: {
  initialFilter?: string;
}) {
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState(initialFilter);

  // Simulate filtering — only show items whose name includes the filter
  const filteredData = filter
    ? testData.filter(item =>
        item.name.toLowerCase().includes(filter.toLowerCase()),
      )
    : testData;

  const {selectionConfig} = useTableSelectionState<TestItem>({
    data: filteredData,
    idKey: 'id',
    selectedKeys,
    setSelectedKeys,
  });

  const plugin = useTableSelection<TestItem>(selectionConfig);

  return (
    <div>
      <input
        data-testid="filter-input"
        value={filter}
        onChange={e => setFilter(e.target.value)}
      />
      <span data-testid="selected-count">{selectedKeys.size}</span>
      <span data-testid="selected-keys">
        {[...selectedKeys].sort().join(',')}
      </span>
      <Table
        data={filteredData}
        columns={columns}
        idKey="id"
        plugins={{selection: plugin}}
      />
    </div>
  );
}

describe('useTableSelectionState with filtered data', () => {
  it('select-all only selects visible (filtered) rows', async () => {
    const user = userEvent.setup();
    // Filter to only show Alice and Charlie (names containing "li")
    render(<FilteredSelectionTable initialFilter="li" />);

    // Should show 2 rows (Alice, Charlie)
    const rows = screen.getAllByRole('row');
    // header + 2 body rows = 3
    expect(rows).toHaveLength(3);

    await user.click(screen.getByLabelText('Select all rows'));

    // Only Alice (1) and Charlie (3) should be selected
    expect(screen.getByTestId('selected-count')).toHaveTextContent('2');
    expect(screen.getByTestId('selected-keys')).toHaveTextContent('1,3');
  });

  it('select-all is unchecked when the filter matches nothing (#3591)', async () => {
    const user = userEvent.setup();
    render(<FilteredSelectionTable />);

    // Select Bob, then filter to an empty result set.
    const checkboxes = screen.getAllByLabelText('Select row');
    await user.click(checkboxes[1]);
    expect(screen.getByTestId('selected-keys')).toHaveTextContent('2');

    const input = screen.getByTestId('filter-input');
    await user.clear(input);
    await user.type(input, 'zzz');

    // Zero visible rows must not read as "all selected" — previously the
    // header checkbox rendered checked here and deselect-all was a no-op.
    const selectAll = screen.getByLabelText('Select all rows');
    expect(selectAll).not.toBeChecked();

    // The hidden selection itself is preserved (frozen), as designed.
    await user.clear(input);
    expect(screen.getByTestId('selected-keys')).toHaveTextContent('2');
  });

  it('selections persist when filter changes', async () => {
    const user = userEvent.setup();
    render(<FilteredSelectionTable />);

    // Select Bob (row index 2 in unfiltered view)
    const checkboxes = screen.getAllByLabelText('Select row');
    await user.click(checkboxes[1]); // Bob

    expect(screen.getByTestId('selected-keys')).toHaveTextContent('2');

    // Now filter to only "Ali" — Bob disappears but stays selected
    const input = screen.getByTestId('filter-input');
    await user.clear(input);
    await user.type(input, 'Ali');

    // Bob is no longer visible
    const rows = screen.getAllByRole('row');
    expect(rows).toHaveLength(2); // header + Alice

    // But selectedKeys still includes Bob
    expect(screen.getByTestId('selected-count')).toHaveTextContent('1');
    expect(screen.getByTestId('selected-keys')).toHaveTextContent('2');
  });

  it('select-all in filtered view preserves selections from other views', async () => {
    const user = userEvent.setup();
    render(<FilteredSelectionTable />);

    // Select Bob individually
    const checkboxes = screen.getAllByLabelText('Select row');
    await user.click(checkboxes[1]); // Bob (id: 2)

    expect(screen.getByTestId('selected-keys')).toHaveTextContent('2');

    // Filter to "Ali" — shows only Alice
    const input = screen.getByTestId('filter-input');
    await user.clear(input);
    await user.type(input, 'Ali');

    // Select all in filtered view (just Alice)
    await user.click(screen.getByLabelText('Select all rows'));

    // Both Bob (from before) and Alice (from select-all) should be selected
    expect(screen.getByTestId('selected-count')).toHaveTextContent('2');
    expect(screen.getByTestId('selected-keys')).toHaveTextContent('1,2');
  });

  it('deselect-all in filtered view only deselects visible rows', async () => {
    const user = userEvent.setup();
    render(<FilteredSelectionTable />);

    // Select all (unfiltered) — selects all 4
    await user.click(screen.getByLabelText('Select all rows'));
    expect(screen.getByTestId('selected-count')).toHaveTextContent('4');

    // Filter to "Ali" — shows only Alice
    const input = screen.getByTestId('filter-input');
    await user.clear(input);
    await user.type(input, 'Ali');

    // Deselect all in filtered view — only deselects Alice
    await user.click(screen.getByLabelText('Select all rows'));

    // Bob, Charlie, Diana still selected (not visible, so frozen)
    expect(screen.getByTestId('selected-count')).toHaveTextContent('3');
    expect(screen.getByTestId('selected-keys')).toHaveTextContent('2,3,4');
  });

  it('clearing filter restores selections from all views', async () => {
    const user = userEvent.setup();
    render(<FilteredSelectionTable />);

    // Select Alice individually
    const checkboxes = screen.getAllByLabelText('Select row');
    await user.click(checkboxes[0]); // Alice (id: 1)

    // Filter to "Bob" and select Bob
    const input = screen.getByTestId('filter-input');
    await user.clear(input);
    await user.type(input, 'Bob');
    const filteredCheckboxes = screen.getAllByLabelText('Select row');
    await user.click(filteredCheckboxes[0]); // Bob (id: 2)

    // Clear filter
    await user.clear(input);

    // Both Alice and Bob should be selected
    expect(screen.getByTestId('selected-count')).toHaveTextContent('2');
    expect(screen.getByTestId('selected-keys')).toHaveTextContent('1,2');

    // And they should appear selected in the table
    const rows = screen.getAllByRole('row');
    expect(rows[1]).toHaveAttribute('aria-selected', 'true'); // Alice
    expect(rows[2]).toHaveAttribute('aria-selected', 'true'); // Bob
    expect(rows[3]).not.toHaveAttribute('aria-selected'); // Charlie
    expect(rows[4]).not.toHaveAttribute('aria-selected'); // Diana
  });
});

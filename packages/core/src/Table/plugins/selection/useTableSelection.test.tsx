// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file useTableSelection.test.tsx
 * @input useTableSelection, Table, React testing utilities
 * @output Functional tests for the selection plugin
 * @position Test file; validates selection behavior (checkboxes, aria, select-all)
 */

import {describe, it, expect, vi} from 'vitest';
import {useState} from 'react';
import {act, render, renderHook, screen, within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {Table} from '../../Table';
import {useTableSelection} from './useTableSelection';
import {colorVars} from '../../../theme/tokens.stylex';
import type {BodyRowRenderProps, TableColumn} from '../../types';

// =============================================================================
// Test Data
// =============================================================================

interface SelectableUser extends Record<string, unknown> {
  id: string;
  name: string;
  role: string;
  isLocked: boolean;
}

const selectableUsers: SelectableUser[] = [
  {id: '1', name: 'Alice', role: 'engineer', isLocked: false},
  {id: '2', name: 'Bob', role: 'admin', isLocked: false},
  {id: '3', name: 'Charlie', role: 'designer', isLocked: true},
];

const selectableColumns: TableColumn<SelectableUser>[] = [
  {key: 'name', header: 'Name'},
  {key: 'role', header: 'Role'},
];

function SelectionTable({
  getIsItemSelectable,
  getIsItemEnabled,
  getRowLabel,
  hasRowHighlight,
}: {
  getIsItemSelectable?: (item: SelectableUser) => boolean;
  getIsItemEnabled?: (item: SelectableUser) => boolean;
  getRowLabel?: (item: SelectableUser) => string;
  hasRowHighlight?: boolean;
}) {
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());

  const nonAdminUsers = getIsItemSelectable
    ? selectableUsers.filter(getIsItemSelectable)
    : selectableUsers;

  const selectionPlugin = useTableSelection<SelectableUser>({
    getIsItemSelected: item => selectedKeys.has(item.id),
    onSelectItem: ({item, isSelected}) => {
      const next = new Set(selectedKeys);
      if (isSelected) {
        next.add(item.id);
      } else {
        next.delete(item.id);
      }
      setSelectedKeys(next);
    },
    onSelectAll: ({isAllSelected}) => {
      setSelectedKeys(
        isAllSelected ? new Set(nonAdminUsers.map(u => u.id)) : new Set(),
      );
    },
    getIsAllSelected: () =>
      nonAdminUsers.length > 0 &&
      nonAdminUsers.every(u => selectedKeys.has(u.id)),
    getIsIndeterminate: () => {
      const count = nonAdminUsers.filter(u => selectedKeys.has(u.id)).length;
      return count > 0 && count < nonAdminUsers.length;
    },
    getIsItemSelectable,
    getIsItemEnabled,
    getRowLabel,
    hasRowHighlight,
  });

  return (
    <Table
      data={selectableUsers}
      columns={selectableColumns}
      idKey="id"
      plugins={{selection: selectionPlugin}}
    />
  );
}

// =============================================================================
// Tests
// =============================================================================

describe('useTableSelection', () => {
  it('renders selection checkboxes in header and body rows', () => {
    render(<SelectionTable />);
    const checkboxes = screen.getAllByRole('checkbox');
    expect(checkboxes).toHaveLength(4);
  });

  it('renders header checkbox with "Select all rows" label', () => {
    render(<SelectionTable />);
    expect(screen.getByLabelText('Select all rows')).toBeInTheDocument();
  });

  it('renders row checkboxes with "Select row" label', () => {
    render(<SelectionTable />);
    const rowCheckboxes = screen.getAllByLabelText('Select row');
    expect(rowCheckboxes).toHaveLength(3);
  });

  it('derives per-row accessible names from getRowLabel', () => {
    render(<SelectionTable getRowLabel={item => item.name} />);
    expect(screen.getByLabelText('Select Alice')).toBeInTheDocument();
    expect(screen.getByLabelText('Select Bob')).toBeInTheDocument();
    expect(screen.getByLabelText('Select Charlie')).toBeInTheDocument();
    expect(screen.queryByLabelText('Select row')).not.toBeInTheDocument();
  });

  it('keeps the "Select all rows" header label when getRowLabel is provided', () => {
    render(<SelectionTable getRowLabel={item => item.name} />);
    expect(screen.getByLabelText('Select all rows')).toBeInTheDocument();
  });

  it('toggles individual row selection on click', async () => {
    const user = userEvent.setup();
    render(<SelectionTable />);
    const rowCheckboxes = screen.getAllByLabelText('Select row');

    await user.click(rowCheckboxes[0]);

    const rows = screen.getAllByRole('row');
    expect(rows[1]).toHaveAttribute('aria-selected', 'true');
    expect(rows[2]).not.toHaveAttribute('aria-selected');
    expect(rows[3]).not.toHaveAttribute('aria-selected');
  });

  it('deselects a selected row on click', async () => {
    const user = userEvent.setup();
    render(<SelectionTable />);
    const rowCheckboxes = screen.getAllByLabelText('Select row');

    await user.click(rowCheckboxes[0]);
    expect(screen.getAllByRole('row')[1]).toHaveAttribute(
      'aria-selected',
      'true',
    );

    await user.click(rowCheckboxes[0]);
    expect(screen.getAllByRole('row')[1]).not.toHaveAttribute('aria-selected');
  });

  it('selects all rows when select-all is clicked', async () => {
    const user = userEvent.setup();
    render(<SelectionTable />);
    const selectAll = screen.getByLabelText('Select all rows');

    await user.click(selectAll);

    const rows = screen.getAllByRole('row');
    expect(rows[1]).toHaveAttribute('aria-selected', 'true');
    expect(rows[2]).toHaveAttribute('aria-selected', 'true');
    expect(rows[3]).toHaveAttribute('aria-selected', 'true');
  });

  it('deselects all rows when select-all is clicked again', async () => {
    const user = userEvent.setup();
    render(<SelectionTable />);
    const selectAll = screen.getByLabelText('Select all rows');

    await user.click(selectAll);
    await user.click(selectAll);

    const rows = screen.getAllByRole('row');
    expect(rows[1]).not.toHaveAttribute('aria-selected');
    expect(rows[2]).not.toHaveAttribute('aria-selected');
    expect(rows[3]).not.toHaveAttribute('aria-selected');
  });

  it('hides checkbox for non-selectable rows', () => {
    render(
      <SelectionTable getIsItemSelectable={item => item.role !== 'admin'} />,
    );
    const checkboxes = screen.getAllByRole('checkbox');
    expect(checkboxes).toHaveLength(3);
  });

  it('disables checkbox for disabled rows', () => {
    render(<SelectionTable getIsItemEnabled={item => !item.isLocked} />);
    const rowCheckboxes = screen.getAllByLabelText('Select row');
    expect(rowCheckboxes[0]).not.toHaveAttribute('aria-disabled');
    expect(rowCheckboxes[1]).not.toHaveAttribute('aria-disabled');
    // Focusable disabled (spec:AST-085 FR1): aria-disabled, no native disabled.
    expect(rowCheckboxes[2]).toHaveAttribute('aria-disabled', 'true');
    expect(rowCheckboxes[2]).not.toHaveAttribute('disabled');
  });

  it('prepends selection <td> to each body row', () => {
    render(<SelectionTable />);
    const rows = screen.getAllByRole('row');
    const firstBodyRow = rows[1];
    const cells = within(firstBodyRow).getAllByRole('cell');
    expect(cells).toHaveLength(3);
  });

  it('prepends selection <th> to header row', () => {
    render(<SelectionTable />);
    const headerRow = screen.getAllByRole('row')[0];
    const headers = within(headerRow).getAllByRole('columnheader');
    expect(headers).toHaveLength(3);
  });

  describe('hasRowHighlight', () => {
    const selectedBgColor = colorVars['--color-accent-muted'];

    it('paints a checked row with the accent wash by default', async () => {
      const user = userEvent.setup();
      render(<SelectionTable />);

      await user.click(screen.getAllByLabelText('Select row')[0]);

      const row = screen.getAllByRole('row')[1];
      expect(row.style.backgroundColor).toBe(selectedBgColor);
      expect(row).toHaveAttribute('aria-selected', 'true');
    });

    it('leaves the row background alone when hasRowHighlight is false', async () => {
      const user = userEvent.setup();
      render(<SelectionTable hasRowHighlight={false} />);

      await user.click(screen.getAllByLabelText('Select row')[0]);

      const row = screen.getAllByRole('row')[1];
      expect(row.style.backgroundColor).toBe('');
      // The wash is opt-out; the semantics are not.
      expect(row).toHaveAttribute('aria-selected', 'true');
    });

    it('clears an already-painted row when the flag flips to false', async () => {
      const user = userEvent.setup();
      const {rerender} = render(<SelectionTable />);

      await user.click(screen.getAllByLabelText('Select row')[0]);
      expect(screen.getAllByRole('row')[1].style.backgroundColor).toBe(
        selectedBgColor,
      );

      rerender(<SelectionTable hasRowHighlight={false} />);

      const row = screen.getAllByRole('row')[1];
      expect(row.style.backgroundColor).toBe('');
      expect(row).toHaveAttribute('aria-selected', 'true');
    });

    it('repaints an already-checked row when the flag flips back to true', async () => {
      const user = userEvent.setup();
      const {rerender} = render(<SelectionTable hasRowHighlight={false} />);

      await user.click(screen.getAllByLabelText('Select row')[0]);
      rerender(<SelectionTable hasRowHighlight />);

      expect(screen.getAllByRole('row')[1].style.backgroundColor).toBe(
        selectedBgColor,
      );
    });

    it('never paints unchecked rows in either mode', async () => {
      const user = userEvent.setup();
      const {rerender} = render(<SelectionTable />);

      await user.click(screen.getAllByLabelText('Select row')[0]);
      expect(screen.getAllByRole('row')[2].style.backgroundColor).toBe('');
      expect(screen.getAllByRole('row')[2]).not.toHaveAttribute(
        'aria-selected',
      );

      rerender(<SelectionTable hasRowHighlight={false} />);
      expect(screen.getAllByRole('row')[2].style.backgroundColor).toBe('');
      expect(screen.getAllByRole('row')[2]).not.toHaveAttribute(
        'aria-selected',
      );
    });

    // A pinned cell paints over the row, then replays whatever the row
    // published as --table-row-overlay. Without the variable the wash simply
    // stops at the freeze line, so it has to track the background exactly.
    describe('--table-row-overlay', () => {
      const readOverlay = (row: HTMLElement) =>
        row.style.getPropertyValue('--table-row-overlay');

      it('publishes the wash so pinned cells can replay it', async () => {
        const user = userEvent.setup();
        render(<SelectionTable />);

        await user.click(screen.getAllByLabelText('Select row')[0]);

        expect(readOverlay(screen.getAllByRole('row')[1])).toBe(
          selectedBgColor,
        );
      });

      it('publishes nothing when the row is not painted', async () => {
        const user = userEvent.setup();
        render(<SelectionTable hasRowHighlight={false} />);

        await user.click(screen.getAllByLabelText('Select row')[0]);

        expect(readOverlay(screen.getAllByRole('row')[1])).toBe('');
      });

      it('withdraws the variable when a row is unchecked', async () => {
        const user = userEvent.setup();
        render(<SelectionTable />);

        const checkbox = screen.getAllByLabelText('Select row')[0];
        await user.click(checkbox);
        await user.click(checkbox);

        expect(readOverlay(screen.getAllByRole('row')[1])).toBe('');
      });

      it('tracks the background when the flag flips', async () => {
        const user = userEvent.setup();
        const {rerender} = render(<SelectionTable />);

        await user.click(screen.getAllByLabelText('Select row')[0]);
        rerender(<SelectionTable hasRowHighlight={false} />);
        expect(readOverlay(screen.getAllByRole('row')[1])).toBe('');

        rerender(<SelectionTable hasRowHighlight />);
        expect(readOverlay(screen.getAllByRole('row')[1])).toBe(
          selectedBgColor,
        );
      });

      it('leaves unchecked rows without the variable', async () => {
        const user = userEvent.setup();
        render(<SelectionTable />);

        await user.click(screen.getAllByLabelText('Select row')[0]);

        expect(readOverlay(screen.getAllByRole('row')[2])).toBe('');
      });
    });
  });

  it('leaves product chrome outside the selection plugin', () => {
    const {result} = renderHook(() =>
      useTableSelection<SelectableUser>({
        getIsItemSelected: () => false,
        onSelectItem: vi.fn(),
        onSelectAll: vi.fn(),
        getIsAllSelected: () => false,
      }),
    );

    expect(result.current.transformScrollWrapper).toBeUndefined();
  });

  it('unsubscribes detached row refs instead of accumulating listeners', () => {
    const getIsItemSelected = vi.fn(() => false);
    const {result, rerender} = renderHook(() =>
      useTableSelection<SelectableUser>({
        getIsItemSelected,
        onSelectItem: vi.fn(),
        onSelectAll: vi.fn(),
        getIsAllSelected: () => false,
      }),
    );

    const initialProps: BodyRowRenderProps = {
      htmlProps: {},
      xstyle: [],
      children: null,
    };
    const row = document.createElement('tr');
    document.body.append(row);

    let detach: (() => void) | undefined;

    // Simulate React replacing the callback ref as this row re-renders.
    // Each detach must unsubscribe the previous ref before the next attaches.
    for (let i = 0; i < 3; i++) {
      act(() => {
        detach?.();
      });

      const transformed = result.current.transformBodyRow?.(
        initialProps,
        selectableUsers[0],
        0,
      );
      expect(transformed?.ref).toBeTypeOf('function');

      act(() => {
        const cleanup = (
          transformed?.ref as React.RefCallback<HTMLTableRowElement>
        )(row);
        expect(cleanup).toBeTypeOf('function');
        detach = cleanup as () => void;
      });
    }

    getIsItemSelected.mockClear();
    rerender();
    expect(getIsItemSelected).toHaveBeenCalledTimes(1);

    act(() => {
      detach?.();
    });
    getIsItemSelected.mockClear();
    rerender();
    expect(getIsItemSelected).not.toHaveBeenCalled();

    row.remove();
  });
});

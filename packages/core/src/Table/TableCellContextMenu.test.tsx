// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file TableCellContextMenu.test.tsx
 * @output Tests that table cells load the context menu only when they have
 *   actions, and that loading it leaves the cell's content in place
 * @position Validates the lazy boundary in TableCellContextMenu
 */

import {describe, it, expect, vi, beforeEach} from 'vitest';
import {act, fireEvent, render, screen} from '@testing-library/react';
import {useEffect, useState} from 'react';
import {Table} from './Table';
import {TableBody} from './TableBody';
import {TableRow} from './TableRow';
import {TableCell} from './TableCell';
import {loadTableContextMenu} from './TableCellContextMenu';
import type {TableContextAction} from './types';

const loads = vi.hoisted(() => ({count: 0}));
vi.mock('./tableContextMenu', async importOriginal => {
  loads.count += 1;
  return importOriginal();
});

// jsdom doesn't implement the Popover API; mirror the ContextMenu test's mock
// so the menu can open and its items become queryable (as hidden).
beforeEach(() => {
  HTMLElement.prototype.showPopover = vi.fn(function (this: HTMLElement) {
    this.setAttribute('popover-open', '');
    const event = new Event('toggle', {bubbles: false});
    Object.defineProperty(event, 'newState', {value: 'open'});
    this.dispatchEvent(event);
  });
  HTMLElement.prototype.hidePopover = vi.fn(function (this: HTMLElement) {
    this.removeAttribute('popover-open');
    const event = new Event('toggle', {bubbles: false});
    Object.defineProperty(event, 'newState', {value: 'closed'});
    this.dispatchEvent(event);
  });
});

const copyAction: TableContextAction = {
  id: 'copy',
  label: 'Copy',
  onSelect: () => {},
};

const mounts = {count: 0};

function Counter() {
  const [count, setCount] = useState(0);
  useEffect(() => {
    mounts.count += 1;
  }, []);
  return (
    <button type="button" onClick={() => setCount(c => c + 1)}>
      Count {count}
    </button>
  );
}

function renderCell(
  contextMenuActions?: TableContextAction[],
  children: React.ReactNode = 'Cell',
) {
  return render(
    <Table>
      <TableBody>
        <TableRow>
          <TableCell contextMenuActions={contextMenuActions}>
            {children}
          </TableCell>
        </TableRow>
      </TableBody>
    </Table>,
  );
}

// Order matters: the module registry is per file, so the first two tests see
// the menu before anything has loaded it.
describe('TableCellContextMenu', () => {
  it('does not load the context menu for cells without actions', async () => {
    renderCell();
    renderCell([]);
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 50));
    });
    expect(screen.getAllByText('Cell')).toHaveLength(2);
    expect(loads.count).toBe(0);
  });

  it('keeps the content node, focus and state while the menu loads', async () => {
    mounts.count = 0;
    renderCell([copyAction], <Counter />);
    const button = screen.getByRole('button', {name: 'Count 0'});
    fireEvent.click(button);
    button.focus();
    const trigger = button.parentElement as HTMLElement;
    // Not loaded yet: right-click still shows the browser's menu.
    expect(fireEvent.contextMenu(trigger)).toBe(true);

    await act(async () => {
      await loadTableContextMenu();
    });
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    expect(loads.count).toBe(1);
    expect(screen.getByRole('button', {name: 'Count 1'})).toBe(button);
    expect(document.activeElement).toBe(button);
    expect(mounts.count).toBe(1);

    // Loaded: the same trigger now opens the cell's menu.
    expect(fireEvent.contextMenu(trigger)).toBe(false);
    expect(
      screen.getByRole('menuitem', {name: 'Copy', hidden: true}),
    ).toBeTruthy();
  });

  it('renders a cell with actions synchronously once the menu has loaded', () => {
    renderCell([copyAction], 'Loaded cell');
    const trigger = screen.getByText('Loaded cell');
    expect(fireEvent.contextMenu(trigger)).toBe(false);
  });
});

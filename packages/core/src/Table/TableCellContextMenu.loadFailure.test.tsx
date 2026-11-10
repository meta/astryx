// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file TableCellContextMenu.loadFailure.test.tsx
 * @output Tests that a failed load of the table context menu keeps the table
 *   mounted, drops the held invocation and any early long press, returns the
 *   browser's own menu, and lets a later render or invocation load it again,
 *   including a first invocation after another cell loaded it
 * @position Validates TableCellContextMenu's load-failure path. Each test
 *   starts from a fresh module registry and a fresh mock of the menu module.
 */

import {describe, it, expect, vi, beforeEach} from 'vitest';
import {act, fireEvent, render, screen, waitFor} from '@testing-library/react';
import {mockPopover, scenarioActions} from './__tests__/menuLoadScenario';

const loader = {calls: 0, failures: 0};

beforeEach(() => {
  mockPopover();
  vi.resetModules();
  vi.doUnmock('./tableContextMenu');
  loader.calls = 0;
  vi.doMock('./tableContextMenu', async importOriginal => {
    loader.calls += 1;
    if (loader.calls <= loader.failures) {
      throw new Error('Failed to fetch dynamically imported module');
    }
    return importOriginal();
  });
});

async function renderTable(label: string) {
  const [{Table}, {TableBody}, {TableRow}, {TableCell}] = await Promise.all([
    import('./Table'),
    import('./TableBody'),
    import('./TableRow'),
    import('./TableCell'),
  ]);
  return render(
    <div>
      <h1>Page heading</h1>
      <Table>
        <TableBody>
          <TableRow>
            <TableCell contextMenuActions={scenarioActions}>{label}</TableCell>
            <TableCell>Plain cell</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </div>,
  );
}

async function settle() {
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, 20));
  });
}

describe('TableCellContextMenu menu load failure', () => {
  it('keeps the table, drops the held right-click and returns the browser menu when the menu fails to load', async () => {
    loader.failures = 1;
    const {container} = await renderTable('Alice');
    const cell = screen.getByText('Alice');
    // Held while the menu loads, so the browser's menu does not open.
    expect(fireEvent.contextMenu(cell)).toBe(false);

    await settle();

    expect(container.textContent).toBe('Page headingAlicePlain cell');
    expect(screen.getByText('Alice')).toBe(cell);
    expect(screen.queryByRole('menu', {hidden: true})).toBeNull();
    // No menu can open, so a right-click reaches the browser's own menu.
    expect(fireEvent.contextMenu(cell)).toBe(true);
    await settle();
    expect(screen.queryByRole('menu', {hidden: true})).toBeNull();
  });

  it('loads the menu again in a later render after a failed load', async () => {
    loader.failures = 1;
    const first = await renderTable('Alice');
    await settle();
    expect(loader.calls).toBe(1);
    expect(first.container.textContent).toBe('Page headingAlicePlain cell');

    await renderTable('Bob');
    const {loadTableContextMenu} = await import('./TableCellContextMenu');
    await act(async () => {
      await loadTableContextMenu();
    });
    await settle();

    expect(loader.calls).toBe(2);
    expect(fireEvent.contextMenu(screen.getByText('Bob'))).toBe(false);
    await waitFor(() => {
      expect(
        screen.getByRole('menuitem', {name: 'Copy', hidden: true}),
      ).toBeTruthy();
    });
  });
  it('opens the menu on the first right-click after another cell loaded it', async () => {
    loader.failures = 1;
    await renderTable('Alice');
    await settle();
    expect(loader.calls).toBe(1);

    // A second table loads the menu module after Alice's load failed.
    await renderTable('Bob');
    const {loadTableContextMenu} = await import('./TableCellContextMenu');
    await act(async () => {
      await loadTableContextMenu();
    });
    await settle();
    expect(loader.calls).toBe(2);

    // Alice's first right-click since then is held and opens her menu.
    expect(fireEvent.contextMenu(screen.getByText('Alice'))).toBe(false);
    await waitFor(() => {
      expect(
        screen.getByRole('menuitem', {name: 'Copy', hidden: true}),
      ).toBeTruthy();
    });
  });

  it('ends an early long press when the menu fails to load before its deadline', async () => {
    loader.failures = 1;
    await renderTable('Alice');
    const cell = screen.getByText('Alice');
    fireEvent.touchStart(cell, {touches: [{clientX: 10, clientY: 10}]});
    await settle();
    // Past the long-press deadline, then lifted: nothing may be held.
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 650));
    });
    fireEvent.touchEnd(cell, {touches: []});

    // A right-click retries the load; a held long press would open on attach.
    expect(fireEvent.contextMenu(cell)).toBe(true);
    const {loadTableContextMenu} = await import('./TableCellContextMenu');
    await act(async () => {
      await loadTableContextMenu();
    });
    await settle();
    expect(loader.calls).toBe(2);
    expect(screen.queryByRole('menu', {hidden: true})).toBeNull();

    // The retried menu works for the next right-click.
    expect(fireEvent.contextMenu(cell)).toBe(false);
    await waitFor(() => {
      expect(
        screen.getByRole('menuitem', {name: 'Copy', hidden: true}),
      ).toBeTruthy();
    });
  });
});

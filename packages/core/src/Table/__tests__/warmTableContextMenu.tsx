// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file warmTableContextMenu.tsx
 * @input Uses TableCellContextMenu and Testing Library
 * @output Exports warmTableContextMenu, a test helper that resolves the lazily
 *   loaded table context menu once
 * @position Test-only helper for suites that right-click table cells
 *
 * TableCell and TableHeaderCell load their context menu with React.lazy, so a
 * cell's menu is ready a tick after the cell first renders. Rendering one up
 * front caches the resolved module on the lazy component, and every later
 * cell renders its menu synchronously. Call it from `beforeAll`.
 */

import {act, cleanup, render} from '@testing-library/react';
import {
  TableCellContextMenu,
  loadTableContextMenu,
} from '../TableCellContextMenu';

export async function warmTableContextMenu(): Promise<void> {
  try {
    await act(async () => {
      render(
        <TableCellContextMenu
          actions={[{id: 'warm', label: 'Warm action', onSelect: () => {}}]}>
          Warm cell
        </TableCellContextMenu>,
      );
    });
    // A cold import transforms the menu's module graph; once it settles, the
    // lazy component resolves on the next tick.
    await act(async () => {
      await loadTableContextMenu();
    });
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });
  } finally {
    cleanup();
  }
}

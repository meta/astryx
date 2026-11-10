// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file TableCellContextMenu.modality.test.tsx
 * @output Tests that a mouse right-click held before the menu loads opens the
 *   menu without the keyboard focus ring
 * @position Validates interaction-modality tracking for an early invocation
 *   (architecture:interaction-modality INV1). Its own file, so no earlier
 *   menu in this document has started the tracking.
 */

import {describe, it, expect, vi, beforeEach} from 'vitest';
import {act, fireEvent, render, screen, waitFor} from '@testing-library/react';
import {mockPopover, scenarioActions} from './__tests__/menuLoadScenario';

const gate = {release: () => {}};

beforeEach(() => {
  mockPopover();
  vi.resetModules();
  vi.doUnmock('./tableContextMenu');
  const opened = new Promise<void>(resolve => {
    gate.release = resolve;
  });
  vi.doMock('./tableContextMenu', async importOriginal => {
    await opened;
    return importOriginal();
  });
});

describe('TableCellContextMenu early invocation modality', () => {
  it('focuses the first row without the keyboard ring after an early mouse right-click', async () => {
    const [{Table}, {TableBody}, {TableRow}, {TableCell}, menu] =
      await Promise.all([
        import('./Table'),
        import('./TableBody'),
        import('./TableRow'),
        import('./TableCell'),
        import('./TableCellContextMenu'),
      ]);
    render(
      <Table>
        <TableBody>
          <TableRow>
            <TableCell contextMenuActions={scenarioActions}>Name</TableCell>
          </TableRow>
        </TableBody>
      </Table>,
    );
    const focus = vi.spyOn(HTMLElement.prototype, 'focus');
    const trigger = screen.getByText('Name');
    fireEvent.pointerDown(trigger, {pointerType: 'mouse', button: 2});
    expect(fireEvent.contextMenu(trigger)).toBe(false);

    gate.release();
    await act(async () => {
      await menu.loadTableContextMenu();
    });

    await waitFor(() =>
      expect(focus).toHaveBeenCalledWith(
        expect.objectContaining({focusVisible: false}),
      ),
    );
    expect(focus.mock.contexts.at(-1)).toHaveTextContent('Copy');
    focus.mockRestore();
  });
});

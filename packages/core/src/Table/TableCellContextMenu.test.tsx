// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file TableCellContextMenu.test.tsx
 * @output Tests that body cells load the context menu only when they have
 *   actions, and that loading it leaves the cell's content in place
 * @position Validates the lazy boundary in TableCellContextMenu
 */

import {describe, it, expect, vi, beforeEach} from 'vitest';
import {act, fireEvent, render, screen} from '@testing-library/react';
import {Table} from './Table';
import {TableBody} from './TableBody';
import {TableRow} from './TableRow';
import {TableCell} from './TableCell';
import type {TableContextAction} from './types';
import {
  StatefulContent,
  expectContentSurvivesMenuLoad,
  mockPopover,
  scenarioActions,
} from './__tests__/menuLoadScenario';

const loads = vi.hoisted(() => ({count: 0}));
vi.mock('./tableContextMenu', async importOriginal => {
  loads.count += 1;
  return importOriginal();
});

beforeEach(mockPopover);

function bodyCell(
  contextMenuActions: TableContextAction[] | undefined,
  children: React.ReactNode,
) {
  return (
    <Table>
      <TableBody>
        <TableRow>
          <TableCell contextMenuActions={contextMenuActions}>
            {children}
          </TableCell>
        </TableRow>
      </TableBody>
    </Table>
  );
}

// Order matters: the module registry is per file, so the first two tests see
// the menu before anything has loaded it.
describe('TableCellContextMenu', () => {
  it('does not load the context menu for cells without actions', async () => {
    render(bodyCell(undefined, 'Cell'));
    render(bodyCell([], 'Cell'));
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 50));
    });
    expect(screen.getAllByText('Cell')).toHaveLength(2);
    expect(loads.count).toBe(0);
  });

  it('keeps a body cell editor’s node, value, focus and state while the menu loads', async () => {
    await expectContentSurvivesMenuLoad(
      bodyCell(scenarioActions, <StatefulContent />),
      'input',
      'after-load',
    );
    expect(loads.count).toBe(1);
  });

  it('renders a cell with actions synchronously once the menu has loaded', () => {
    render(bodyCell(scenarioActions, 'Loaded cell'));
    expect(fireEvent.contextMenu(screen.getByText('Loaded cell'))).toBe(false);
  });
});

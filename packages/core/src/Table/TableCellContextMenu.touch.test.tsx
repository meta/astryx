// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file TableCellContextMenu.touch.test.tsx
 * @output Tests that a long press on a cell before its menu loads opens the
 *   menu once it loads
 * @position Validates the early long press in TableCellContextMenu; its own
 *   file so the menu starts unloaded
 */

import {describe, it, expect, beforeEach} from 'vitest';
import {act, fireEvent, render, screen} from '@testing-library/react';
import {Table} from './Table';
import {TableBody} from './TableBody';
import {TableRow} from './TableRow';
import {TableCell} from './TableCell';
import {loadTableContextMenu} from './TableCellContextMenu';
import {mockPopover, scenarioActions} from './__tests__/menuLoadScenario';

beforeEach(mockPopover);

async function wait(ms: number) {
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, ms));
  });
}

describe('TableCellContextMenu early long press', () => {
  it('opens the menu for a press held past the deadline and lifted before the menu loads', async () => {
    render(
      <Table>
        <TableBody>
          <TableRow>
            <TableCell contextMenuActions={scenarioActions}>Hold me</TableCell>
          </TableRow>
        </TableBody>
      </Table>,
    );
    const trigger = screen.getByText('Hold me');
    fireEvent.touchStart(trigger, {touches: [{clientX: 10, clientY: 10}]});
    // A jitter inside the movement tolerance keeps the press.
    fireEvent.touchMove(trigger, {touches: [{clientX: 14, clientY: 12}]});
    await wait(650);
    fireEvent.touchEnd(trigger, {touches: []});
    expect(screen.queryByRole('menu', {hidden: true})).toBeNull();

    await act(async () => {
      await loadTableContextMenu();
    });
    await wait(0);

    expect(
      screen.getByRole('menuitem', {name: 'Copy', hidden: true}),
    ).toBeTruthy();
  });

  it('does not open the menu for a tap before the menu loads', async () => {
    render(
      <Table>
        <TableBody>
          <TableRow>
            <TableCell contextMenuActions={scenarioActions}>Tap me</TableCell>
          </TableRow>
        </TableBody>
      </Table>,
    );
    const trigger = screen.getByText('Tap me');
    fireEvent.touchStart(trigger, {touches: [{clientX: 10, clientY: 10}]});
    fireEvent.touchEnd(trigger, {touches: []});
    await act(async () => {
      await loadTableContextMenu();
    });
    await wait(600);
    expect(screen.queryByRole('menu', {hidden: true})).toBeNull();
  });
});

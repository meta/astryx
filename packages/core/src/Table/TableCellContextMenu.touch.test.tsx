// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file TableCellContextMenu.touch.test.tsx
 * @output Tests that a touch on a cell before its menu loads is handled once
 *   the menu loads: a long press opens it, a tap does not
 * @position Validates the early long press in TableCellContextMenu. Each test
 *   starts from a fresh module registry and holds the menu module until it
 *   releases it, so the menu is unloaded during the touch.
 */

import {describe, it, expect, vi, beforeEach} from 'vitest';
import {act, fireEvent, render, screen} from '@testing-library/react';
import type {ReactNode} from 'react';
import {mockPopover, scenarioActions} from './__tests__/menuLoadScenario';

const gate = vi.hoisted(() => ({
  release: () => {},
  opened: Promise.resolve(),
}));
vi.mock('./tableContextMenu', async importOriginal => {
  await gate.opened;
  return importOriginal();
});

beforeEach(() => {
  mockPopover();
  vi.resetModules();
  gate.opened = new Promise<void>(resolve => {
    gate.release = resolve;
  });
});

async function renderColdCell(label: string): Promise<{
  trigger: HTMLElement;
  loadMenu: () => Promise<void>;
}> {
  const [{Table}, {TableBody}, {TableRow}, {TableCell}, menu] =
    await Promise.all([
      import('./Table'),
      import('./TableBody'),
      import('./TableRow'),
      import('./TableCell'),
      import('./TableCellContextMenu'),
    ]);
  const cell: ReactNode = (
    <Table>
      <TableBody>
        <TableRow>
          <TableCell contextMenuActions={scenarioActions}>{label}</TableCell>
        </TableRow>
      </TableBody>
    </Table>
  );
  render(cell);
  return {
    trigger: screen.getByText(label),
    loadMenu: async () => {
      gate.release();
      await act(async () => {
        await menu.loadTableContextMenu();
      });
      await wait(0);
    },
  };
}

async function wait(ms: number) {
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, ms));
  });
}

describe('TableCellContextMenu early touch', () => {
  it('opens the menu for a press held past the deadline and lifted before the menu loads', async () => {
    const {trigger, loadMenu} = await renderColdCell('Hold me');
    fireEvent.touchStart(trigger, {touches: [{clientX: 10, clientY: 10}]});
    // A move inside the movement tolerance keeps the press.
    fireEvent.touchMove(trigger, {touches: [{clientX: 14, clientY: 12}]});
    await wait(650);
    fireEvent.touchEnd(trigger, {touches: []});
    expect(screen.queryByRole('menu', {hidden: true})).toBeNull();

    await loadMenu();

    expect(
      screen.getByRole('menuitem', {name: 'Copy', hidden: true}),
    ).toBeTruthy();
  });

  it('does not open the menu for a tap before the menu loads', async () => {
    const {trigger, loadMenu} = await renderColdCell('Tap me');
    fireEvent.touchStart(trigger, {touches: [{clientX: 10, clientY: 10}]});
    fireEvent.touchEnd(trigger, {touches: []});

    await loadMenu();
    await wait(600);

    expect(screen.queryByRole('menu', {hidden: true})).toBeNull();
  });
});

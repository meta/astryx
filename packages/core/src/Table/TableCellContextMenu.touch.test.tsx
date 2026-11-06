// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file TableCellContextMenu.touch.test.tsx
 * @output Tests what an invocation before the menu loads does once it loads:
 *   a long press opens the menu, a tap does not, only the last held cell
 *   opens, and a later press or key drops the hold
 * @position Validates early invocations in TableCellContextMenu. Each test
 *   starts from a fresh module registry and a fresh mock. The mock holds the
 *   menu module until the test releases it.
 */

import {describe, it, expect, vi, beforeEach} from 'vitest';
import {act, fireEvent, render, screen} from '@testing-library/react';
import type {ReactNode} from 'react';
import type {TableContextAction} from './types';
import {mockPopover, scenarioActions} from './__tests__/menuLoadScenario';

const gate = {
  release: () => {},
  factoryRuns: 0,
};

beforeEach(() => {
  mockPopover();
  // A fresh registry and a fresh mock per test: the gated factory runs again,
  // so each test's menu import waits for that test's own release.
  vi.resetModules();
  vi.doUnmock('./tableContextMenu');
  const opened = new Promise<void>(resolve => {
    gate.release = resolve;
  });
  vi.doMock('./tableContextMenu', async importOriginal => {
    gate.factoryRuns += 1;
    await opened;
    return importOriginal();
  });
});

type ColdCell = {label: string; actions?: TableContextAction[]};

/**
 * Renders one row of cells from a fresh module registry. The menu module stays
 * held until `loadMenu` releases it.
 */
async function renderColdCells(cells: ColdCell[]): Promise<{
  triggers: HTMLElement[];
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
  const table: ReactNode = (
    <Table>
      <TableBody>
        <TableRow>
          {cells.map(cell => (
            <TableCell
              key={cell.label}
              contextMenuActions={cell.actions ?? scenarioActions}>
              {cell.label}
            </TableCell>
          ))}
        </TableRow>
      </TableBody>
    </Table>
  );
  render(table);
  return {
    triggers: cells.map(cell => screen.getByText(cell.label)),
    loadMenu: async () => {
      gate.release();
      await act(async () => {
        await menu.loadTableContextMenu();
      });
      await wait(0);
    },
  };
}

async function renderColdCell(label: string): Promise<{
  trigger: HTMLElement;
  loadMenu: () => Promise<void>;
}> {
  const {triggers, loadMenu} = await renderColdCells([{label}]);
  return {trigger: triggers[0], loadMenu};
}

async function wait(ms: number) {
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, ms));
  });
}

describe('TableCellContextMenu early invocation', () => {
  it('opens the menu for a press held past the deadline and lifted before the menu loads', async () => {
    const runsBefore = gate.factoryRuns;
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
    expect(gate.factoryRuns).toBe(runsBefore + 1);
  });

  it('does not open the menu for a tap before the menu loads', async () => {
    const runsBefore = gate.factoryRuns;
    const {trigger, loadMenu} = await renderColdCell('Tap me');
    fireEvent.touchStart(trigger, {touches: [{clientX: 10, clientY: 10}]});
    fireEvent.touchEnd(trigger, {touches: []});
    expect(screen.queryByRole('menu', {hidden: true})).toBeNull();

    await loadMenu();
    await wait(600);

    expect(screen.queryByRole('menu', {hidden: true})).toBeNull();
    // The menu module loaded through this test's own gated factory.
    expect(gate.factoryRuns).toBe(runsBefore + 1);
  });
  it('opens only the last of two cells right-clicked before the menu loads', async () => {
    const {triggers, loadMenu} = await renderColdCells([
      {label: 'Name', actions: [{id: 'a', label: 'Alpha', onSelect: () => {}}]},
      {label: 'Email', actions: [{id: 'b', label: 'Beta', onSelect: () => {}}]},
    ]);
    expect(fireEvent.contextMenu(triggers[0])).toBe(false);
    expect(fireEvent.contextMenu(triggers[1])).toBe(false);

    await loadMenu();

    expect(
      screen.getByRole('menuitem', {name: 'Beta', hidden: true}),
    ).toBeTruthy();
    expect(
      screen.queryByRole('menuitem', {name: 'Alpha', hidden: true}),
    ).toBeNull();
  });

  it('drops a held right-click once a press elsewhere comes before the menu loads', async () => {
    const {trigger, loadMenu} = await renderColdCell('Name');
    expect(fireEvent.contextMenu(trigger)).toBe(false);
    fireEvent.pointerDown(document.body);

    await loadMenu();

    expect(screen.queryByRole('menu', {hidden: true})).toBeNull();
  });

  it('drops a held right-click once a key comes before the menu loads', async () => {
    const {trigger, loadMenu} = await renderColdCell('Name');
    expect(fireEvent.contextMenu(trigger)).toBe(false);
    fireEvent.keyDown(document, {key: 'Escape'});

    await loadMenu();

    expect(screen.queryByRole('menu', {hidden: true})).toBeNull();
  });
});

// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file TableCellContextMenu.touch.test.tsx
 * @output Tests what an invocation before the menu loads does once it loads:
 *   a long press opens the menu, timed and recognized by the loaded menu from
 *   the held touch, a tap or a moved press does not, only the last held cell
 *   opens, a later press or key drops the hold, the held point stays in the
 *   cell across a scroll, focus returns to the cell, and an unmounted cell
 *   drops only its own hold
 * @position Validates early invocations in TableCellContextMenu. Each test
 *   starts from a fresh module registry and a fresh mock. The mock holds the
 *   menu module until the test releases it.
 */

import {describe, it, expect, vi, beforeEach} from 'vitest';
import {act, fireEvent, render, screen} from '@testing-library/react';
import type {ReactNode} from 'react';
import type {TableContextAction} from './types';
import type * as LongPressDetectorModule from '../hooks/longPressDetector';
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
async function renderColdCells(
  cells: ColdCell[],
  content?: (label: string) => ReactNode,
): Promise<{
  triggers: HTMLElement[];
  loadMenu: () => Promise<void>;
  unmount: () => void;
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
              {content ? content(cell.label) : cell.label}
            </TableCell>
          ))}
        </TableRow>
      </TableBody>
    </Table>
  );
  const {unmount} = render(table);
  return {
    unmount,
    triggers: cells.map(
      cell =>
        screen.getByText(cell.label).closest('td')
          ?.firstElementChild as HTMLElement,
    ),
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
  it('recognizes no gesture before the menu loads: the loaded menu reads the held touch', async () => {
    const detectorsMade = {count: 0};
    vi.doMock('../hooks/longPressDetector', async importOriginal => {
      const original = await importOriginal<typeof LongPressDetectorModule>();
      return {
        ...original,
        createLongPressDetector: (
          ...args: Parameters<typeof original.createLongPressDetector>
        ) => {
          detectorsMade.count += 1;
          return original.createLongPressDetector(...args);
        },
      };
    });
    const {trigger, loadMenu} = await renderColdCell('Hold me');
    fireEvent.touchStart(trigger, {touches: [{clientX: 10, clientY: 10}]});
    await wait(650);
    fireEvent.touchEnd(trigger, {touches: []});
    expect(detectorsMade.count).toBe(0);

    await loadMenu();

    expect(
      screen.getByRole('menuitem', {name: 'Copy', hidden: true}),
    ).toBeTruthy();
    vi.doUnmock('../hooks/longPressDetector');
  });

  it('opens the menu at the deadline counted from the touch start for a press still held when the menu loads', async () => {
    const {trigger, loadMenu} = await renderColdCell('Hold me');
    fireEvent.touchStart(trigger, {touches: [{clientX: 10, clientY: 10}]});
    await wait(200);

    await loadMenu();
    expect(screen.queryByRole('menu', {hidden: true})).toBeNull();
    await wait(400);

    expect(
      screen.getByRole('menuitem', {name: 'Copy', hidden: true}),
    ).toBeTruthy();
    fireEvent.touchEnd(trigger, {touches: []});
  });

  it('does not open the menu for a press that moved past the tolerance before the menu loads', async () => {
    const {trigger, loadMenu} = await renderColdCell('Scroll me');
    fireEvent.touchStart(trigger, {touches: [{clientX: 10, clientY: 10}]});
    fireEvent.touchMove(trigger, {touches: [{clientX: 10, clientY: 60}]});
    await wait(650);
    fireEvent.touchEnd(trigger, {touches: []});

    await loadMenu();
    await wait(600);

    expect(screen.queryByRole('menu', {hidden: true})).toBeNull();
  });

  it('drops a held touch once a press elsewhere comes before the menu loads', async () => {
    const {trigger, loadMenu} = await renderColdCell('Hold me');
    fireEvent.touchStart(trigger, {touches: [{clientX: 10, clientY: 10}]});
    await wait(650);
    fireEvent.touchEnd(trigger, {touches: []});
    fireEvent.pointerDown(document.body);

    await loadMenu();
    await wait(600);

    expect(screen.queryByRole('menu', {hidden: true})).toBeNull();
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
  it('keeps a held right-click at its point in the cell when the page scrolls during the load', async () => {
    const {triggers, loadMenu} = await renderColdCells([{label: 'Name'}]);
    const trigger = triggers[0];
    let top = 200;
    trigger.getBoundingClientRect = () =>
      ({
        left: 100,
        top,
        width: 200,
        height: 40,
        right: 300,
        bottom: top + 40,
      }) as DOMRect;
    expect(
      fireEvent.contextMenu(trigger, {clientX: 130, clientY: 215, detail: 1}),
    ).toBe(false);
    // The page scrolls 150px while the menu loads.
    top = 50;

    await loadMenu();

    expect(
      screen.getByRole('menuitem', {name: 'Copy', hidden: true}),
    ).toBeTruthy();
    const anchor = trigger.querySelector<HTMLElement>(
      'span[aria-hidden="true"]',
    );
    expect(anchor?.style.left).toBe('30px');
    expect(anchor?.style.top).toBe('15px');
  });

  it('restores focus to the cell on close when the focused element before a held right-click was not an HTML element', async () => {
    const {triggers, loadMenu} = await renderColdCells(
      [{label: 'Name'}],
      label => (
        <>
          {label}
          <svg tabIndex={0} aria-label="Mark" />
        </>
      ),
    );
    const trigger = triggers[0];
    const mark = screen.getByLabelText('Mark');
    mark.focus();
    expect(document.activeElement).toBe(mark);
    expect(fireEvent.contextMenu(trigger)).toBe(false);
    const focusTrigger = vi.spyOn(trigger, 'focus');

    await loadMenu();
    expect(screen.getByRole('menu', {hidden: true})).toBeTruthy();
    fireEvent.keyDown(document, {key: 'Escape'});

    // The menu restores focus to the cell's trigger, as a direct right-click
    // on the cell does.
    expect(focusTrigger).toHaveBeenCalled();
  });

  it('drops the hold of a cell that unmounts before the menu loads', async () => {
    const hold = () =>
      (globalThis as unknown as Record<symbol, {current: unknown}>)[
        Symbol.for('@astryxdesign/core/table/context-menu-hold/v1')
      ];
    const first = await renderColdCells([{label: 'Name'}]);
    expect(fireEvent.contextMenu(first.triggers[0])).toBe(false);
    expect(hold().current).not.toBeNull();

    first.unmount();

    expect(hold().current).toBeNull();
    await first.loadMenu();
    expect(screen.queryByRole('menu', {hidden: true})).toBeNull();
  });

  it("keeps another cell's hold when a cell unmounts before the menu loads", async () => {
    const first = await renderColdCells([{label: 'Name'}]);
    const second = await renderColdCells([
      {label: 'Email', actions: [{id: 'b', label: 'Beta', onSelect: () => {}}]},
    ]);
    expect(fireEvent.contextMenu(first.triggers[0])).toBe(false);
    expect(fireEvent.contextMenu(second.triggers[0])).toBe(false);

    first.unmount();
    await second.loadMenu();

    expect(
      screen.getByRole('menuitem', {name: 'Beta', hidden: true}),
    ).toBeTruthy();
  });
});

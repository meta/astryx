// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file DropdownMenuSheetFirstOpen.test.tsx
 * @input vitest (jsdom), Testing Library, DropdownMenu, module mocks that
 *   record when the lazily loaded sheet modules are requested and loaded
 * @output Checks that a bottom-sheet DropdownMenu loads its sheet and rows at
 *   rest. So the first open renders the actions in the same commit, cold (no
 *   warm-up). It waits on the dropdown's own requests and on the loads, never
 *   on a clock. A cold load can outlast any fixed wait on a loaded machine.
 * @position Testing for DropdownMenu.tsx and lazyMenuBottomSheet.ts
 */

import {act, fireEvent, render, screen} from '@testing-library/react';
import {beforeEach, expect, it, vi} from 'vitest';
import {DropdownMenu} from './DropdownMenu';
import type * as MenuBottomSheetModule from './MenuBottomSheet';
import type * as ActionListModule from './MenuBottomSheetActionList';

const modules = vi.hoisted(() => {
  /** A promise the module's own request settles. */
  const signal = () => {
    let fire = () => {};
    const fired = new Promise<void>(resolve => {
      fire = resolve;
    });
    return {fire, fired};
  };
  return {
    loaded: new Set<string>(),
    sheetRequested: signal(),
    rowsRequested: signal(),
  };
});

vi.mock('./MenuBottomSheet', async importOriginal => {
  modules.sheetRequested.fire();
  const module = await importOriginal<typeof MenuBottomSheetModule>();
  modules.loaded.add('sheet');
  return module;
});

vi.mock('./MenuBottomSheetActionList', async importOriginal => {
  modules.rowsRequested.fire();
  const module = await importOriginal<typeof ActionListModule>();
  modules.loaded.add('rows');
  return module;
});

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = vi.fn(function (
    this: HTMLDialogElement,
  ) {
    this.setAttribute('open', '');
  });
  HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
    this.removeAttribute('open');
  });
});

it('loads the sheet and its rows at rest, so the first open renders the actions in the same commit', async () => {
  render(
    <DropdownMenu
      button={{label: 'Project actions'}}
      presentation="bottom-sheet"
      items={[{label: 'Edit project'}, {label: 'Archive'}]}
    />,
  );
  // Closed, the sheet renders nothing, yet the dropdown requests both modules
  // and both load, however long a cold load takes.
  expect(document.querySelector('dialog')).toBeNull();
  await act(async () => {
    await Promise.all([
      modules.sheetRequested.fired,
      modules.rowsRequested.fired,
    ]);
    await Promise.all([
      import('./MenuBottomSheet'),
      import('./MenuBottomSheetActionList'),
    ]);
    // A task boundary, not a wait. What the loads let through runs in
    // microtasks: the dropdown keeps the rows' module, and the lazy sheet
    // resolves. They have all run once the next task starts.
    await new Promise(resolve => setTimeout(resolve, 0));
  });
  expect([...modules.loaded].sort()).toEqual(['rows', 'sheet']);

  // The rows render in the same commit as the opening: nothing suspends.
  act(() => {
    fireEvent.click(screen.getByRole('button', {name: /Project actions/}));
  });
  expect(screen.getByRole('button', {name: 'Edit project'})).toBeVisible();
  expect(screen.getByRole('button', {name: 'Archive'})).toBeVisible();
});

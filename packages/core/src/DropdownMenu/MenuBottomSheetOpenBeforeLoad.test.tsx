// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file MenuBottomSheetOpenBeforeLoad.test.tsx
 * @input vitest (jsdom), Testing Library, DropdownMenu, module mocks that hold
 *   the sheet's row module until the test releases it
 * @output Checks that a bottom-sheet DropdownMenu opened before its sheet
 *   modules have loaded (a press right after mount, as a page that opens its
 *   menu on load does) never shows the sheet without its rows: the sheet
 *   appears together with its actions, in one commit
 * @position Testing for lazyMenuBottomSheet.ts
 */

import {act, fireEvent, render, screen} from '@testing-library/react';
import {beforeEach, expect, it, vi} from 'vitest';
import {DropdownMenu} from './DropdownMenu';
import type * as MenuBottomSheetModule from './MenuBottomSheet';
import type * as ActionListModule from './MenuBottomSheetActionList';

const modules = vi.hoisted(() => {
  let release = () => {};
  const rowsReleased = new Promise<void>(resolve => {
    release = resolve;
  });
  return {release, rowsReleased};
});

vi.mock('./MenuBottomSheet', async importOriginal =>
  importOriginal<typeof MenuBottomSheetModule>(),
);

// The row module loads only when the test releases it, after the sheet's own
// module, as a slow second chunk does on a cold load.
vi.mock('./MenuBottomSheetActionList', async importOriginal => {
  await modules.rowsReleased;
  return importOriginal<typeof ActionListModule>();
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

/** Lets every microtask the loads released run: one task boundary. */
async function settleLoads() {
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, 0));
  });
}

it('opened before its modules load, shows the sheet only together with its rows', async () => {
  render(
    <DropdownMenu
      button={{label: 'Project actions'}}
      presentation="bottom-sheet"
      items={[{label: 'Edit project'}, {label: 'Archive'}]}
    />,
  );
  // A press right after mount, before the at-rest preload has finished.
  act(() => {
    fireEvent.click(screen.getByRole('button', {name: /Project actions/}));
  });

  // The sheet's own module loads; the row module is still held.
  await act(async () => {
    await import('./MenuBottomSheet');
  });
  await settleLoads();
  const sheetWithoutRows =
    document.querySelector('dialog[open]') != null &&
    screen.queryByRole('button', {name: 'Edit project'}) == null;
  expect(sheetWithoutRows).toBe(false);

  // Once the rows load, the sheet shows with every action.
  await act(async () => {
    modules.release();
    await import('./MenuBottomSheetActionList');
  });
  await settleLoads();
  expect(document.querySelector('dialog[open]')).not.toBeNull();
  expect(screen.getByRole('button', {name: 'Edit project'})).toBeVisible();
  expect(screen.getByRole('button', {name: 'Archive'})).toBeVisible();
});

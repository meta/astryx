// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file MenuBottomSheetPerSheetWait.test.tsx
 * @input vitest (jsdom), Testing Library, DropdownMenu and ContextMenu, module
 *   mocks that hold the sheet's row module until the test releases it
 * @output Checks that each bottom sheet decides on its own whether it waits for
 *   the action list. On a page with both kinds of menu, a ContextMenu sheet
 *   with caller content opens while the rows are still loading, and a
 *   DropdownMenu sheet shows only together with its rows
 * @position Testing for lazyMenuBottomSheet.ts
 */

import {act, fireEvent, render, screen} from '@testing-library/react';
import {beforeEach, expect, it, vi} from 'vitest';
import {ContextMenu} from '../ContextMenu/ContextMenu';
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

// The row module loads only when the test releases it.
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

it('on a page with both kinds of sheet menu, opens the caller-content sheet while the rows still load', async () => {
  render(
    <>
      <DropdownMenu
        button={{label: 'Project actions'}}
        presentation="bottom-sheet"
        items={[{label: 'Edit project'}, {label: 'Archive'}]}
      />
      <ContextMenu
        presentation="bottom-sheet"
        label="Row actions"
        menuContent={<button type="button">Custom action</button>}>
        <div>Long-press me</div>
      </ContextMenu>
    </>,
  );
  fireEvent.contextMenu(screen.getByText('Long-press me'));
  await act(async () => {
    await import('./MenuBottomSheet');
  });
  await settleLoads();
  // The row module is still held, and the caller-content sheet needs none.
  expect(screen.getByRole('button', {name: 'Custom action'})).toBeVisible();

  // The DropdownMenu sheet shows only together with its rows.
  act(() => {
    fireEvent.click(screen.getByRole('button', {name: /Project actions/}));
  });
  await settleLoads();
  // Only the ContextMenu sheet is open: the DropdownMenu sheet is not shown
  // with its heading alone.
  expect(document.querySelectorAll('dialog[open]')).toHaveLength(1);
  expect(screen.queryByRole('button', {name: 'Edit project'})).toBeNull();
  await act(async () => {
    modules.release();
    await import('./MenuBottomSheetActionList');
  });
  await settleLoads();
  expect(document.querySelectorAll('dialog[open]')).toHaveLength(2);
  expect(screen.getByRole('button', {name: 'Edit project'})).toBeVisible();
  expect(screen.getByRole('button', {name: 'Archive'})).toBeVisible();
});

// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file DropdownMenuLazySheet.test.tsx
 * @input Uses DropdownMenu, Testing Library, and a held module load
 * @output Tests DropdownMenu while its on-demand touch sheet is still loading
 * @position Test file for DropdownMenu
 *
 * This file never warms the sheet, and it checks that a popover menu never
 * requests it: each test holds the sheet modules until it
 * releases them, so it exercises the path a real page takes while the sheet's
 * code is still downloading.
 */

import {describe, it, expect, vi, beforeAll, beforeEach} from 'vitest';
import {render, screen, waitFor, act} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type {DropdownMenu as DropdownMenuComponent} from './DropdownMenu';

const sheetLoad = vi.hoisted(() => {
  let release: () => void = () => {};
  const gate = new Promise<void>(resolve => {
    release = resolve;
  });
  return {gate, release: () => release(), requested: [] as string[]};
});

vi.mock('./MenuBottomSheet', async importOriginal => {
  sheetLoad.requested.push('MenuBottomSheet');
  await sheetLoad.gate;
  return importOriginal();
});

vi.mock('./MenuBottomSheetActionList', async importOriginal => {
  sheetLoad.requested.push('MenuBottomSheetActionList');
  await sheetLoad.gate;
  return importOriginal();
});

let DropdownMenu: typeof DropdownMenuComponent;

// If any module the dropdown loads imported the sheet eagerly, this import
// would wait on the held sheet and the hook would time out.
beforeAll(async () => {
  ({DropdownMenu} = await import('./DropdownMenu'));
}, 10000);

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = vi.fn(function (
    this: HTMLDialogElement,
  ) {
    this.setAttribute('open', '');
  });
  HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
    this.removeAttribute('open');
  });
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  );
});

describe('DropdownMenu touch sheet loaded on demand', () => {
  // Runs first: nothing in this file has rendered a sheet yet.
  it('never loads the sheet for a popover menu', async () => {
    const user = userEvent.setup();
    HTMLElement.prototype.showPopover = vi.fn();
    HTMLElement.prototype.hidePopover = vi.fn();
    render(
      <DropdownMenu
        button={{label: 'Actions'}}
        items={[{label: 'Edit project'}, {label: 'Delete'}]}
      />,
    );

    await user.click(screen.getByRole('button', {name: /Actions/}));
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 50));
    });

    // Importing DropdownMenu and opening a popover menu requested neither
    // sheet module, so no other module the dropdown loads imports it eagerly.
    expect(sheetLoad.requested).toEqual([]);
  });

  it('focuses the first action when a keyboard open beats the sheet load', async () => {
    const user = userEvent.setup();
    render(
      <DropdownMenu
        button={{label: 'Actions'}}
        presentation="bottom-sheet"
        items={[{label: 'Edit project'}, {label: 'Delete'}]}
      />,
    );

    const trigger = screen.getByRole('button', {name: /Actions/});
    trigger.focus();
    await user.keyboard('{Enter}');
    // The open has committed, but the sheet's code has not arrived yet.
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 50));
    });
    expect(screen.queryByRole('button', {name: 'Edit project'})).toBeNull();

    await act(async () => {
      sheetLoad.release();
    });

    await waitFor(
      () =>
        expect(
          screen.getByRole('button', {name: 'Edit project'}),
        ).toHaveFocus(),
      {timeout: 15000},
    );
  }, 20000);
});

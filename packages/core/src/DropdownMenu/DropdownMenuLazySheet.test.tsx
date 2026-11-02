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
 * code is still downloading. Every wait here is on a module load itself, never
 * on a clock: on a loaded machine a cold load can take longer than any fixed
 * wait.
 */

import {describe, it, expect, vi, beforeAll, beforeEach} from 'vitest';
import {render, screen, act} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type {DropdownMenu as DropdownMenuComponent} from './DropdownMenu';

const sheetLoad = vi.hoisted(() => {
  let release: () => void = () => {};
  const gate = new Promise<void>(resolve => {
    release = resolve;
  });
  return {
    gate,
    release: () => release(),
    requested: [] as string[],
    /** DropdownMenu's own module is loading: a sheet request now is eager. */
    isLoadingDropdown: false,
  };
});

/** Records a request for a sheet module, then holds it until release. */
async function holdSheetModule(name: string): Promise<void> {
  sheetLoad.requested.push(name);
  if (sheetLoad.isLoadingDropdown) {
    // Held, it would hang DropdownMenu's own load: fail it at once instead.
    throw new Error(`a module DropdownMenu loads imports ${name} eagerly`);
  }
  await sheetLoad.gate;
}

vi.mock('./MenuBottomSheet', async importOriginal => {
  await holdSheetModule('MenuBottomSheet');
  return importOriginal();
});

vi.mock('./MenuBottomSheetActionList', async importOriginal => {
  await holdSheetModule('MenuBottomSheetActionList');
  return importOriginal();
});

let DropdownMenu: typeof DropdownMenuComponent;

// If any module the dropdown loads imported the sheet eagerly, the sheet's
// module would be requested while this import runs: that request fails at
// once, and so does the import, however long a cold load takes.
beforeAll(async () => {
  sheetLoad.isLoadingDropdown = true;
  try {
    ({DropdownMenu} = await import('./DropdownMenu'));
  } finally {
    sheetLoad.isLoadingDropdown = false;
  }
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

    // The sheet's modules arrive, however long a cold load takes, and React
    // renders what they let through.
    await act(async () => {
      sheetLoad.release();
      await Promise.all([
        import('./MenuBottomSheet'),
        import('./MenuBottomSheetActionList'),
      ]);
    });

    // The rows are in, and the dropdown focuses the first a frame after they
    // appear (after the sheet's own open-focus): the frame this awaits runs
    // after that one.
    await act(async () => {
      await new Promise<void>(resolve => {
        requestAnimationFrame(() => resolve());
      });
    });
    expect(screen.getByRole('button', {name: 'Edit project'})).toHaveFocus();
  });
});

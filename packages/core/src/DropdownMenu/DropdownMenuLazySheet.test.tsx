// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file DropdownMenuLazySheet.test.tsx
 * @input Uses DropdownMenu, Testing Library, and a held module load
 * @output Tests DropdownMenu while its on-demand touch sheet is still loading
 * @position Test file for DropdownMenu
 *
 * It checks that importing DropdownMenu and opening a popover menu never
 * request the sheet, and each test holds the sheet modules until it releases
 * them, so it exercises the path a real page takes while the sheet's code is
 * still downloading. The sheet modules' own code is loaded once up front, past
 * the hold, so a test's timer covers what the menu does after the release,
 * never a cold module load on a busy machine.
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
  let announce: (name: string) => void = () => {};
  // Settles the moment any sheet module is requested.
  const firstRequest = new Promise<string>(resolve => {
    announce = resolve;
  });
  const requested: string[] = [];
  return {
    gate,
    release: () => release(),
    requested,
    firstRequest,
    request(name: string) {
      requested.push(name);
      announce(name);
    },
  };
});

vi.mock('./MenuBottomSheet', async importOriginal => {
  sheetLoad.request('MenuBottomSheet');
  await sheetLoad.gate;
  return importOriginal();
});

vi.mock('./MenuBottomSheetActionList', async importOriginal => {
  sheetLoad.request('MenuBottomSheetActionList');
  await sheetLoad.gate;
  return importOriginal();
});

let DropdownMenu: typeof DropdownMenuComponent;

// If any module the dropdown loads imported the sheet eagerly, this import
// would wait on the held sheet forever: fail the moment a sheet module is
// requested instead, so the check does not depend on how long the import takes
// on a busy machine. The hook timeout is only a backstop.
beforeAll(async () => {
  const loaded = await Promise.race([
    import('./DropdownMenu').then(module => ({module})),
    sheetLoad.firstRequest.then(name => ({eager: name})),
  ]);
  if ('eager' in loaded) {
    throw new Error(
      `Importing DropdownMenu requested ${loaded.eager}: the sheet must load only when a menu shows it.`,
    );
  }
  ({DropdownMenu} = loaded.module);
  // The sheet modules' own code, loaded once and untimed. `importActual` skips
  // the mocks above, so `requested` stays empty and the hold still decides
  // when the sheet arrives; the mocks' `importOriginal` then returns these
  // modules. A cold load of the sheet's module graph takes seconds on a busy
  // machine, and inside a test it would land in the wait after the release.
  await vi.importActual('./MenuBottomSheet');
  await vi.importActual('./MenuBottomSheetActionList');
}, 120_000);

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

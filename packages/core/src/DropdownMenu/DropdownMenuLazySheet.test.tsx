// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file DropdownMenuLazySheet.test.tsx
 * @input Uses DropdownMenu, Testing Library, and a held module load
 * @output Tests DropdownMenu while its on-demand touch sheet is still loading
 * @position Test file for DropdownMenu
 *
 * It checks that importing DropdownMenu and opening a popover menu never
 * request the sheet. Each test holds the sheet modules until it releases them.
 * So it exercises the path a real page takes while the sheet's code still
 * downloads. The sheet modules' own code loads once, when the file is
 * collected, past the hold. No test waits on a timer for a module load.
 */

import {describe, it, expect, vi, beforeEach} from 'vitest';
import {render, screen, act} from '@testing-library/react';
import userEvent from '@testing-library/user-event';

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

// The file loads DropdownMenu while it is collected, and no timeout bounds
// collection. If any module the dropdown loads imported the sheet eagerly, this
// import would wait on the held sheet forever. So the file fails the moment a
// sheet module is requested.
const loaded = await Promise.race([
  import('./DropdownMenu').then(module => ({module})),
  sheetLoad.firstRequest.then(name => ({eager: name})),
]);
if ('eager' in loaded) {
  throw new Error(
    `Importing DropdownMenu requested ${loaded.eager}: the sheet must load only when a menu shows it.`,
  );
}
const {DropdownMenu} = loaded.module;
// The sheet modules' own code loads here too, once. `importActual` skips the
// mocks above, so `requested` stays empty. The hold still decides when the
// sheet arrives. The mocks' `importOriginal` then returns these modules. If one
// sheet module imported the other, that import would wait on the hold forever.
// So this load also fails the moment a sheet module is requested.
const sheetCode = await Promise.race([
  Promise.all([
    vi.importActual('./MenuBottomSheet'),
    vi.importActual('./MenuBottomSheetActionList'),
  ]).then(() => ({})),
  sheetLoad.firstRequest.then(name => ({eager: name})),
]);
if ('eager' in sheetCode) {
  throw new Error(
    `Loading the sheet's own code requested the held ${sheetCode.eager}: one sheet module imports the other.`,
  );
}

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

    // The sheet's modules arrive.
    await act(async () => {
      sheetLoad.release();
    });
    // React renders the rows when the dropdown's own loads settle. On a busy
    // machine that can be after this act, so wait for the rows themselves.
    const action = await screen.findByRole('button', {name: 'Edit project'});

    // The dropdown focuses the first row a frame after the rows appear. The
    // frame this awaits runs after that one.
    await act(async () => {
      await new Promise<void>(resolve => {
        requestAnimationFrame(() => resolve());
      });
    });
    expect(action).toHaveFocus();
  });
});

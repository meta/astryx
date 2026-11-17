// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ContextMenu.sheetLoading.test.tsx
 * @output Tests that a ContextMenu loads its touch sheet's action list only for
 *   the bottom-sheet presentation: a popover menu opens without it, and a
 *   sheet menu still opens, shows its rows, drills into a sub-menu and comes
 *   back
 * @position Validates which modules ContextMenu loads per presentation. Each
 *   test starts from a fresh module registry and counts the loads of the
 *   sheet's modules.
 */

import {describe, it, expect, vi, beforeEach} from 'vitest';
import {act, fireEvent, render, screen, waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const loads = {actionList: 0};

beforeEach(() => {
  loads.actionList = 0;
  vi.resetModules();
  vi.doMock('../DropdownMenu/MenuBottomSheetActionList', async original => {
    loads.actionList += 1;
    return original();
  });
  HTMLDialogElement.prototype.showModal = vi.fn(function (
    this: HTMLDialogElement,
  ) {
    this.setAttribute('open', '');
  });
  HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
    this.removeAttribute('open');
  });
  HTMLElement.prototype.showPopover = vi.fn(function (this: HTMLElement) {
    this.setAttribute('popover-open', '');
    const event = new Event('toggle', {bubbles: false});
    Object.defineProperty(event, 'newState', {value: 'open'});
    this.dispatchEvent(event);
  });
  HTMLElement.prototype.hidePopover = vi.fn(function (this: HTMLElement) {
    this.removeAttribute('popover-open');
    const event = new Event('toggle', {bubbles: false});
    Object.defineProperty(event, 'newState', {value: 'closed'});
    this.dispatchEvent(event);
  });
});

async function settle() {
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, 50));
  });
}

describe('ContextMenu sheet loading', () => {
  it('opens a popover menu without loading the sheet action list', async () => {
    const {ContextMenu} = await import('./ContextMenu');
    render(
      <ContextMenu
        items={[
          {label: 'Edit'},
          {label: 'Move to', items: [{label: 'Apollo launch'}]},
        ]}>
        <div>Right-click me</div>
      </ContextMenu>,
    );

    fireEvent.contextMenu(screen.getByText('Right-click me'));
    await settle();

    expect(
      screen.getByRole('menuitem', {name: 'Edit', hidden: true}),
    ).toBeTruthy();
    expect(loads.actionList).toBe(0);
  });

  it('opens a sheet menu with its rows, drills into a sub-menu and comes back with the back button', async () => {
    const user = userEvent.setup();
    const {ContextMenu} = await import('./ContextMenu');
    const onMove = vi.fn();
    render(
      <ContextMenu
        presentation="bottom-sheet"
        label="Row actions"
        items={[
          {label: 'Edit'},
          {
            label: 'Move to',
            items: [{label: 'Apollo launch', onClick: onMove}],
          },
        ]}>
        <div>Right-click me</div>
      </ContextMenu>,
    );

    fireEvent.contextMenu(screen.getByText('Right-click me'));
    await user.click(
      await screen.findByRole('button', {name: 'Move to'}, {timeout: 15000}),
    );
    const heading = screen.getByRole('heading', {name: 'Move to'});
    await waitFor(() => expect(heading).toHaveFocus());

    await user.click(await screen.findByRole('button', {name: 'Back'}));
    expect(
      await screen.findByRole('button', {name: 'Edit'}),
    ).toBeInTheDocument();
    expect(loads.actionList).toBe(1);

    await user.click(screen.getByRole('button', {name: 'Move to'}));
    await user.click(
      await screen.findByRole('button', {name: 'Apollo launch'}),
    );
    expect(onMove).toHaveBeenCalledOnce();
  });
});

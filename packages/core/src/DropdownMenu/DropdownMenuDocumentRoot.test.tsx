// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file DropdownMenuDocumentRoot.test.tsx
 * @input vitest, @testing-library/react, a DropdownMenu with a footer rendered
 *   by a React root on the document
 * @output Tab and Shift+Tab through the footer's controls in an app whose
 *   React root is the document, as a Next.js App Router app hydrates it
 * @position Own file: React attaches its root listeners to the document only
 *   for the first root in a test environment, so this root must come first.
 */

import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';
import {act, fireEvent, screen, waitFor} from '@testing-library/react';
import {createRoot, type Root} from 'react-dom/client';
import {DropdownMenu} from './DropdownMenu';
import {DropdownMenuItem} from './DropdownMenuItem';

// React's key listener and the popover focus trap's listener sit on the same
// node, the document, so stopPropagation in a React handler does not keep a
// press from the trap.
let root: Root | null = null;

beforeEach(() => {
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

afterEach(() => {
  act(() => root?.unmount());
  root = null;
});

async function openColumnsMenu() {
  root = createRoot(document);
  act(() =>
    root!.render(
      <html lang="en">
        <head />
        <body>
          <DropdownMenu
            button={{label: 'Columns'}}
            footer={
              <>
                <button type="button">Select all</button>
                <button type="button">Reset to default</button>
              </>
            }>
            <DropdownMenuItem label="Author" />
            <DropdownMenuItem label="Status" />
          </DropdownMenu>
        </body>
      </html>,
    ),
  );
  const trigger = screen.getByRole('button', {name: /Columns/});
  act(() => trigger.focus());
  fireEvent.keyDown(trigger, {key: 'ArrowDown'});
  // A keyboard open lands on the first row.
  await waitFor(() =>
    expect(
      screen.getByRole('menuitem', {name: 'Author', hidden: true}),
    ).toHaveFocus(),
  );
  const hide = vi.mocked(HTMLElement.prototype.hidePopover);
  hide.mockClear();
  return {
    hide,
    menu: screen.getByRole('menu', {name: 'Columns', hidden: true}),
    lastRow: screen.getByRole('menuitem', {name: 'Status', hidden: true}),
    selectAll: screen.getByRole('button', {name: 'Select all', hidden: true}),
    reset: screen.getByRole('button', {name: 'Reset to default', hidden: true}),
  };
}

describe('DropdownMenu footer in an app whose React root is the document', () => {
  it('Tab from the last row reaches each footer control in turn', async () => {
    const {lastRow, selectAll, reset, hide} = await openColumnsMenu();
    act(() => lastRow.focus());

    fireEvent.keyDown(lastRow, {key: 'Tab'});
    expect(selectAll).toHaveFocus();
    fireEvent.keyDown(selectAll, {key: 'Tab'});
    expect(reset).toHaveFocus();
    expect(hide).not.toHaveBeenCalled();
  });

  it('Shift+Tab from the last footer control goes back through the footer to the menu', async () => {
    const {menu, selectAll, reset, hide} = await openColumnsMenu();
    act(() => reset.focus());

    fireEvent.keyDown(reset, {key: 'Tab', shiftKey: true});
    expect(selectAll).toHaveFocus();
    fireEvent.keyDown(selectAll, {key: 'Tab', shiftKey: true});
    expect(menu).toHaveFocus();
    expect(hide).not.toHaveBeenCalled();
  });

  it('Tab past the last footer control wraps to the menu, and Shift+Tab wraps back', async () => {
    const {menu, reset, hide} = await openColumnsMenu();
    act(() => reset.focus());

    fireEvent.keyDown(reset, {key: 'Tab'});
    expect(menu).toHaveFocus();
    fireEvent.keyDown(menu, {key: 'Tab', shiftKey: true});
    expect(reset).toHaveFocus();
    expect(hide).not.toHaveBeenCalled();
  });
});

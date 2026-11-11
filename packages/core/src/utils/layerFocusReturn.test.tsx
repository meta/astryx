// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file layerFocusReturn.test.tsx
 * @input Popover, Dialog and DropdownMenu, which share restoreLayerFocus
 * @output Tests for the one focus return every layer runs as it closes
 *   (spec:AST-116 FR17–FR21)
 * @position Colocated with focusReturn.ts
 */

import {act, fireEvent, render, screen, waitFor} from '@testing-library/react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import React, {useRef, useState} from 'react';
import {Popover} from '../Popover/Popover';
import {Dialog} from '../Dialog/Dialog';
import {DropdownMenu} from '../DropdownMenu/DropdownMenu';
import {DropdownMenuItem} from '../DropdownMenu/DropdownMenuItem';
import {restoreLayerFocus, trackLayerFocus} from './focusReturn';

// jsdom has no modal dialog methods. These do what a browser's do here:
// showModal() opens the dialog and focuses its first control, close() closes
// it and fires `close`.
const dialogPrototype = HTMLDialogElement.prototype;
const nativeShowModal = dialogPrototype.showModal;
const nativeClose = dialogPrototype.close;
beforeEach(() => {
  dialogPrototype.showModal = function (this: HTMLDialogElement) {
    this.setAttribute('open', '');
    this.querySelector<HTMLElement>('button, [tabindex]')?.focus();
  };
  dialogPrototype.close = function (this: HTMLDialogElement) {
    this.removeAttribute('open');
    this.dispatchEvent(new Event('close'));
  };
});

afterEach(() => {
  dialogPrototype.showModal = nativeShowModal;
  dialogPrototype.close = nativeClose;
  vi.restoreAllMocks();
});

function escape() {
  fireEvent.keyDown(document.activeElement ?? document.body, {key: 'Escape'});
}

async function waitForFocusIn(name: string) {
  await waitFor(() =>
    expect(screen.getByRole('button', {name, hidden: true})).toHaveFocus(),
  );
}

describe('layer focus return', () => {
  it('returns focus to the anchor of a popover that code opened', async () => {
    function Tour() {
      const [isOpen, setIsOpen] = useState(false);
      const cardRef = useRef<HTMLDivElement>(null);
      return (
        <>
          <div ref={cardRef}>
            <button type="button">Card action</button>
          </div>
          <button
            type="button"
            onClick={() => setTimeout(() => setIsOpen(true))}>
            Start later
          </button>
          <Popover
            anchor={cardRef}
            isOpen={isOpen}
            onOpenChange={setIsOpen}
            label="Tour step"
            content={<button type="button">Next</button>}
          />
        </>
      );
    }
    render(<Tour />);
    fireEvent.click(screen.getByRole('button', {name: 'Start later'}));
    // Code opens it later, with focus on nothing.
    act(() => {
      (document.activeElement as HTMLElement | null)?.blur();
    });
    await waitForFocusIn('Next');
    escape();
    expect(screen.getByRole('button', {name: 'Card action'})).toHaveFocus();
  });

  it('returns focus to a trigger that remounted while the popover was open', async () => {
    function Filters() {
      const [generation, setGeneration] = useState(0);
      return (
        <Popover
          label="Filter"
          content={
            <button type="button" onClick={() => setGeneration(g => g + 1)}>
              Apply
            </button>
          }>
          <button type="button" key={generation}>
            Filter {generation}
          </button>
        </Popover>
      );
    }
    render(<Filters />);
    const first = screen.getByRole('button', {name: 'Filter 0'});
    first.focus();
    fireEvent.click(first);
    await waitForFocusIn('Apply');
    fireEvent.click(screen.getByRole('button', {name: 'Apply', hidden: true}));
    expect(first.isConnected).toBe(false);
    escape();
    expect(screen.getByRole('button', {name: 'Filter 1'})).toHaveFocus();
  });

  it('returns focus to the control that took the removed opener\u2019s place', async () => {
    function Toolbar() {
      const [isRemoved, setIsRemoved] = useState(false);
      const [isOpen, setIsOpen] = useState(false);
      const anchorRef = useRef<HTMLDivElement>(null);
      return (
        <>
          <div role="toolbar" aria-label="Columns">
            <button type="button">Name</button>
            {isRemoved ? (
              <button type="button">Owner</button>
            ) : (
              <button type="button" onClick={() => setIsOpen(true)}>
                Status
              </button>
            )}
            <button type="button">Date</button>
          </div>
          <div ref={anchorRef} />
          <Popover
            anchor={anchorRef}
            isOpen={isOpen}
            onOpenChange={setIsOpen}
            label="Column"
            content={
              <button type="button" onClick={() => setIsRemoved(true)}>
                Hide column
              </button>
            }
          />
        </>
      );
    }
    render(<Toolbar />);
    const status = screen.getByRole('button', {name: 'Status'});
    status.focus();
    fireEvent.click(status);
    await waitForFocusIn('Hide column');
    fireEvent.click(
      screen.getByRole('button', {name: 'Hide column', hidden: true}),
    );
    escape();
    expect(screen.getByRole('button', {name: 'Owner'})).toHaveFocus();
  });

  it('leaves focus that already left the popover where it is', async () => {
    render(
      <>
        <Popover
          label="Note"
          hasLightDismiss={false}
          content={<button type="button">Inside</button>}>
          <button type="button">Open note</button>
        </Popover>
        <button type="button">Elsewhere</button>
      </>,
    );
    const trigger = screen.getByRole('button', {name: 'Open note'});
    trigger.focus();
    fireEvent.click(trigger);
    await waitForFocusIn('Inside');
    const elsewhere = screen.getByRole('button', {name: 'Elsewhere'});
    elsewhere.focus();
    fireEvent.click(trigger);
    expect(elsewhere).toHaveFocus();
  });

  it('returns focus to the menu trigger when a dialog opened from a menu row closes', async () => {
    function MenuThenDialog() {
      const [isDialogOpen, setIsDialogOpen] = useState(false);
      return (
        <>
          <DropdownMenu button={{label: 'Actions'}}>
            <DropdownMenuItem
              label="Rename"
              onClick={() => setIsDialogOpen(true)}
            />
          </DropdownMenu>
          <Dialog
            isOpen={isDialogOpen}
            onOpenChange={setIsDialogOpen}
            aria-label="Rename">
            <button type="button" onClick={() => setIsDialogOpen(false)}>
              Done
            </button>
          </Dialog>
        </>
      );
    }
    render(<MenuThenDialog />);
    const trigger = screen.getByRole('button', {name: 'Actions'});
    trigger.focus();
    fireEvent.keyDown(trigger, {key: 'ArrowDown'});
    const row = await screen.findByRole('menuitem', {
      name: 'Rename',
      hidden: true,
    });
    await waitFor(() => expect(row).toHaveFocus());
    fireEvent.keyDown(row, {key: 'Enter'});
    fireEvent.click(row);
    const done = await screen.findByRole('button', {name: 'Done'});
    act(() => done.focus());
    fireEvent.click(done);
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it('returns focus through nested popovers one layer at a time', async () => {
    render(
      <Popover
        label="Outer"
        hasLightDismiss={false}
        content={
          <Popover
            label="Inner"
            hasLightDismiss={false}
            content={<button type="button">Deep</button>}>
            <button type="button">Open inner</button>
          </Popover>
        }>
        <button type="button">Open outer</button>
      </Popover>,
    );
    const outer = screen.getByRole('button', {name: 'Open outer'});
    outer.focus();
    fireEvent.click(outer);
    await waitForFocusIn('Open inner');
    fireEvent.click(
      screen.getByRole('button', {name: 'Open inner', hidden: true}),
    );
    await waitForFocusIn('Deep');
    // Escape closes the inner popover; focus returns to its trigger.
    escape();
    expect(
      screen.getByRole('button', {name: 'Open inner', hidden: true}),
    ).toHaveFocus();
    escape();
    expect(outer).toHaveFocus();
  });

  it('skips candidates that an open modal dialog makes inert', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    // jsdom has no `:modal`; this dialog reports itself modal as a browser's
    // does after showModal().
    const matches = Element.prototype.matches;
    vi.spyOn(Element.prototype, 'matches').mockImplementation(function (
      this: Element,
      selector: string,
    ) {
      return selector === ':modal'
        ? this.tagName === 'DIALOG' && this.hasAttribute('open')
        : matches.call(this, selector);
    });
    const outside = document.createElement('button');
    outside.textContent = 'Behind the dialog';
    const dialog = document.createElement('dialog');
    dialog.setAttribute('open', '');
    const layer = document.createElement('div');
    const inside = document.createElement('button');
    layer.append(inside);
    dialog.append(layer);
    document.body.append(outside, dialog);
    inside.focus();
    const record = trackLayerFocus({
      getLayer: () => layer,
      opener: null,
      getAnchor: () => outside,
    });
    restoreLayerFocus(record);
    expect(outside).not.toHaveFocus();
    outside.remove();
    dialog.remove();
    warn.mockRestore();
  });

  it('never returns focus into a closed nested dialog', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const page = document.createElement('main');
    const closed = document.createElement('dialog');
    // A display utility class beats the closed state, so it is laid out.
    closed.style.display = 'block';
    const hiddenField = document.createElement('input');
    closed.append(hiddenField);
    const layer = document.createElement('div');
    const inside = document.createElement('button');
    layer.append(inside);
    page.append(closed, layer);
    document.body.append(page);
    inside.focus();
    // The anchor resolves into the closed dialog; the chain must pass it.
    const record = trackLayerFocus({
      getLayer: () => layer,
      opener: null,
      getAnchor: () => hiddenField,
    });
    restoreLayerFocus(record);
    expect(hiddenField).not.toHaveFocus();
    page.remove();
    warn.mockRestore();
  });

  it('never leaves focus on the body: with every stand-in gone, main takes it', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    function Page() {
      const [isOpenerShown, setIsOpenerShown] = useState(true);
      const [isOpen, setIsOpen] = useState(false);
      const anchorRef = useRef<HTMLDivElement>(null);
      return (
        <main>
          <div ref={anchorRef} />
          {isOpenerShown ? (
            <section>
              <button type="button" onClick={() => setIsOpen(true)}>
                Delete
              </button>
            </section>
          ) : null}
          <Popover
            anchor={anchorRef}
            isOpen={isOpen}
            onOpenChange={setIsOpen}
            label="Confirm"
            content={
              <button type="button" onClick={() => setIsOpenerShown(false)}>
                Confirm
              </button>
            }
          />
        </main>
      );
    }
    render(<Page />);
    const opener = screen.getByRole('button', {name: 'Delete'});
    opener.focus();
    fireEvent.click(opener);
    await waitForFocusIn('Confirm');
    fireEvent.click(
      screen.getByRole('button', {name: 'Confirm', hidden: true}),
    );
    escape();
    expect(document.activeElement).toBe(screen.getByRole('main'));
    expect(document.activeElement).not.toBe(document.body);
    expect(warn).not.toHaveBeenCalledWith(
      expect.stringContaining('no element could take focus'),
    );
  });
});

// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file layerFocusReturn.test.tsx
 * @input Popover, Dialog and DropdownMenu, which share restoreLayerFocus
 * @output Tests for the focus return these three run as they close
 *   (spec:AST-116 FR17–FR21)
 * @position Colocated with focusReturn.ts
 */

import {act, fireEvent, render, screen, waitFor} from '@testing-library/react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import React, {useRef, useState} from 'react';
import {Popover} from '../Popover/Popover';
import {usePopover} from '../Popover/usePopover';
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
      const cardRef = useRef<HTMLDivElement>(null);
      const popover = usePopover({
        anchorRef: cardRef,
        dialogLabel: 'Tour step',
      });
      const {show} = popover;
      return (
        <>
          <div ref={cardRef}>
            <button type="button">Card action</button>
          </div>
          <button type="button" onClick={() => setTimeout(() => show())}>
            Start later
          </button>
          {popover.render(<button type="button">Next</button>)}
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
      const anchorRef = useRef<HTMLDivElement>(null);
      const popover = usePopover({anchorRef, dialogLabel: 'Column'});
      return (
        <>
          <div role="toolbar" aria-label="Columns">
            <button type="button">Name</button>
            {isRemoved ? (
              <button key="owner" type="button">
                Owner
              </button>
            ) : (
              <button key="status" type="button" onClick={() => popover.show()}>
                Status
              </button>
            )}
            <button type="button">Date</button>
          </div>
          <div ref={anchorRef} />
          {popover.render(
            <button type="button" onClick={() => setIsRemoved(true)}>
              Hide column
            </button>,
          )}
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
    expect(status.isConnected).toBe(false);
    expect(screen.getByRole('button', {name: 'Owner'})).toHaveFocus();
  });

  it('returns focus into a dialog shown as a popover, which never sets open', () => {
    const drawer = document.createElement('dialog');
    // A dialog shown as a popover is laid out; jsdom's closed-dialog style
    // would hide it.
    drawer.style.display = 'block';
    const opener = document.createElement('button');
    drawer.append(opener);
    const layer = document.createElement('div');
    const inside = document.createElement('button');
    layer.append(inside);
    document.body.append(drawer, layer);
    const matches = drawer.matches.bind(drawer);
    vi.spyOn(drawer, 'matches').mockImplementation(selector =>
      selector === ':popover-open' ? true : matches(selector),
    );
    // jsdom does not lay out a closed dialog; the page shows this one.
    vi.spyOn(drawer, 'getClientRects').mockReturnValue([
      {} as DOMRect,
    ] as unknown as DOMRectList);
    opener.focus();
    const record = trackLayerFocus({getLayer: () => layer});
    inside.focus();
    restoreLayerFocus(record);
    expect(opener).toHaveFocus();
    drawer.remove();
    layer.remove();
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

  it('leaves focus that is moving to another control alone when the layer closes during the move', () => {
    const opener = document.createElement('button');
    const layer = document.createElement('div');
    const inside = document.createElement('button');
    const elsewhere = document.createElement('button');
    layer.append(inside);
    document.body.append(opener, layer, elsewhere);
    try {
      opener.focus();
      const record = trackLayerFocus({getLayer: () => layer, opener});
      inside.focus();
      // A blur handler closes the layer while focus leaves it.
      inside.addEventListener('focusout', () => restoreLayerFocus(record), {
        once: true,
      });
      elsewhere.focus();
      expect(elsewhere).toHaveFocus();
      expect(record.isDone).toBe(true);
    } finally {
      opener.remove();
      layer.remove();
      elsewhere.remove();
    }
  });

  it('still returns focus that the close strands when no control takes it', () => {
    const opener = document.createElement('button');
    const layer = document.createElement('div');
    const inside = document.createElement('button');
    layer.append(inside);
    document.body.append(opener, layer);
    try {
      opener.focus();
      const record = trackLayerFocus({getLayer: () => layer, opener});
      inside.focus();
      inside.addEventListener('focusout', () => restoreLayerFocus(record), {
        once: true,
      });
      inside.blur();
      expect(opener).toHaveFocus();
    } finally {
      opener.remove();
      layer.remove();
    }
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

  it('gives a nonfocusable fallback a tab stop when the caller focuses it plainly', () => {
    const page = document.createElement('main');
    const layer = document.createElement('div');
    const inside = document.createElement('button');
    layer.append(inside);
    document.body.append(page, layer);
    inside.focus();
    const record = trackLayerFocus({
      getLayer: () => layer,
      opener: null,
      focus: element => element.focus(),
    });
    layer.remove();
    restoreLayerFocus(record, {wasStranded: true});
    expect(page).toHaveFocus();
    page.blur();
    expect(page).not.toHaveAttribute('tabindex');
    page.remove();
  });

  it('returns focus when a layer closes over an open popup that never took focus', async () => {
    function Page() {
      const [isOpenerShown, setIsOpenerShown] = useState(true);
      const anchorRef = useRef<HTMLDivElement>(null);
      const assign = usePopover({
        anchorRef,
        dialogLabel: 'Assign',
        hasLightDismiss: false,
      });
      // A result list, as a typeahead's: it opens from the field and takes
      // no focus.
      const results = usePopover({
        role: 'none',
        hasAutoFocus: false,
        hasLightDismiss: false,
      });
      return (
        <main>
          <div ref={anchorRef} />
          {isOpenerShown ? (
            <section>
              <button type="button" onClick={() => assign.show()}>
                Assign
              </button>
            </section>
          ) : null}
          {assign.render(
            <>
              <button
                type="button"
                ref={results.triggerRef}
                onClick={() => {
                  setIsOpenerShown(false);
                  results.show();
                }}>
                Find owner
              </button>
              <button type="button" onClick={() => assign.hide()}>
                Done
              </button>
              {results.render(<span>No results</span>)}
            </>,
          )}
          <span data-testid="results">
            {results.isOpen ? 'open' : 'closed'}
          </span>
        </main>
      );
    }
    render(<Page />);
    const opener = screen.getByRole('button', {name: 'Assign'});
    opener.focus();
    fireEvent.click(opener);
    await waitForFocusIn('Find owner');
    fireEvent.click(
      screen.getByRole('button', {name: 'Find owner', hidden: true}),
    );
    expect(screen.getByTestId('results')).toHaveTextContent('open');
    const done = screen.getByRole('button', {name: 'Done', hidden: true});
    act(() => done.focus());
    fireEvent.click(done);
    // The opener is gone and the open list never held focus: the closing
    // layer returns focus itself, to the nearest place that remains.
    expect(document.activeElement).toBe(screen.getByRole('main'));
  });

  it('returns focus when a layer closes over an open popup that focus has left', async () => {
    function Nested() {
      const [isOuterOpen, setIsOuterOpen] = useState(false);
      return (
        <Popover
          label="Outer"
          hasLightDismiss={false}
          isOpen={isOuterOpen}
          onOpenChange={setIsOuterOpen}
          content={
            <>
              <Popover
                label="Inner"
                hasLightDismiss={false}
                content={<button type="button">Deep</button>}>
                <button type="button">Open inner</button>
              </Popover>
              <button type="button" onClick={() => setIsOuterOpen(false)}>
                Close outer
              </button>
            </>
          }>
          <button type="button">Open outer</button>
        </Popover>
      );
    }
    render(<Nested />);
    const outer = screen.getByRole('button', {name: 'Open outer'});
    outer.focus();
    fireEvent.click(outer);
    await waitForFocusIn('Open inner');
    fireEvent.click(
      screen.getByRole('button', {name: 'Open inner', hidden: true}),
    );
    await waitForFocusIn('Deep');
    // Focus leaves the inner popover, which stays open.
    const closeOuter = screen.getByRole('button', {
      name: 'Close outer',
      hidden: true,
    });
    act(() => closeOuter.focus());
    fireEvent.click(closeOuter);
    await waitFor(() => expect(outer).toHaveFocus());
  });

  it('hands its return to a child that is opening and still to take focus', () => {
    const page = document.createElement('main');
    const trigger = document.createElement('button');
    const parentLayer = document.createElement('div');
    const row = document.createElement('button');
    parentLayer.append(row);
    const childLayer = document.createElement('div');
    const field = document.createElement('button');
    childLayer.append(field);
    page.append(trigger, parentLayer, childLayer);
    document.body.append(page);
    trigger.focus();
    const parent = trackLayerFocus({getLayer: () => parentLayer});
    row.focus();
    // The child opens from the row; its opening moves focus in afterwards.
    const child = trackLayerFocus({
      getLayer: () => childLayer,
      isFocusMovedInOnOpen: true,
    });
    // The parent closes first and moves no focus.
    expect(restoreLayerFocus(parent)).toBe(false);
    expect(row).toHaveFocus();
    parentLayer.remove();
    field.focus();
    // The child's chain continues with the parent's opener.
    restoreLayerFocus(child);
    expect(trigger).toHaveFocus();
    page.remove();
  });

  it('returns focus to the trigger of a controlled menu whose row opens a dialog in the same commit', async () => {
    function MenuThenDialog() {
      const [isMenuOpen, setIsMenuOpen] = useState(false);
      const [isDialogOpen, setIsDialogOpen] = useState(false);
      return (
        <>
          <DropdownMenu
            button={{label: 'Actions'}}
            isMenuOpen={isMenuOpen}
            onOpenChange={setIsMenuOpen}>
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
    await waitFor(() => expect(done).toHaveFocus());
    fireEvent.click(done);
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it('leaves focus where the hide notification put it', async () => {
    function Test() {
      const resultsRef = useRef<HTMLButtonElement>(null);
      return (
        <>
          <Popover
            label="Filters"
            hasLightDismiss={false}
            onOpenChange={isOpen => {
              if (!isOpen) {
                resultsRef.current?.focus();
              }
            }}
            content={<button type="button">Apply</button>}>
            <button type="button">Open filters</button>
          </Popover>
          <button type="button" ref={resultsRef}>
            Results
          </button>
        </>
      );
    }
    render(<Test />);
    const trigger = screen.getByRole('button', {name: 'Open filters'});
    trigger.focus();
    fireEvent.click(trigger);
    await waitForFocusIn('Apply');
    escape();
    await waitFor(() =>
      expect(screen.getByRole('button', {name: 'Results'})).toHaveFocus(),
    );
  });

  it('returns focus with a plain focus, which scrolls the trigger into view', async () => {
    render(
      <Popover
        label="Note"
        hasLightDismiss={false}
        content={<button type="button">Inside</button>}>
        <button type="button">Open note</button>
      </Popover>,
    );
    const trigger = screen.getByRole('button', {name: 'Open note'});
    trigger.focus();
    fireEvent.click(trigger);
    await waitForFocusIn('Inside');
    const focus = vi.spyOn(trigger, 'focus');
    escape();
    await waitFor(() => expect(trigger).toHaveFocus());
    expect(focus).toHaveBeenCalled();
    for (const [options] of focus.mock.calls) {
      expect(options?.preventScroll ?? false).toBe(false);
    }
  });

  it('returns focus to an anchor that takes focus from script', () => {
    const anchor = document.createElement('div');
    anchor.tabIndex = -1;
    const control = document.createElement('button');
    anchor.append(control);
    const layer = document.createElement('div');
    const inside = document.createElement('button');
    layer.append(inside);
    document.body.append(anchor, layer);
    inside.focus();
    const record = trackLayerFocus({
      getLayer: () => layer,
      opener: null,
      getAnchor: () => anchor,
    });
    restoreLayerFocus(record);
    // The anchor itself, not the first control inside it.
    expect(anchor).toHaveFocus();
    anchor.remove();
    layer.remove();
  });

  it('warns and names the layer when no candidate can take focus', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const layer = document.createElement('div');
    const inside = document.createElement('button');
    layer.append(inside);
    document.body.append(layer);
    inside.focus();
    const record = trackLayerFocus({
      getLayer: () => layer,
      opener: null,
      layerId: 'filters-popover',
    });
    expect(restoreLayerFocus(record)).toBe(false);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('layer "filters-popover"'),
    );
    layer.remove();
  });

  it('never leaves focus on the body: with every stand-in gone, main takes it', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    function Page() {
      const [isOpenerShown, setIsOpenerShown] = useState(true);
      const anchorRef = useRef<HTMLDivElement>(null);
      const popover = usePopover({anchorRef, dialogLabel: 'Confirm'});
      return (
        <main>
          <div ref={anchorRef} />
          {isOpenerShown ? (
            <section>
              <button type="button" onClick={() => popover.show()}>
                Delete
              </button>
            </section>
          ) : null}
          {popover.render(
            <button type="button" onClick={() => setIsOpenerShown(false)}>
              Confirm
            </button>,
          )}
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
    // A stand-in container takes focus without a scroll.
    const focusMain = vi.spyOn(screen.getByRole('main'), 'focus');
    escape();
    expect(document.activeElement).toBe(screen.getByRole('main'));
    expect(document.activeElement).not.toBe(document.body);
    expect(focusMain).toHaveBeenCalledWith({preventScroll: true});
    expect(warn).not.toHaveBeenCalledWith(
      expect.stringContaining('no element could take focus'),
    );
  });
});

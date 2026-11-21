// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file PopoverAnnounce.test.tsx
 * @input usePopover opened from code and from its trigger, and the shared live
 *   regions
 * @output Tests that a dialog popover opened from code announces its name
 * @position Colocated with usePopover.tsx. PopoverAnnounceCount.test.tsx
 *   counts the updates per open
 */

import {act, fireEvent, render, screen, waitFor} from '@testing-library/react';
import {afterEach, describe, expect, it, vi} from 'vitest';
import React, {useEffect} from 'react';
import {usePopover} from './usePopover';
import {Dialog} from '../Dialog/Dialog';
import {__resetLiveRegionsForTest} from '../hooks/useAnnounce';

afterEach(() => {
  __resetLiveRegionsForTest();
  vi.restoreAllMocks();
});

// jsdom has no modal dialogs: showModal opens the dialog and marks it, and
// `:modal` reads the mark.
function stubModalDialogs() {
  HTMLDialogElement.prototype.showModal = vi.fn(function (
    this: HTMLDialogElement,
  ) {
    this.setAttribute('open', '');
    this.dataset.modal = 'true';
  });
  HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
    this.removeAttribute('open');
    delete this.dataset.modal;
    this.dispatchEvent(new Event('close'));
  });
  const matches = Element.prototype.matches;
  vi.spyOn(Element.prototype, 'matches').mockImplementation(function (
    this: Element,
    selector: string,
  ) {
    return selector === ':modal'
      ? this instanceof HTMLDialogElement &&
          this.open &&
          this.dataset.modal === 'true'
      : matches.call(this, selector);
  });
}

function politeText(): string {
  return (
    document.querySelector('[data-astryx-live-region="polite"]')?.textContent ??
    ''
  );
}

function CodeOpened({
  role,
  hasAutoFocus = false,
}: {
  role?: 'dialog' | 'none';
  hasAutoFocus?: boolean;
}) {
  const popover = usePopover({
    dialogLabel: 'Tip: filters live here',
    role,
    hasAutoFocus,
    hasLightDismiss: false,
  });
  const {show} = popover;
  useEffect(() => {
    show();
  }, [show]);
  return (
    <>
      <button type="button" ref={popover.triggerRef}>
        Filters
      </button>
      {popover.render(<button type="button">Got it</button>)}
    </>
  );
}

function TriggerOpened() {
  const popover = usePopover({
    dialogLabel: 'Tip: filters live here',
    hasAutoFocus: false,
    hasLightDismiss: false,
  });
  return (
    <>
      <button
        type="button"
        ref={popover.triggerRef}
        {...popover.triggerProps}
        onClick={() => popover.toggle()}>
        Filters
      </button>
      {popover.render(<button type="button">Got it</button>)}
    </>
  );
}

describe('usePopover announcement for a popover opened from code (AR4)', () => {
  it('announces the name of a dialog popover opened from code', async () => {
    render(<CodeOpened />);
    await waitFor(() => {
      expect(politeText()).toContain('Tip: filters live here');
    });
  });

  it('does not announce a popover that takes focus as it opens', async () => {
    render(<CodeOpened hasAutoFocus />);
    await waitFor(() => {
      expect(
        screen.getByRole('button', {name: 'Got it', hidden: true}),
      ).toHaveFocus();
    });
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 50));
    });
    expect(politeText()).not.toContain('Tip: filters live here');
  });

  it('does not announce a popover opened by a press on its trigger', async () => {
    render(<TriggerOpened />);
    const trigger = screen.getByRole('button', {name: 'Filters'});
    fireEvent.pointerDown(trigger);
    fireEvent.click(trigger);
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 50));
    });
    expect(politeText()).not.toContain('Tip: filters live here');
  });

  it('does not announce a popover opened by a key on its trigger', async () => {
    function KeyOpened() {
      const popover = usePopover({
        dialogLabel: 'Tip: filters live here',
        hasAutoFocus: false,
        hasLightDismiss: false,
      });
      return (
        <>
          <button
            type="button"
            ref={popover.triggerRef}
            {...popover.triggerProps}
            onKeyDown={event => {
              if (event.key === 'ArrowDown') {
                popover.show();
              }
            }}>
            Filters
          </button>
          {popover.render(<button type="button">Got it</button>)}
        </>
      );
    }
    render(<KeyOpened />);
    const trigger = screen.getByRole('button', {name: 'Filters'});
    fireEvent.keyDown(trigger, {key: 'ArrowDown'});
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 50));
    });
    expect(politeText()).not.toContain('Tip: filters live here');
  });

  it('does not announce a popover that opens while the pointer is on its trigger', async () => {
    function HoverOpened() {
      const popover = usePopover({
        dialogLabel: 'Tip: filters live here',
        hasAutoFocus: false,
        hasLightDismiss: false,
      });
      return (
        <>
          <button
            type="button"
            ref={popover.triggerRef}
            {...popover.triggerProps}
            onMouseEnter={() => popover.show({skipAutoFocus: true})}>
            Filters
          </button>
          {popover.render(<button type="button">Got it</button>)}
        </>
      );
    }
    render(<HoverOpened />);
    const trigger = screen.getByRole('button', {name: 'Filters'});
    // jsdom tracks no hover state, so give the trigger the browser's answer.
    const nativeMatches = trigger.matches.bind(trigger);
    vi.spyOn(trigger, 'matches').mockImplementation((selector: string) =>
      selector === ':hover' ? true : nativeMatches(selector),
    );
    fireEvent.mouseEnter(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 50));
    });
    expect(politeText()).not.toContain('Tip: filters live here');
  });

  it('announces inside the modal Dialog that holds it, not in the page region the Dialog hides', async () => {
    stubModalDialogs();
    const {unmount} = render(
      <Dialog isOpen onOpenChange={() => {}} aria-label="Edit">
        <CodeOpened />
      </Dialog>,
    );
    const dialog = screen.getByRole('dialog', {name: 'Edit'});
    await waitFor(() => {
      expect(
        dialog.querySelector(
          ':scope > [data-astryx-modal-live-region="polite"]',
        ),
      ).toHaveTextContent('Tip: filters live here');
    });
    expect(politeText()).toBe('');
    // A Dialog that unmounts hands its words to the page region a moment
    // later; wait for that here so the reset after this test clears them.
    unmount();
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 50));
    });
  });

  it('does not announce a role-neutral popup', async () => {
    render(<CodeOpened role="none" />);
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 50));
    });
    expect(politeText()).not.toContain('Tip: filters live here');
  });
});

// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file layerDismissalInvariants.test.tsx
 * @input Uses vitest, @testing-library/react, BottomSheet, Dialog, Lightbox
 * @output Tests the one invariant the shared stack exists to hold
 * @position Colocated with layerStack. `useLayerDismissal.test.tsx` covers the
 *   hook's mechanics against synthetic layers; this file asks the user's
 *   question of real overlays — after one Escape, what is still on screen?
 *
 * Every assertion here reads the DOM (`which dialogs are open`) rather than a
 * dismiss spy. A spy passes when the stack routes to the wrong layer as long as
 * something was called; the open-dialog census cannot.
 *
 * jsdom models neither the close watcher nor IME composition, so the rows that
 * depend on a real engine are driven through the same channels the browser
 * would use — a `cancel` event, a keydown carrying `isComposing` — and the
 * end-to-end behavior is measured in Chromium instead (probe-kit).
 *
 * SYNC: When a new overlay family joins the stack, add it here.
 */

import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';
import {render, screen, act, fireEvent} from '@testing-library/react';
import {useState} from 'react';

import {BottomSheet} from '../BottomSheet/BottomSheet';
import {Dialog} from '../Dialog/Dialog';
import {Lightbox} from '../Lightbox/Lightbox';
import {resetLayerStackForTests} from './layerStack';
import {useLayerDismissal} from './useLayerDismissal';

// jsdom implements neither, and Dialog drives both.
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

afterEach(() => {
  resetLayerStackForTests();
});

/**
 * Everything on screen right now, named the way a person would name it and
 * sorted so the census is about WHICH layers are up, not what order two role
 * queries happened to return them in.
 */
function onScreen(): string[] {
  // `purpose="required"` renders role="alertdialog", so both roles have to be
  // asked for or a required Dialog is invisible to the census.
  return [
    ...screen.queryAllByRole('dialog', {hidden: true}),
    ...screen.queryAllByRole('alertdialog', {hidden: true}),
  ]
    .filter(d => (d as HTMLDialogElement).open)
    .map(d => d.getAttribute('aria-label') ?? '(unnamed)')
    .sort();
}

function pressEscape(options: KeyboardEventInit = {}): KeyboardEvent {
  const event = new KeyboardEvent('keydown', {
    key: 'Escape',
    bubbles: true,
    cancelable: true,
    ...options,
  });
  act(() => {
    document.dispatchEvent(event);
  });
  return event;
}

function composingEscape(): KeyboardEvent {
  const event = new KeyboardEvent('keydown', {
    key: 'Escape',
    bubbles: true,
    cancelable: true,
  });
  Object.defineProperty(event, 'isComposing', {value: true});
  act(() => {
    document.dispatchEvent(event);
  });
  return event;
}

function fireCancel(label: string): Event {
  const event = new Event('cancel', {bubbles: false, cancelable: true});
  const dialog = [
    ...screen.queryAllByRole('dialog', {hidden: true}),
    ...screen.queryAllByRole('alertdialog', {hidden: true}),
  ].find(d => d.getAttribute('aria-label') === label)!;
  act(() => {
    dialog.dispatchEvent(event);
  });
  return event;
}

/** A modal whose own open state is real, so the DOM changes when it closes. */
function Modal({
  label,
  purpose,
  isOpenInitially = true,
  children,
}: {
  label: string;
  purpose?: 'required';
  isOpenInitially?: boolean;
  children?: React.ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(isOpenInitially);
  return (
    <Dialog
      isOpen={isOpen}
      onOpenChange={setIsOpen}
      purpose={purpose}
      aria-label={label}>
      {label}
      {children}
    </Dialog>
  );
}

describe('one Escape dismisses exactly one layer', () => {
  it('peels a modal-in-modal one press at a time', () => {
    render(
      <Modal label="Outer">
        <Modal label="Inner" />
      </Modal>,
    );
    expect(onScreen()).toEqual(['Inner', 'Outer']);

    pressEscape();
    expect(onScreen()).toEqual(['Outer']);

    pressEscape();
    expect(onScreen()).toEqual([]);
  });

  it('peels three layers in order, never two on one press', () => {
    render(
      <Modal label="Outer">
        <Modal label="Middle">
          <Modal label="Inner" />
        </Modal>
      </Modal>,
    );
    expect(onScreen()).toEqual(['Inner', 'Middle', 'Outer']);

    pressEscape();
    expect(onScreen()).toEqual(['Middle', 'Outer']);

    pressEscape();
    expect(onScreen()).toEqual(['Outer']);

    pressEscape();
    expect(onScreen()).toEqual([]);
  });

  it('lets a Lightbox over a required Dialog take the press, and only it', () => {
    function LightboxInRequired() {
      const [isLightboxOpen, setIsLightboxOpen] = useState(true);
      return (
        <Modal label="Required" purpose="required">
          <Lightbox
            isOpen={isLightboxOpen}
            onOpenChange={setIsLightboxOpen}
            media={{src: '/photo.jpg', alt: 'A photo'}}
          />
        </Modal>
      );
    }
    render(<LightboxInRequired />);
    expect(onScreen()).toEqual(['A photo', 'Required']);

    pressEscape();
    expect(onScreen()).toEqual(['Required']);
  });

  it('reaches the layer below once the one above is closed another way', () => {
    // Closing the inner modal with its own control must leave the stack clean,
    // so the next Escape finds the outer rather than falling into a gap.
    function OuterAndInner() {
      const [isInnerOpen, setIsInnerOpen] = useState(true);
      return (
        <Modal label="Outer">
          <button type="button" onClick={() => setIsInnerOpen(false)}>
            close inner
          </button>
          {isInnerOpen ? <Modal label="Inner" /> : null}
        </Modal>
      );
    }
    render(<OuterAndInner />);
    expect(onScreen()).toEqual(['Inner', 'Outer']);

    act(() => {
      screen.getByText('close inner').click();
    });
    expect(onScreen()).toEqual(['Outer']);

    pressEscape();
    expect(onScreen()).toEqual([]);
  });
});

describe("escapeBehavior: 'block'", () => {
  it('swallows the press so nothing behind a required Dialog dismisses either', () => {
    render(
      <Modal label="Host">
        <Modal label="Required" purpose="required" />
      </Modal>,
    );

    const event = pressEscape();

    expect(onScreen()).toEqual(['Host', 'Required']);
    // Claimed, not merely ignored — an unclaimed press is what lets the
    // browser's own close watcher dismiss something behind our back.
    expect(event.defaultPrevented).toBe(true);
  });

  it('does not block a layer opened ON TOP of the required Dialog', () => {
    render(
      <Modal label="Required" purpose="required">
        <Modal label="Above" />
      </Modal>,
    );

    pressEscape();
    expect(onScreen()).toEqual(['Required']);
  });
});

describe('re-registration does not reorder the stack', () => {
  it('keeps a Dialog whose purpose flips below the layer opened over it', () => {
    // A Dialog re-registers when `purpose` changes, because that changes its
    // escapeBehavior. Re-registering must not promote it above a layer that
    // opened on top of it — otherwise a flip to `required` silently starts
    // swallowing presses meant for the layer above.
    function FlippingHost() {
      const [purpose, setPurpose] = useState<'required' | undefined>(undefined);
      return (
        <>
          <Modal label="Host" purpose={purpose} />
          <Modal label="Later" />
          <button type="button" onClick={() => setPurpose('required')}>
            make required
          </button>
        </>
      );
    }
    render(<FlippingHost />);
    expect(onScreen()).toEqual(['Host', 'Later']);

    act(() => {
      screen.getByText('make required').click();
    });

    pressEscape();
    expect(onScreen()).toEqual(['Host']);
  });
});

describe('close requests the browser starts itself', () => {
  it('follows the same top-most rule as a press', () => {
    render(
      <Modal label="Outer">
        <Modal label="Inner" />
      </Modal>,
    );

    // The Android back gesture on the layer that is NOT on top.
    const outerRequest = fireCancel('Outer');
    expect(outerRequest.defaultPrevented).toBe(true);
    expect(onScreen()).toEqual(['Inner', 'Outer']);

    fireCancel('Inner');
    expect(onScreen()).toEqual(['Outer']);
  });

  it('is declined while an IME composition is running', () => {
    render(
      <Modal label="Composing">
        <input aria-label="field" />
      </Modal>,
    );
    const field = screen.getByLabelText('field');

    act(() => {
      field.dispatchEvent(
        new CompositionEvent('compositionstart', {bubbles: true}),
      );
    });
    fireCancel('Composing');
    expect(onScreen()).toEqual(['Composing']);

    act(() => {
      field.dispatchEvent(
        new CompositionEvent('compositionend', {bubbles: true}),
      );
    });
    fireCancel('Composing');
    expect(onScreen()).toEqual([]);
  });
});

describe('an Escape that cancels an IME composition', () => {
  it('dismisses nothing AND claims the press, so no close request follows', () => {
    render(<Modal label="Composing" />);

    const event = composingEscape();

    expect(onScreen()).toEqual(['Composing']);
    // The half that matters. Standing down without claiming leaves the browser
    // free to raise its own close request, which arrives at `cancel` with no
    // composition state to read and closes the dialog on the same keypress.
    expect(event.defaultPrevented).toBe(true);
  });

  it('leaves the press alone when there is no layer to protect', () => {
    render(<Modal label="Closed" isOpenInitially={false} />);

    const event = composingEscape();

    expect(event.defaultPrevented).toBe(false);
  });
});

describe('registration and teardown', () => {
  it('drops a layer from the stack when it unmounts', () => {
    function Pair({hasTop}: {hasTop: boolean}) {
      return (
        <Modal label="Bottom">{hasTop ? <Modal label="Top" /> : null}</Modal>
      );
    }
    const {rerender} = render(<Pair hasTop={true} />);
    rerender(<Pair hasTop={false} />);

    pressEscape();
    expect(onScreen()).toEqual([]);
  });

  it('stops claiming Escape once the last layer is gone', () => {
    // The listener is shared and lives on `document`. If unmounting left an
    // entry behind, the page would keep losing Escape presses to a layer that
    // is not there — no error, no visual tell.
    const {unmount} = render(<Modal label="Only" />);
    expect(pressEscape().defaultPrevented).toBe(true);

    unmount();

    expect(pressEscape().defaultPrevented).toBe(false);
  });
});

describe('presence is asked at press time', () => {
  it('skips a registered layer that is no longer on screen', () => {
    // Hover layers register for their whole lifetime and answer presence from
    // the DOM. A cached answer would let an idle tooltip eat a press meant for
    // the dialog underneath it.
    const isTipShowing = false;
    const tipDismissed = vi.fn();

    function TipLayer() {
      useLayerDismissal({
        isActive: true,
        isPresent: () => isTipShowing,
        onDismiss: tipDismissed,
      });
      return null;
    }

    render(
      <Modal label="Host">
        <TipLayer />
      </Modal>,
    );

    // Idle: the press must reach the dialog.
    pressEscape();
    expect(tipDismissed).not.toHaveBeenCalled();
    expect(onScreen()).toEqual([]);
  });

  it('lets the same registration claim the press once it is showing', () => {
    let isTipShowing = true;
    const tipDismissed = vi.fn();

    function TipLayer() {
      useLayerDismissal({
        isActive: true,
        isPresent: () => isTipShowing,
        onDismiss: tipDismissed,
      });
      return null;
    }

    render(
      <Modal label="Host">
        <TipLayer />
      </Modal>,
    );

    pressEscape();
    expect(tipDismissed).toHaveBeenCalledTimes(1);
    expect(onScreen()).toEqual(['Host']);

    isTipShowing = false;
    pressEscape();
    expect(onScreen()).toEqual([]);
  });
});

describe('a standalone BottomSheet is one more layer', () => {
  function Sheet({children}: {children?: React.ReactNode}) {
    const [isOpen, setIsOpen] = useState(true);
    return (
      <BottomSheet
        isOpen={isOpen}
        onOpenChange={setIsOpen}
        hasScrim={false}
        label="Sheet">
        {children}
      </BottomSheet>
    );
  }

  // The sheet keeps its <dialog> open through the exit animation; jsdom never
  // runs it, so end it the way the panel's transition would.
  function finishSheetExit() {
    fireEvent.transitionEnd(document.querySelector('.astryx-bottom-sheet')!, {
      propertyName: 'transform',
    });
  }

  beforeEach(() => {
    // A non-modal sheet is a manual popover in the top layer (show() below
    // the Popover API floor); jsdom's stand-ins keep the `open` marker the
    // census reads.
    HTMLDialogElement.prototype.show = vi.fn(function (
      this: HTMLDialogElement,
    ) {
      this.setAttribute('open', '');
    });
    HTMLElement.prototype.showPopover = vi.fn(function (this: HTMLElement) {
      this.setAttribute('open', '');
    });
    HTMLElement.prototype.hidePopover = vi.fn(function (this: HTMLElement) {
      this.removeAttribute('open');
    });
  });

  it('peels a Dialog opened inside the sheet before the sheet', () => {
    render(
      <Sheet>
        <Modal label="Inner" />
      </Sheet>,
    );

    pressEscape();
    expect(onScreen()).toEqual(['Sheet']);

    pressEscape();
    finishSheetExit();
    expect(onScreen()).toEqual([]);
  });

  it('declines a close request while an IME composition is running', () => {
    render(
      <Sheet>
        <input aria-label="field" />
      </Sheet>,
    );
    const field = screen.getByLabelText('field');

    act(() => {
      field.dispatchEvent(
        new CompositionEvent('compositionstart', {bubbles: true}),
      );
    });
    const composingRequest = fireCancel('Sheet');
    expect(composingRequest.defaultPrevented).toBe(true);
    finishSheetExit();
    expect(onScreen()).toEqual(['Sheet']);

    act(() => {
      field.dispatchEvent(
        new CompositionEvent('compositionend', {bubbles: true}),
      );
    });
    fireCancel('Sheet');
    finishSheetExit();
    expect(onScreen()).toEqual([]);
  });
});

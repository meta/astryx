// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ToastViewport.modalHost.test.tsx
 * @input Uses vitest, @testing-library/react, ToastViewport, useToast, Dialog,
 *   BottomSheet
 * @output Tests that a top-layer ToastViewport moves into the latest open
 *   native modal (a Dialog or a scrim BottomSheet, the top sheet of a stack)
 *   and back without remounting its toasts, and re-enters the top layer above
 *   a non-modal sheet shown after it
 * @position Testing; validates ToastViewport.tsx with Layer/modalOutlet.ts
 *
 * SYNC: When ToastViewport hosting or Layer/modalOutlet.ts changes, update
 *   these tests. jsdom has no top layer: paint order and hit testing above the
 *   modal need a real browser (see the Core/Toast AppToastOverDialog story and
 *   BottomSheet/__tests__/BottomSheetToastOutlet.a11y.chromium.spec.ts).
 */

import {useState, type ReactNode} from 'react';
import {describe, it, expect, vi, afterEach, beforeEach} from 'vitest';
import {act, fireEvent, render, screen} from '@testing-library/react';
import {ToastViewport} from './ToastViewport';
import {useToast} from './useToast';
import {BottomSheet, BottomSheetSwitcher} from '../BottomSheet';
import {Dialog} from '../Dialog';
import {getActiveModalOutlet} from '../Layer/modalOutlet';
import type {ToastDismissReason} from './types';

// jsdom does not implement the native dialog methods.
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = vi.fn(function (
    this: HTMLDialogElement,
  ) {
    this.setAttribute('open', '');
  });
  HTMLDialogElement.prototype.show = vi.fn(function (this: HTMLDialogElement) {
    this.setAttribute('open', '');
  });
  HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
    this.removeAttribute('open');
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

function ToastButton({label = 'Show toast'}: {label?: string}) {
  const toast = useToast();
  return (
    <button type="button" onClick={() => toast({body: 'Saved'})}>
      {label}
    </button>
  );
}

function DialogFixture({
  label,
  children,
}: {
  label: string;
  children?: ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setIsOpen(open => !open)}>
        {`Toggle ${label}`}
      </button>
      <Dialog isOpen={isOpen} onOpenChange={setIsOpen} aria-label={label}>
        <button type="button" onClick={() => setIsOpen(false)}>
          {`Close ${label}`}
        </button>
        {children}
      </Dialog>
    </>
  );
}

function NonModalSheetFixture({label}: {label: string}) {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setIsOpen(open => !open)}>
        {`Toggle ${label}`}
      </button>
      <BottomSheet
        isOpen={isOpen}
        onOpenChange={setIsOpen}
        hasScrim={false}
        label={label}>
        <ToastButton label={`Show toast in ${label}`} />
      </BottomSheet>
    </>
  );
}

function getDialog(label: string): HTMLDialogElement {
  return document.querySelector<HTMLDialogElement>(
    `dialog[aria-label="${label}"]`,
  )!;
}

function getViewport(): HTMLElement {
  // A non-modal BottomSheet is a manual popover too; the viewport is the one
  // that is not a dialog.
  return document.querySelector<HTMLElement>('[popover="manual"]:not(dialog)')!;
}

/** Call order of `fn`'s latest call on `context`, or -1 if it has none. */
function lastCallOrder(
  fn: {mock: {contexts: unknown[]; invocationCallOrder: number[]}},
  context: unknown,
): number {
  return Math.max(
    -1,
    ...fn.mock.invocationCallOrder.filter(
      (_, index) => fn.mock.contexts[index] === context,
    ),
  );
}

function TimedToastButton({
  onHide,
}: {
  onHide: (reason: ToastDismissReason) => void;
}) {
  const toast = useToast();
  return (
    <button
      type="button"
      onClick={() => toast({body: 'Saved', autoHideDuration: 5000, onHide})}>
      Show timed toast
    </button>
  );
}

function UnmountFixture() {
  const [isMounted, setIsMounted] = useState(true);
  return (
    <>
      <button type="button" onClick={() => setIsMounted(false)}>
        Unmount
      </button>
      {isMounted ? (
        <Dialog isOpen onOpenChange={() => {}} aria-label="Edit">
          <ToastButton />
        </Dialog>
      ) : null}
    </>
  );
}

function SheetFixture({label, hasScrim}: {label: string; hasScrim?: boolean}) {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setIsOpen(true)}>
        {`Open ${label}`}
      </button>
      <BottomSheet
        isOpen={isOpen}
        onOpenChange={setIsOpen}
        label={label}
        hasScrim={hasScrim}>
        <button type="button" onClick={() => setIsOpen(false)}>
          {`Close ${label}`}
        </button>
      </BottomSheet>
    </>
  );
}

/**
 * jsdom's popover stand-ins are stateless: track which elements are shown so
 * `:popover-open` answers as a browser would.
 */
function trackPopoverState() {
  const showing = new WeakSet<Element>();
  const showPopover = vi
    .spyOn(HTMLElement.prototype, 'showPopover')
    .mockImplementation(function (this: HTMLElement) {
      showing.add(this);
    });
  const hidePopover = vi
    .spyOn(HTMLElement.prototype, 'hidePopover')
    .mockImplementation(function (this: HTMLElement) {
      showing.delete(this);
    });
  const matches = Element.prototype.matches;
  vi.spyOn(Element.prototype, 'matches').mockImplementation(function (
    this: Element,
    selector: string,
  ) {
    if (selector === ':popover-open') {
      return showing.has(this);
    }
    return matches.call(this, selector);
  });
  return {showPopover, hidePopover};
}

describe('ToastViewport modal hosting', () => {
  it('moves into an open Dialog and back when it closes, keeping the toast', () => {
    const {container} = render(
      <ToastViewport>
        <ToastButton />
        <DialogFixture label="Edit" />
      </ToastViewport>,
    );

    fireEvent.click(screen.getByRole('button', {name: 'Show toast'}));
    const toast = screen.getByText('Saved');
    expect(container.contains(getViewport())).toBe(true);

    fireEvent.click(screen.getByRole('button', {name: 'Toggle Edit'}));
    expect(getDialog('Edit').contains(getViewport())).toBe(true);
    // Same node: the rows were moved, not remounted, so their auto-hide
    // timers and gesture state carry on.
    expect(screen.getByText('Saved')).toBe(toast);

    fireEvent.click(screen.getByRole('button', {name: 'Close Edit'}));
    expect(getDialog('Edit').contains(getViewport())).toBe(false);
    expect(container.contains(getViewport())).toBe(true);
    expect(screen.getByText('Saved')).toBe(toast);
  });

  it('shows the viewport popover again after each move', () => {
    const showPopover = vi.spyOn(HTMLElement.prototype, 'showPopover');
    render(
      <ToastViewport>
        <DialogFixture label="Edit" />
      </ToastViewport>,
    );
    const viewport = getViewport();
    const showsOnViewport = () =>
      showPopover.mock.contexts.filter(context => context === viewport).length;
    expect(showsOnViewport()).toBe(1);

    fireEvent.click(screen.getByRole('button', {name: 'Toggle Edit'}));
    expect(showsOnViewport()).toBe(2);

    fireEvent.click(screen.getByRole('button', {name: 'Close Edit'}));
    expect(showsOnViewport()).toBe(3);
  });

  /**
   * jsdom's Popover stand-ins keep no state and `:popover-open` never
   * matches; these keep a showing set so the viewport can tell it is already
   * in the top layer, as a browser does.
   */
  it('re-enters the top layer in place when a non-modal sheet is shown after it', () => {
    // A `hasScrim={false}` sheet is a manual popover: it enters the top
    // layer above the viewport and blocks nothing, so the viewport stays
    // where it is and leaves and re-enters to paint above the sheet again.
    const {showPopover, hidePopover} = trackPopoverState();
    render(
      <ToastViewport>
        <ToastButton />
        <NonModalSheetFixture label="Filters" />
      </ToastViewport>,
    );
    const viewport = getViewport();
    const onViewport = (spy: typeof showPopover) =>
      spy.mock.contexts.filter(context => context === viewport).length;
    fireEvent.click(screen.getByRole('button', {name: 'Show toast'}));
    expect(onViewport(showPopover)).toBe(1);
    const root = viewport.parentNode;

    fireEvent.click(screen.getByRole('button', {name: 'Toggle Filters'}));
    expect(getDialog('Filters')).toHaveAttribute('popover', 'manual');
    // Re-entered (hide, then show) after the sheet's own showPopover, and
    // not moved: the sheet is not an outlet.
    expect(onViewport(hidePopover)).toBe(1);
    expect(onViewport(showPopover)).toBe(2);
    const sheetShow = showPopover.mock.contexts.indexOf(getDialog('Filters'));
    const viewportReshow = showPopover.mock.contexts.lastIndexOf(viewport);
    expect(sheetShow).toBeGreaterThan(-1);
    expect(viewportReshow).toBeGreaterThan(sheetShow);
    expect(viewport.parentNode).toBe(root);
    expect(screen.getByText('Saved')).toBeInTheDocument();

    // A toast raised while the sheet is open lands in the same viewport.
    fireEvent.click(
      screen.getByRole('button', {name: 'Show toast in Filters'}),
    );
    expect(screen.getAllByText('Saved')).toHaveLength(2);

    // Closing the sheet moves nothing and re-enters nothing.
    fireEvent.click(screen.getByRole('button', {name: 'Toggle Filters'}));
    expect(onViewport(hidePopover)).toBe(1);
    expect(onViewport(showPopover)).toBe(2);
  });

  it('keeps focus inside the viewport across a re-entry', () => {
    trackPopoverState();
    render(
      <ToastViewport>
        <ToastButton />
        <NonModalSheetFixture label="Filters" />
      </ToastViewport>,
    );
    fireEvent.click(screen.getByRole('button', {name: 'Show toast'}));
    const viewport = getViewport();
    const dismiss = viewport.querySelector('button');
    expect(dismiss).not.toBeNull();
    dismiss!.focus();
    fireEvent.click(screen.getByRole('button', {name: 'Toggle Filters'}));
    expect(document.activeElement).toBe(dismiss);
  });

  it("keeps each toast's auto-hide timer running across a move", () => {
    vi.useFakeTimers();
    try {
      const onHide = vi.fn();
      render(
        <ToastViewport>
          <TimedToastButton onHide={onHide} />
          <DialogFixture label="Edit" />
        </ToastViewport>,
      );

      fireEvent.click(screen.getByRole('button', {name: 'Show timed toast'}));
      act(() => {
        vi.advanceTimersByTime(3000);
      });
      fireEvent.click(screen.getByRole('button', {name: 'Toggle Edit'}));
      expect(getDialog('Edit').contains(getViewport())).toBe(true);
      act(() => {
        vi.advanceTimersByTime(2500);
      });
      // A remount would have restarted the 5s timer at the move.
      expect(onHide).toHaveBeenCalledWith('auto');
    } finally {
      vi.useRealTimers();
    }
  });

  it('returns when the dialog closes natively while React holds it open', () => {
    const {container} = render(
      <ToastViewport>
        <DialogFixture label="Edit" />
      </ToastViewport>,
    );
    fireEvent.click(screen.getByRole('button', {name: 'Toggle Edit'}));
    const dialog = getDialog('Edit');
    expect(dialog.contains(getViewport())).toBe(true);

    act(() => {
      dialog.removeAttribute('open');
      dialog.dispatchEvent(new Event('close'));
    });
    expect(container.contains(getViewport())).toBe(true);
  });

  it('follows the latest open modal through nested dialogs', () => {
    render(
      <ToastViewport>
        <DialogFixture label="Outer">
          <DialogFixture label="Inner" />
        </DialogFixture>
      </ToastViewport>,
    );

    fireEvent.click(screen.getByRole('button', {name: 'Toggle Outer'}));
    fireEvent.click(screen.getByRole('button', {name: 'Toggle Inner'}));
    expect(getDialog('Inner').contains(getViewport())).toBe(true);

    fireEvent.click(screen.getByRole('button', {name: 'Close Inner'}));
    expect(getDialog('Inner').contains(getViewport())).toBe(false);
    expect(getDialog('Outer').contains(getViewport())).toBe(true);
  });

  it('returns to its place when the open Dialog unmounts', () => {
    const {container} = render(
      <ToastViewport>
        <UnmountFixture />
      </ToastViewport>,
    );
    fireEvent.click(screen.getByRole('button', {name: 'Show toast'}));
    const toast = screen.getByText('Saved');
    const dismiss = getViewport().querySelector('button')!;
    dismiss.focus();

    act(() => {
      fireEvent.click(screen.getByRole('button', {name: 'Unmount'}));
    });
    expect(container.contains(getViewport())).toBe(true);
    expect(screen.getByText('Saved')).toBe(toast);
    // jsdom does not blur a moved node, so this guards only the end state;
    // the browser blur is handled by ToastViewport's focus restore.
    expect(document.activeElement).toBe(dismiss);
  });

  it('stays in place when the caller renders it in place', () => {
    render(
      <DialogFixture label="Edit">
        <ToastViewport isTopLayer={false}>
          <ToastButton />
        </ToastViewport>
      </DialogFixture>,
    );
    fireEvent.click(screen.getByRole('button', {name: 'Toggle Edit'}));
    fireEvent.click(screen.getByRole('button', {name: 'Show toast'}));
    expect(getDialog('Edit').contains(screen.getByText('Saved'))).toBe(true);
    expect(document.querySelector('[popover="manual"]')).toBeNull();
  });

  it('does not move into an inline Dialog', () => {
    const {container} = render(
      <ToastViewport>
        <Dialog isOpen isInline onOpenChange={() => {}} aria-label="Preview">
          <ToastButton />
        </Dialog>
      </ToastViewport>,
    );
    fireEvent.click(screen.getByRole('button', {name: 'Show toast'}));
    const viewport = getViewport();
    expect(viewport.closest('[aria-label="Preview"]')).toBeNull();
    expect(container.contains(viewport)).toBe(true);
  });
});

describe('ToastViewport above a BottomSheet', () => {
  beforeEach(() => {
    // Closing the sheet releases its scroll lock, which restores the scroll
    // position; jsdom does not implement scrolling.
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  });

  it('moves into an open scrim sheet and back to its place when it closes', () => {
    const {container} = render(
      <ToastViewport>
        <ToastButton />
        <SheetFixture label="Filters" />
      </ToastViewport>,
    );
    fireEvent.click(screen.getByRole('button', {name: 'Show toast'}));
    const toast = screen.getByText('Saved');

    fireEvent.click(screen.getByRole('button', {name: 'Open Filters'}));
    expect(getViewport().closest('dialog')).toBe(getDialog('Filters'));
    expect(screen.getByText('Saved')).toBe(toast);

    fireEvent.click(screen.getByRole('button', {name: 'Close Filters'}));
    expect(getViewport().closest('dialog')).toBeNull();
    expect(container.contains(getViewport())).toBe(true);
    expect(screen.getByText('Saved')).toBe(toast);
  });

  it('follows a sheet opened over a Dialog, above it in the top layer', () => {
    const showPopover = vi.spyOn(HTMLElement.prototype, 'showPopover');
    render(
      <ToastViewport>
        <DialogFixture label="Edit">
          <SheetFixture label="Filters" />
        </DialogFixture>
      </ToastViewport>,
    );
    const viewport = getViewport();
    const showsOnViewport = () =>
      showPopover.mock.contexts.filter(context => context === viewport).length;

    fireEvent.click(screen.getByRole('button', {name: 'Toggle Edit'}));
    expect(viewport.closest('dialog')).toBe(getDialog('Edit'));
    const showsInDialog = showsOnViewport();

    fireEvent.click(screen.getByRole('button', {name: 'Open Filters'}));
    // The sheet's modal makes everything outside it inert, the Dialog
    // included, so the viewport has to be inside the sheet.
    expect(viewport.closest('dialog')).toBe(getDialog('Filters'));
    expect(viewport.closest('[inert]')).toBeNull();
    // Shown again once the sheet is in the top layer, so it paints above it.
    expect(showsOnViewport()).toBe(showsInDialog + 1);
    expect(lastCallOrder(showPopover, viewport)).toBeGreaterThan(
      lastCallOrder(
        vi.mocked(HTMLDialogElement.prototype.showModal),
        getDialog('Filters'),
      ),
    );
  });

  it('returns to the Dialog as soon as the sheet starts closing', () => {
    render(
      <ToastViewport>
        <DialogFixture label="Edit">
          <SheetFixture label="Filters" />
        </DialogFixture>
      </ToastViewport>,
    );
    fireEvent.click(screen.getByRole('button', {name: 'Toggle Edit'}));
    fireEvent.click(screen.getByRole('button', {name: 'Open Filters'}));
    const viewport = getViewport();
    expect(viewport.closest('dialog')).toBe(getDialog('Filters'));

    fireEvent.click(screen.getByRole('button', {name: 'Close Filters'}));
    // The sheet stays an open modal through its exit animation, but inert and
    // hidden; toasts must not go down with it.
    expect(getDialog('Filters')).toHaveAttribute('open');
    expect(getDialog('Filters')).toHaveAttribute('inert');
    expect(viewport.closest('dialog')).toBe(getDialog('Edit'));
    expect(viewport.closest('[inert], [aria-hidden="true"]')).toBeNull();
  });

  it('stays in place when a sheet without a scrim opens', () => {
    trackPopoverState();
    const {container} = render(
      <ToastViewport>
        <SheetFixture label="Filters" hasScrim={false} />
      </ToastViewport>,
    );
    fireEvent.click(screen.getByRole('button', {name: 'Open Filters'}));
    // A non-modal sheet (a manual popover) leaves the page operable, so the
    // viewport stays put; it only re-enters the top layer in place.
    expect(getDialog('Filters').matches(':popover-open')).toBe(true);
    expect(getViewport().closest('dialog')).toBeNull();
    expect(container.contains(getViewport())).toBe(true);
  });

  it('is hosted by the top sheet of a stack, and by the sheet beneath once that one closes', () => {
    function Stack() {
      const [isAOpen, setIsAOpen] = useState(false);
      const [isBOpen, setIsBOpen] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setIsAOpen(true)}>
            Open A
          </button>
          <BottomSheet isOpen={isAOpen} onOpenChange={setIsAOpen} label="A">
            <button type="button" onClick={() => setIsBOpen(true)}>
              Open B
            </button>
          </BottomSheet>
          <BottomSheet isOpen={isBOpen} onOpenChange={setIsBOpen} label="B">
            <button type="button" onClick={() => setIsBOpen(false)}>
              Close B
            </button>
          </BottomSheet>
        </>
      );
    }
    render(
      <ToastViewport>
        <Stack />
      </ToastViewport>,
    );
    fireEvent.click(screen.getByRole('button', {name: 'Open A'}));
    expect(getViewport().closest('dialog')).toBe(getDialog('A'));
    expect(getActiveModalOutlet()).toBe(getDialog('A'));
    fireEvent.click(screen.getByRole('button', {name: 'Open B'}));
    // A is covered (inert) but still an active native modal, so it still
    // supplies an outlet; the latest outlet follows the stack, so the
    // viewport moves into B, the top sheet.
    expect(getDialog('A')).toHaveAttribute('inert');
    expect(getActiveModalOutlet()).toBe(getDialog('B'));
    expect(getViewport().closest('dialog')).toBe(getDialog('B'));
    expect(getViewport().closest('[inert]')).toBeNull();
    fireEvent.click(screen.getByRole('button', {name: 'Close B'}));
    // B starts closing and stops supplying; A, revealed, is the latest
    // outlet again and takes the viewport back at once.
    expect(getActiveModalOutlet()).toBe(getDialog('A'));
    expect(getViewport().closest('dialog')).toBe(getDialog('A'));
    expect(getViewport().closest('[inert]')).toBeNull();
  });

  it('a sheet revealed beneath an open Dialog does not take the outlet from the Dialog', () => {
    // Sheet A → Dialog from A → sheet B from the Dialog → close B. A is
    // revealed as the top sheet, but the Dialog above it is still open and
    // was supplied later: it keeps the outlet, so a toast raised from the
    // Dialog stays in the Dialog and pressable.
    function Nested() {
      const [isAOpen, setIsAOpen] = useState(false);
      const [isBOpen, setIsBOpen] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setIsAOpen(true)}>
            Open A
          </button>
          <BottomSheet isOpen={isAOpen} onOpenChange={setIsAOpen} label="A">
            <DialogFixture label="Edit">
              <button type="button" onClick={() => setIsBOpen(true)}>
                Open B
              </button>
              <ToastButton label="Toast from Edit" />
            </DialogFixture>
          </BottomSheet>
          <BottomSheet isOpen={isBOpen} onOpenChange={setIsBOpen} label="B">
            <button type="button" onClick={() => setIsBOpen(false)}>
              Close B
            </button>
          </BottomSheet>
        </>
      );
    }
    render(
      <ToastViewport>
        <Nested />
      </ToastViewport>,
    );
    fireEvent.click(screen.getByRole('button', {name: 'Open A'}));
    fireEvent.click(screen.getByRole('button', {name: 'Toggle Edit'}));
    expect(getActiveModalOutlet()).toBe(getDialog('Edit'));
    fireEvent.click(screen.getByRole('button', {name: 'Open B'}));
    expect(getActiveModalOutlet()).toBe(getDialog('B'));
    fireEvent.click(screen.getByRole('button', {name: 'Close B'}));
    // A is the top sheet again, but the Dialog was supplied after A and is
    // still open: it is the latest outlet, not A.
    expect(getActiveModalOutlet()).toBe(getDialog('Edit'));
    fireEvent.click(screen.getByRole('button', {name: 'Toast from Edit'}));
    const toast = screen.getByText('Saved');
    expect(toast.closest('dialog')).toBe(getDialog('Edit'));
    expect(toast.closest('[inert]')).toBeNull();
    // Closing the Dialog hands the outlet back to A.
    fireEvent.click(screen.getByRole('button', {name: 'Close Edit'}));
    expect(getActiveModalOutlet()).toBe(getDialog('A'));
  });

  it('keeps a reopened sheet as the outlet when the stale native close event of its re-show arrives', () => {
    // A stack re-shows a dialog (close(), then showModal()) to keep open
    // order; a sheet reopened during its exit is re-shown too. The native
    // `close` event that close() queued fires while the dialog is open again
    // and must not take the outlet away.
    function Pair() {
      const [isAOpen, setIsAOpen] = useState(false);
      const [isBOpen, setIsBOpen] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setIsAOpen(true)}>
            Open A
          </button>
          <BottomSheet isOpen={isAOpen} onOpenChange={setIsAOpen} label="A">
            <button type="button" onClick={() => setIsBOpen(true)}>
              Open B
            </button>
          </BottomSheet>
          <BottomSheet isOpen={isBOpen} onOpenChange={setIsBOpen} label="B">
            <button type="button" onClick={() => setIsBOpen(false)}>
              Close B
            </button>
            <ToastButton label="Toast from B" />
          </BottomSheet>
        </>
      );
    }
    render(
      <ToastViewport>
        <Pair />
      </ToastViewport>,
    );
    fireEvent.click(screen.getByRole('button', {name: 'Open A'}));
    fireEvent.click(screen.getByRole('button', {name: 'Open B'}));
    // Close B and reopen it during its exit: the registry re-shows B's
    // dialog, and the close() of that re-show queues a `close` event.
    fireEvent.click(screen.getByRole('button', {name: 'Close B'}));
    fireEvent.click(screen.getByRole('button', {name: 'Open B'}));
    expect(getDialog('B')).toHaveAttribute('open');
    expect(getActiveModalOutlet()).toBe(getDialog('B'));
    act(() => {
      getDialog('B').dispatchEvent(new Event('close'));
    });
    // The stale close changes nothing: B is open and still the latest outlet.
    expect(getActiveModalOutlet()).toBe(getDialog('B'));
    fireEvent.click(screen.getByRole('button', {name: 'Toast from B'}));
    const toast = screen.getByText('Saved');
    expect(toast.closest('dialog')).toBe(getDialog('B'));
    expect(toast.closest('[inert]')).toBeNull();
  });
});

describe('ToastViewport above a BottomSheetSwitcher flow', () => {
  function finishHandoff(entering: HTMLElement, retained: HTMLElement) {
    for (const panel of Array.from(
      entering.querySelectorAll<HTMLElement>('.astryx-bottom-sheet'),
    )) {
      fireEvent.transitionEnd(panel, {propertyName: 'transform'});
    }
    for (const panel of Array.from(
      retained.querySelectorAll<HTMLElement>('.astryx-bottom-sheet'),
    )) {
      fireEvent.transitionEnd(panel, {propertyName: 'opacity'});
    }
  }

  function Flow({hasScrim = true}: {hasScrim?: boolean}) {
    const [step, setStep] = useState<string | null>(null);
    return (
      <>
        <button type="button" onClick={() => setStep('one')}>
          Open flow
        </button>
        <BottomSheetSwitcher
          activeSheet={step}
          onActiveSheetChange={setStep}
          hasScrim={hasScrim}>
          <BottomSheet sheetId="one" label="One">
            <button type="button" onClick={() => setStep('two')}>
              Next
            </button>
            <ToastButton label="Toast from one" />
          </BottomSheet>
          <BottomSheet sheetId="two" label="Two">
            <button type="button" onClick={() => setStep(null)}>
              Done
            </button>
            <ToastButton label="Toast from two" />
          </BottomSheet>
        </BottomSheetSwitcher>
      </>
    );
  }

  it('is hosted by the active step of a modal flow, follows a handoff, and returns when the flow closes', () => {
    const {container} = render(
      <ToastViewport>
        <Flow />
      </ToastViewport>,
    );
    fireEvent.click(screen.getByRole('button', {name: 'Open flow'}));
    expect(getActiveModalOutlet()).toBe(getDialog('One'));
    expect(getViewport().closest('dialog')).toBe(getDialog('One'));
    fireEvent.click(screen.getByRole('button', {name: 'Toast from one'}));
    const toast = screen.getByText('Saved');
    expect(toast.closest('dialog')).toBe(getDialog('One'));
    // The handoff moves the host to the entering step; the retained step,
    // inert and fading, never hosts.
    fireEvent.click(screen.getByRole('button', {name: 'Next'}));
    expect(getActiveModalOutlet()).toBe(getDialog('Two'));
    expect(getViewport().closest('dialog')).toBe(getDialog('Two'));
    expect(getViewport().closest('[inert]')).toBeNull();
    expect(screen.getByText('Saved')).toBe(toast);
    finishHandoff(getDialog('Two'), getDialog('One'));
    expect(getActiveModalOutlet()).toBe(getDialog('Two'));
    fireEvent.click(screen.getByRole('button', {name: 'Done'}));
    // A closing flow stops supplying at once.
    expect(getActiveModalOutlet()).toBeNull();
    expect(getViewport().closest('dialog')).toBeNull();
    expect(container.contains(getViewport())).toBe(true);
  });

  it('a modal flow stacked over a standalone sheet is the latest outlet; the sheet takes it back when the flow closes', () => {
    function Mixed() {
      const [isAOpen, setIsAOpen] = useState(false);
      const [step, setStep] = useState<string | null>(null);
      return (
        <>
          <button type="button" onClick={() => setIsAOpen(true)}>
            Open A
          </button>
          <BottomSheet isOpen={isAOpen} onOpenChange={setIsAOpen} label="A">
            <button type="button" onClick={() => setStep('one')}>
              Open flow
            </button>
          </BottomSheet>
          <BottomSheetSwitcher activeSheet={step} onActiveSheetChange={setStep}>
            <BottomSheet sheetId="one" label="One">
              <button type="button" onClick={() => setStep(null)}>
                Done
              </button>
            </BottomSheet>
          </BottomSheetSwitcher>
        </>
      );
    }
    render(
      <ToastViewport>
        <Mixed />
      </ToastViewport>,
    );
    fireEvent.click(screen.getByRole('button', {name: 'Open A'}));
    expect(getActiveModalOutlet()).toBe(getDialog('A'));
    fireEvent.click(screen.getByRole('button', {name: 'Open flow'}));
    expect(getActiveModalOutlet()).toBe(getDialog('One'));
    expect(getViewport().closest('[inert]')).toBeNull();
    fireEvent.click(screen.getByRole('button', {name: 'Done'}));
    expect(getActiveModalOutlet()).toBe(getDialog('A'));
  });

  it('a standalone sheet opened from a step is the latest outlet while the covered flow keeps supplying', () => {
    function Mixed() {
      const [step, setStep] = useState<string | null>(null);
      const [isCOpen, setIsCOpen] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setStep('one')}>
            Open flow
          </button>
          <BottomSheetSwitcher activeSheet={step} onActiveSheetChange={setStep}>
            <BottomSheet sheetId="one" label="One">
              <button type="button" onClick={() => setIsCOpen(true)}>
                Open C
              </button>
            </BottomSheet>
          </BottomSheetSwitcher>
          <BottomSheet isOpen={isCOpen} onOpenChange={setIsCOpen} label="C">
            <button type="button" onClick={() => setIsCOpen(false)}>
              Close C
            </button>
          </BottomSheet>
        </>
      );
    }
    render(
      <ToastViewport>
        <Mixed />
      </ToastViewport>,
    );
    fireEvent.click(screen.getByRole('button', {name: 'Open flow'}));
    fireEvent.click(screen.getByRole('button', {name: 'Open C'}));
    expect(getActiveModalOutlet()).toBe(getDialog('C'));
    expect(getDialog('One')).toHaveAttribute('inert');
    fireEvent.click(screen.getByRole('button', {name: 'Close C'}));
    expect(getActiveModalOutlet()).toBe(getDialog('One'));
  });

  it('the top sheet stays the latest outlet when the covered flow beneath it changes step from code: a toast raised from the sheet lands in it, not in the inert step', () => {
    function Mixed() {
      const [step, setStep] = useState<string | null>(null);
      const [isCOpen, setIsCOpen] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setStep('one')}>
            Open flow
          </button>
          <button type="button" onClick={() => setStep('two')}>
            Step two
          </button>
          <BottomSheetSwitcher activeSheet={step} onActiveSheetChange={setStep}>
            <BottomSheet sheetId="one" label="One">
              <button type="button" onClick={() => setIsCOpen(true)}>
                Open C
              </button>
            </BottomSheet>
            <BottomSheet sheetId="two" label="Two">
              two
            </BottomSheet>
          </BottomSheetSwitcher>
          <BottomSheet isOpen={isCOpen} onOpenChange={setIsCOpen} label="C">
            <ToastButton label="Toast from C" />
            <button type="button" onClick={() => setIsCOpen(false)}>
              Close C
            </button>
          </BottomSheet>
        </>
      );
    }
    render(
      <ToastViewport>
        <Mixed />
      </ToastViewport>,
    );
    const {showPopover, hidePopover} = trackPopoverState();
    fireEvent.click(screen.getByRole('button', {name: 'Open flow'}));
    fireEvent.click(screen.getByRole('button', {name: 'Open C'}));
    expect(getActiveModalOutlet()).toBe(getDialog('C'));
    const viewport = getViewport();
    const onViewport = (spy: typeof showPopover) =>
      spy.mock.contexts.filter(context => context === viewport).length;
    const hidesBefore = onViewport(hidePopover);
    const showsBefore = onViewport(showPopover);
    // The flow's level becomes step two's dialog, re-supplied while C stays
    // on top: the re-supply goes beneath C, which keeps the outlet.
    fireEvent.click(screen.getByRole('button', {name: 'Step two'}));
    expect(getDialog('Two')).toHaveAttribute('inert');
    expect(getDialog('C')).not.toHaveAttribute('inert');
    expect(getActiveModalOutlet()).toBe(getDialog('C'));
    // C was closed and shown again to stay on top, carrying the viewport's
    // popover back beneath it in the top layer: the viewport re-entered
    // (hide, then show) so toasts paint above the re-shown C.
    expect(onViewport(hidePopover)).toBe(hidesBefore + 1);
    expect(onViewport(showPopover)).toBe(showsBefore + 1);
    fireEvent.click(screen.getByRole('button', {name: 'Toast from C'}));
    const toast = screen.getByText('Saved');
    expect(toast.closest('dialog')).toBe(getDialog('C'));
    // Closing C hands the outlet to the flow's current step.
    fireEvent.click(screen.getByRole('button', {name: 'Close C'}));
    expect(getActiveModalOutlet()).toBe(getDialog('Two'));
  });

  it('a non-modal flow supplies no outlet', () => {
    trackPopoverState();
    const {container} = render(
      <ToastViewport>
        <Flow hasScrim={false} />
      </ToastViewport>,
    );
    fireEvent.click(screen.getByRole('button', {name: 'Open flow'}));
    expect(getActiveModalOutlet()).toBeNull();
    expect(getViewport().closest('dialog')).toBeNull();
    expect(container.contains(getViewport())).toBe(true);
  });
});

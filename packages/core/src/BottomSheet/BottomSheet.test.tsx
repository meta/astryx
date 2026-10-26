// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file BottomSheet.test.tsx
 * @input Uses vitest, @testing-library/react, BottomSheet component
 * @output Unit tests for BottomSheet behavior and observed content anatomy
 * @position Core testing; validates BottomSheet.tsx implementation
 *
 * SYNC: When BottomSheet.tsx changes, update tests to match new behavior
 */

import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';
import {act, render, screen, fireEvent} from '@testing-library/react';
import {createRef, useState} from 'react';
import {BottomSheet} from './BottomSheet';
import {BottomSheetEscapeContext} from './bottomSheetEscape';
import {BottomSheetSwitcher} from './BottomSheetSwitcher';
import {__resetInteractionModalityForTest} from '../utils/interactionModality';

// A sheet has no stops unless its host asks for them, so the tests that
// exercise detents pass their own. These three — a 14% peek, a half-height
// stop, and a 92% stop the Tall budget already covers — are the geometry the
// height assertions below are written against.
const SNAP_POINTS: ReadonlyArray<number> = [0.14, 0.5, 0.92];

// jsdom doesn't implement <dialog> open/close or pointer capture; stub them.
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
  if (!Element.prototype.setPointerCapture) {
    Element.prototype.setPointerCapture = vi.fn();
    Element.prototype.releasePointerCapture = vi.fn();
  }

  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockReturnValue({
      matches: false,
      media: '',
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }),
  );
  vi.stubGlobal(
    'requestAnimationFrame',
    vi.fn((callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    }),
  );
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  window.scrollTo = vi.fn();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function getSheet(): HTMLElement {
  const sheet = document.querySelector<HTMLElement>('.astryx-bottom-sheet');
  if (!sheet) {
    throw new Error('sheet panel not found');
  }
  return sheet;
}

function getBody(): HTMLElement {
  const body = getSheet().lastElementChild;
  if (!(body instanceof HTMLElement)) {
    throw new Error('sheet scroll body not found');
  }
  return body;
}

function getPositioner(): HTMLElement {
  const positioner = getSheet().parentElement;
  if (!(positioner instanceof HTMLElement)) {
    throw new Error('sheet positioner not found');
  }
  return positioner;
}

function rect({top, bottom}: {top: number; bottom: number}): DOMRect {
  return {
    x: 0,
    y: top,
    top,
    right: 400,
    bottom,
    left: 0,
    width: 400,
    height: bottom - top,
    toJSON: () => ({}),
  };
}

function resizeEntry(
  borderBoxHeight: number,
  contentBoxHeight = borderBoxHeight,
): ResizeObserverEntry {
  // Core typechecks its tests, so this partial stands in for the full entry
  // the way sharedResizeObserver does: only the fields the sheet reads.
  const entry: Partial<ResizeObserverEntry> = {
    borderBoxSize: [{blockSize: borderBoxHeight, inlineSize: 100}],
    contentRect: rect({top: 0, bottom: contentBoxHeight}),
  };
  return entry as ResizeObserverEntry;
}

function mockVisualViewport(height: number, offsetTop = 0) {
  const viewport = Object.assign(new EventTarget(), {
    height,
    offsetTop,
  });
  vi.stubGlobal('visualViewport', viewport);
  return viewport;
}

// The layout viewport — `100dvh`, `window.innerHeight` — which is what the
// sheet's height budget and its detents are measured against. Deliberately
// separate from the visual viewport above: the mobile keyboard shrinks that
// one and leaves this one alone, and the sheet has to tell them apart.
function mockWindowHeight(height: number) {
  vi.stubGlobal('innerHeight', height);
}

function mockIOSWebKit() {
  const navigatorMock = Object.create(window.navigator);
  Object.defineProperties(navigatorMock, {
    userAgent: {
      configurable: true,
      value:
        'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15',
    },
    maxTouchPoints: {configurable: true, value: 5},
  });
  vi.stubGlobal('navigator', navigatorMock);
}

interface ResizeObserverRecord {
  callback: ResizeObserverCallback;
  observed: Set<Element>;
}

function mockResizeObserverInstances(): ResizeObserverRecord[] {
  const observers: ResizeObserverRecord[] = [];
  class ResizeObserverMock {
    callback: ResizeObserverCallback;
    observed = new Set<Element>();

    constructor(callback: ResizeObserverCallback) {
      this.callback = callback;
      observers.push(this);
    }

    observe(target: Element) {
      this.observed.add(target);
    }

    unobserve(target: Element) {
      this.observed.delete(target);
    }

    disconnect() {
      this.observed.clear();
    }
  }
  vi.stubGlobal('ResizeObserver', ResizeObserverMock);
  return observers;
}

function finishSheetExit() {
  fireEvent.transitionEnd(getSheet(), {propertyName: 'transform'});
}

function ExitHarness({
  hasScrim,
  snapPoints,
}: {
  hasScrim?: boolean;
  snapPoints?: ReadonlyArray<number>;
}) {
  const [isOpen, setIsOpen] = useState(true);
  return (
    <BottomSheet
      isOpen={isOpen}
      onOpenChange={setIsOpen}
      label="Filters"
      snapPoints={snapPoints}
      hasScrim={hasScrim}>
      <button type="button" onClick={() => setIsOpen(false)}>
        Close sheet
      </button>
    </BottomSheet>
  );
}

// The grab handle is the panel's first child (decorative, aria-hidden).
function getHandle(): HTMLElement {
  const handle = getSheet().querySelector<HTMLElement>('[aria-hidden="true"]');
  if (!handle) {
    throw new Error('grab handle not found');
  }
  return handle;
}

// Drive a pointer drag on the grab handle. jsdom PointerEvents don't carry
// clientY, so dispatch plain events with the coords the handlers read.
function drag(handle: HTMLElement, points: {y: number}[]) {
  const [down, ...rest] = points;
  fireEvent.pointerDown(handle, {
    pointerId: 1,
    clientY: down.y,
    button: 0,
    isPrimary: true,
  });
  for (const p of rest) {
    fireEvent.pointerMove(handle, {pointerId: 1, clientY: p.y});
  }
  const last = points[points.length - 1];
  fireEvent.pointerUp(handle, {pointerId: 1, clientY: last.y});
}

function fireTimedPointer(
  target: Element,
  type: 'pointerdown' | 'pointermove' | 'pointerup',
  {time, y}: {time: number; y: number},
) {
  const event = new Event(type, {bubbles: true, cancelable: true});
  Object.defineProperties(event, {
    button: {value: 0},
    clientY: {value: y},
    isPrimary: {value: true},
    pointerId: {value: 1},
    timeStamp: {value: time},
  });
  return fireEvent(target, event);
}

describe('BottomSheet', () => {
  it('renders children when open and applies the accessible label', () => {
    render(
      <BottomSheet isOpen onOpenChange={() => {}} label="Filters">
        Sheet content
      </BottomSheet>,
    );
    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeInTheDocument();
    expect(dialog).toHaveAccessibleName('Filters');
    expect(screen.getByText('Sheet content')).toBeInTheDocument();
  });

  it('forwards DOM props and refs to the visual panel, not the dialog host', () => {
    const panelRef = createRef<HTMLDivElement>();
    const onClick = vi.fn();
    render(
      <BottomSheet
        ref={panelRef}
        isOpen
        onOpenChange={() => {}}
        label="Filters"
        data-testid="filters-panel"
        data-sheet-owner="search"
        className="custom-panel"
        onClick={onClick}>
        Content
      </BottomSheet>,
    );

    const panel = screen.getByTestId('filters-panel');
    const dialog = screen.getByRole('dialog');
    expect(panelRef.current).toBe(panel);
    expect(panel.tagName).toBe('DIV');
    expect(panel).toHaveClass('astryx-bottom-sheet', 'custom-panel');
    expect(panel).toHaveAttribute('data-sheet-owner', 'search');
    expect(dialog).not.toHaveAttribute('data-testid');

    fireEvent.click(panel);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('keeps consumer content first and last inside the observed content box', () => {
    render(
      <BottomSheet isOpen onOpenChange={() => {}} label="Filters">
        <div data-testid="consumer-content">Sheet content</div>
      </BottomSheet>,
    );
    const body = getBody();
    const consumer = screen.getByTestId('consumer-content');

    expect(body.children).toHaveLength(1);
    const content = body.lastElementChild;
    expect(content).toHaveAttribute('data-scroll-content');
    expect(content?.lastElementChild).toBe(consumer);
    expect(consumer.matches(':first-child')).toBe(true);
    expect(consumer.matches(':last-child')).toBe(true);
  });

  it('does not show when isOpen is false', () => {
    render(
      <BottomSheet isOpen={false} onOpenChange={() => {}} label="Filters">
        Hidden
      </BottomSheet>,
    );
    expect(HTMLDialogElement.prototype.showModal).not.toHaveBeenCalled();
  });

  it('opens modally (showModal + aria-modal)', () => {
    render(
      <BottomSheet isOpen onOpenChange={() => {}} label="Filters">
        Content
      </BottomSheet>,
    );
    expect(HTMLDialogElement.prototype.showModal).toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal', 'true');
  });

  it('requests close on Escape', () => {
    const onOpenChange = vi.fn();
    render(
      <BottomSheet isOpen onOpenChange={onOpenChange} label="Filters">
        Content
      </BottomSheet>,
    );
    fireEvent.keyDown(screen.getByRole('dialog'), {key: 'Escape'});
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('ignores Escape while an IME composition is active', () => {
    const onOpenChange = vi.fn();
    render(
      <BottomSheet isOpen onOpenChange={onOpenChange} label="Filters">
        <input aria-label="Search" />
      </BottomSheet>,
    );
    const dialog = screen.getByRole('dialog');

    fireEvent.keyDown(dialog, {key: 'Escape', isComposing: true});
    fireEvent.keyDown(dialog, {key: 'Escape', keyCode: 229});

    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('claims the composing Escape so no native close request follows', () => {
    const onOpenChange = vi.fn();
    render(
      <BottomSheet isOpen onOpenChange={onOpenChange} label="Filters">
        <input aria-label="Search" />
      </BottomSheet>,
    );
    const dialog = screen.getByRole('dialog');

    // An unclaimed Escape lets the browser raise its own close request, which
    // arrives as `cancel` and dismisses the sheet on the same keypress. The
    // guard has to swallow the composing Escape, not merely skip dismissal.
    const wasNotClaimed = fireEvent.keyDown(dialog, {
      key: 'Escape',
      isComposing: true,
    });

    expect(wasNotClaimed).toBe(false);
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('keeps a form sheet open when Escape cancels a field composition', () => {
    const onOpenChange = vi.fn();
    render(
      <BottomSheet
        isOpen
        purpose="form"
        onOpenChange={onOpenChange}
        label="Edit profile">
        <input aria-label="Name" />
      </BottomSheet>,
    );

    // The reported path: the keydown starts at the composing field and bubbles
    // to the sheet's <dialog>, so the guard has to survive the trip.
    fireEvent.keyDown(screen.getByRole('textbox', {name: 'Name'}), {
      key: 'Escape',
      isComposing: true,
    });

    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('still dismisses on the Escape after a composition is cancelled', () => {
    const onOpenChange = vi.fn();
    render(
      <BottomSheet isOpen onOpenChange={onOpenChange} label="Filters">
        <input aria-label="Search" />
      </BottomSheet>,
    );
    const dialog = screen.getByRole('dialog');

    fireEvent.keyDown(dialog, {key: 'Escape', isComposing: true});
    expect(onOpenChange).not.toHaveBeenCalled();

    fireEvent.keyDown(dialog, {key: 'Escape'});

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('leaves the IME the composition keys that are not Escape', () => {
    const onOpenChange = vi.fn();
    render(
      <BottomSheet isOpen onOpenChange={onOpenChange} label="Filters">
        <input aria-label="Search" />
      </BottomSheet>,
    );
    const dialog = screen.getByRole('dialog');

    // Enter commits a candidate and the arrows walk the candidate window. The
    // sheet must claim neither, or the IME loses keys it owns.
    const enterUnclaimed = fireEvent.keyDown(dialog, {
      key: 'Enter',
      isComposing: true,
    });
    const arrowUnclaimed = fireEvent.keyDown(dialog, {
      key: 'ArrowDown',
      isComposing: true,
    });

    expect(enterUnclaimed).toBe(true);
    expect(arrowUnclaimed).toBe(true);
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('requests close when the scrim (dialog element itself) is clicked', () => {
    const onOpenChange = vi.fn();
    render(
      <BottomSheet isOpen onOpenChange={onOpenChange} label="Filters">
        Content
      </BottomSheet>,
    );
    fireEvent.click(screen.getByRole('dialog'));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('purpose=form blocks scrim and swipe dismissal but allows Escape', () => {
    const onOpenChange = vi.fn();
    render(
      <BottomSheet
        isOpen
        purpose="form"
        onOpenChange={onOpenChange}
        label="Edit profile">
        Content
      </BottomSheet>,
    );
    const dialog = screen.getByRole('dialog');

    fireEvent.click(dialog);
    drag(getHandle(), [{y: 0}, {y: 40}, {y: 120}]);

    expect(onOpenChange).not.toHaveBeenCalled();
    expect(dialog).toHaveStyle({'--_sheet-scrim-opacity': '1'});

    fireEvent.keyDown(dialog, {key: 'Escape'});
    fireEvent(dialog, new Event('cancel', {cancelable: true}));

    expect(onOpenChange).toHaveBeenCalledTimes(2);
    expect(onOpenChange).toHaveBeenNthCalledWith(1, false);
    expect(onOpenChange).toHaveBeenNthCalledWith(2, false);
  });

  it('purpose=required blocks every implicit dismissal path', () => {
    const onOpenChange = vi.fn();
    render(
      <BottomSheet
        isOpen
        purpose="required"
        onOpenChange={onOpenChange}
        label="Required action">
        Content
      </BottomSheet>,
    );
    const dialog = screen.getByRole('alertdialog');

    fireEvent.click(dialog);
    fireEvent.keyDown(dialog, {key: 'Escape'});
    fireEvent(dialog, new Event('cancel', {cancelable: true}));
    drag(getHandle(), [{y: 0}, {y: 40}, {y: 120}]);

    expect(onOpenChange).not.toHaveBeenCalled();
    expect(dialog).toHaveStyle({'--_sheet-scrim-opacity': '1'});
  });

  it("the internal Escape gate (Popover's sheet) blocks Escape and the close request, not the scrim or swipe", () => {
    const onOpenChange = vi.fn();
    render(
      <BottomSheetEscapeContext value={false}>
        <BottomSheet isOpen onOpenChange={onOpenChange} label="Filters">
          Content
        </BottomSheet>
      </BottomSheetEscapeContext>,
    );
    const dialog = screen.getByRole('dialog');

    fireEvent.keyDown(dialog, {key: 'Escape'});
    fireEvent(dialog, new Event('cancel', {cancelable: true}));
    expect(onOpenChange).not.toHaveBeenCalled();

    fireEvent.click(dialog);
    expect(onOpenChange).toHaveBeenCalledTimes(1);
    drag(getHandle(), [{y: 0}, {y: 40}, {y: 120}]);
    expect(onOpenChange).toHaveBeenCalledTimes(2);
    expect(onOpenChange).toHaveBeenNthCalledWith(2, false);
  });

  it('stays open when a file picker inside it is dismissed, and still closes on its own close request', () => {
    // A file input fires a bubbling `cancel` at itself when its picker is
    // dismissed. It reaches the <dialog> like a close request but is not one.
    const onOpenChange = vi.fn();
    render(
      <BottomSheet
        isOpen
        purpose="form"
        onOpenChange={onOpenChange}
        label="Upload">
        <input type="file" aria-label="Picture" />
      </BottomSheet>,
    );

    const fromPicker = new Event('cancel', {bubbles: true, cancelable: true});
    fireEvent(screen.getByLabelText('Picture'), fromPicker);

    expect(onOpenChange).not.toHaveBeenCalled();
    expect(fromPicker.defaultPrevented).toBe(false);

    fireEvent(
      screen.getByRole('dialog'),
      new Event('cancel', {cancelable: true}),
    );

    expect(onOpenChange).toHaveBeenCalledTimes(1);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('keeps a standalone modal sheet presented through its exit animation', () => {
    render(<ExitHarness />);
    const dialog = screen.getByRole('dialog', {name: 'Filters'});

    fireEvent.click(screen.getByRole('button', {name: 'Close sheet'}));

    expect(dialog).toHaveAttribute('open');
    expect(dialog).toHaveAttribute('inert');
    expect(dialog).toHaveAttribute('aria-hidden', 'true');
    expect(dialog).not.toHaveAttribute('aria-modal');
    expect(dialog).toHaveStyle({'--_sheet-scrim-opacity': '0'});
    expect(document.body.style.position).toBe('fixed');

    finishSheetExit();

    expect(dialog).not.toHaveAttribute('open');
    expect(document.body.style.position).not.toBe('fixed');
  });

  it('does not dismiss when the sheet surface itself is clicked', () => {
    const onOpenChange = vi.fn();
    render(
      <BottomSheet isOpen onOpenChange={onOpenChange} label="Filters">
        Content
      </BottomSheet>,
    );
    // Only a click that lands on the dialog (the transparent area) dismisses;
    // clicks bubbling up from the sheet must not.
    fireEvent.click(screen.getByText('Content'));
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  describe('hasScrim={false} (non-modal)', () => {
    it('opens non-modally: show() instead of showModal(), no aria-modal', () => {
      render(
        <BottomSheet
          isOpen
          onOpenChange={() => {}}
          label="Filters"
          hasScrim={false}>
          Content
        </BottomSheet>,
      );
      expect(HTMLDialogElement.prototype.show).toHaveBeenCalled();
      expect(HTMLDialogElement.prototype.showModal).not.toHaveBeenCalled();
      expect(screen.getByRole('dialog')).not.toHaveAttribute('aria-modal');
    });

    it('does not dismiss when the shell (dialog element itself) is clicked', () => {
      // No scrim: a tap on the transparent shell must pass through to the page,
      // not dismiss the sheet.
      const onOpenChange = vi.fn();
      render(
        <BottomSheet
          isOpen
          onOpenChange={onOpenChange}
          label="Filters"
          hasScrim={false}>
          Content
        </BottomSheet>,
      );
      fireEvent.click(screen.getByRole('dialog'));
      expect(onOpenChange).not.toHaveBeenCalled();
    });

    it('still closes on Escape while focus is inside', () => {
      const onOpenChange = vi.fn();
      render(
        <BottomSheet
          isOpen
          onOpenChange={onOpenChange}
          label="Filters"
          hasScrim={false}>
          Content
        </BottomSheet>,
      );
      fireEvent.keyDown(screen.getByRole('dialog'), {key: 'Escape'});
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });

    it('ignores Escape while an IME composition is active', () => {
      const onOpenChange = vi.fn();
      render(
        <BottomSheet
          isOpen
          hasScrim={false}
          onOpenChange={onOpenChange}
          label="Filters">
          <input aria-label="Search" />
        </BottomSheet>,
      );

      // Escape is this sheet's only keyboard route out — there is no native
      // close request behind it — so the guard is all that stands between a
      // composing CJK user and a dismissed sheet.
      fireEvent.keyDown(screen.getByRole('dialog'), {
        key: 'Escape',
        isComposing: true,
      });

      expect(onOpenChange).not.toHaveBeenCalled();
    });

    it('still dismisses on a downward swipe past the threshold', () => {
      const onOpenChange = vi.fn();
      render(
        <BottomSheet
          isOpen
          onOpenChange={onOpenChange}
          label="Filters"
          hasScrim={false}>
          Content
        </BottomSheet>,
      );
      drag(getHandle(), [{y: 0}, {y: 40}, {y: 120}]);
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });

    it('does not steal focus onto the panel on open', () => {
      render(
        <BottomSheet
          isOpen
          onOpenChange={() => {}}
          label="Filters"
          hasScrim={false}>
          <button type="button">First action</button>
        </BottomSheet>,
      );
      // The background stays interactive, so the sheet must not grab focus.
      expect(document.activeElement).not.toBe(getSheet());
    });

    it('still honors a descendant with data-autofocus', () => {
      render(
        <BottomSheet
          isOpen
          onOpenChange={() => {}}
          label="Filters"
          hasScrim={false}>
          <input data-autofocus aria-label="Search" />
        </BottomSheet>,
      );
      expect(document.activeElement).toBe(
        screen.getByRole('textbox', {name: 'Search'}),
      );
    });

    it('keeps a standalone non-modal sheet visible until its exit ends', () => {
      render(<ExitHarness hasScrim={false} />);
      const dialog = screen.getByRole('dialog', {name: 'Filters'});

      fireEvent.click(screen.getByRole('button', {name: 'Close sheet'}));

      expect(dialog).toHaveAttribute('open');
      expect(dialog).toHaveAttribute('inert');
      expect(document.body.style.position).not.toBe('fixed');

      finishSheetExit();

      expect(dialog).not.toHaveAttribute('open');
    });
  });

  describe('grab handle', () => {
    it('renders a decorative handle hidden from assistive tech', () => {
      render(
        <BottomSheet isOpen onOpenChange={() => {}} label="Filters">
          Content
        </BottomSheet>,
      );
      const handle = getHandle();
      expect(handle).toHaveAttribute('aria-hidden', 'true');
    });
  });

  describe('swipe to dismiss', () => {
    it('requests close when dragged past the dismiss threshold', () => {
      const onOpenChange = vi.fn();
      render(
        <BottomSheet isOpen onOpenChange={onOpenChange} label="Filters">
          Content
        </BottomSheet>,
      );
      // No measured height in jsdom (0) -> any downward drag dismisses via
      // the distance branch (offset > 0.25) once released downward.
      drag(getHandle(), [{y: 0}, {y: 40}, {y: 120}]);
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });

    it('restores the sheet when a context menu interrupts an active drag', () => {
      const onOpenChange = vi.fn();
      render(
        <BottomSheet isOpen onOpenChange={onOpenChange} label="Filters">
          Content
        </BottomSheet>,
      );
      const handle = getHandle();
      const dialog = screen.getByRole('dialog');

      fireEvent.pointerDown(handle, {
        pointerId: 1,
        clientY: 0,
        button: 0,
        isPrimary: true,
      });
      fireEvent.pointerMove(handle, {pointerId: 1, clientY: 300});
      expect(getSheet().style.transform).toBe('translateY(300px)');

      expect(fireEvent.contextMenu(handle)).toBe(false);

      expect(getSheet().style.transform).toBe('');
      expect(dialog).toHaveStyle({'--_sheet-scrim-opacity': '1'});
      expect(onOpenChange).not.toHaveBeenCalled();
    });
  });

  describe('height', () => {
    it('renders for each named height without error', () => {
      for (const height of ['hug', 'capped', 'tall'] as const) {
        const {unmount} = render(
          <BottomSheet
            isOpen
            onOpenChange={() => {}}
            label="Filters"
            height={height}>
            Content
          </BottomSheet>,
        );
        expect(screen.getByRole('dialog')).toBeInTheDocument();
        unmount();
      }
    });

    it('accepts a freeform height (number or CSS length)', () => {
      for (const height of [480, '70dvh'] as const) {
        const {unmount} = render(
          <BottomSheet
            isOpen
            onOpenChange={() => {}}
            label="Filters"
            height={height}>
            Content
          </BottomSheet>,
        );
        expect(screen.getByRole('dialog')).toBeInTheDocument();
        unmount();
      }
    });

    it('keeps the full layout height at the peek detent', () => {
      const observers = mockResizeObserverInstances();
      mockVisualViewport(800);
      mockWindowHeight(800);
      render(
        <BottomSheet
          isOpen
          onOpenChange={() => {}}
          label="Release notes"
          snapPoints={SNAP_POINTS}
          height="tall">
          Content
        </BottomSheet>,
      );
      const sheet = getSheet();
      const sheetObserver = observers.find(instance =>
        instance.observed.has(sheet),
      );
      act(() => {
        sheetObserver?.callback(
          [resizeEntry(784, 736)],
          sheetObserver as unknown as ResizeObserver,
        );
      });

      // Settle on the shortest 112px peek: offset 736 - 112 = 624.
      fireTimedPointer(getHandle(), 'pointerdown', {time: 0, y: 0});
      fireTimedPointer(getHandle(), 'pointermove', {time: 1000, y: 600});
      fireTimedPointer(getHandle(), 'pointerup', {time: 2000, y: 600});
      fireEvent.transitionEnd(sheet, {propertyName: 'transform'});

      // A glance state does not reflow the content into a sliver: the sheet
      // keeps its full layout height and slides below the viewport instead.
      expect(sheet.style.height).toBe('');
      expect(sheet.style.transform).toBe('translateY(624px)');
      expect(getBody().style.paddingBlockEnd).toBe('');

      // Dragging back up off the peek stays transform-only for the same
      // reason — there is no shortened layout to restore first.
      fireTimedPointer(getHandle(), 'pointerdown', {time: 3000, y: 600});
      fireTimedPointer(getHandle(), 'pointermove', {time: 4000, y: 400});
      expect(sheet.style.transform).toBe('translateY(424px)');
      expect(sheet.style.height).toBe('784px');
      expect(getBody().style.paddingBlockEnd).toBe('');

      // Releasing at the taller p50 detent resizes the scrolling area.
      fireTimedPointer(getHandle(), 'pointerup', {time: 5000, y: 400});
      fireEvent.transitionEnd(sheet, {propertyName: 'transform'});
      expect(sheet.style.height).toBe('448px');
      expect(sheet.style.transform).toBe('');
    });

    it('swaps height for transform without a transition when released on a detent', () => {
      const observers = mockResizeObserverInstances();
      mockVisualViewport(800);
      mockWindowHeight(800);
      render(
        <BottomSheet
          isOpen
          onOpenChange={() => {}}
          label="Release notes"
          snapPoints={SNAP_POINTS}
          height="tall">
          Content
        </BottomSheet>,
      );
      const sheet = getSheet();
      const sheetObserver = observers.find(instance =>
        instance.observed.has(sheet),
      );
      act(() => {
        sheetObserver?.callback(
          [resizeEntry(784, 736)],
          sheetObserver as unknown as ResizeObserver,
        );
      });

      // magnetize() lands a slow drag exactly on the p50 detent (offset 336),
      // so the release has no travel left to animate and reconciles at once.
      fireTimedPointer(getHandle(), 'pointerdown', {time: 0, y: 0});
      fireTimedPointer(getHandle(), 'pointermove', {time: 1000, y: 336});
      expect(sheet.style.transform).toBe('translateY(336px)');
      expect(sheet.style.height).toBe('784px');

      // Hold the reconciliation frame so the intermediate render is visible
      // to the assertions below.
      const reconciliationFrames: FrameRequestCallback[] = [];
      vi.mocked(requestAnimationFrame).mockImplementation(callback => {
        reconciliationFrames.push(callback);
        return reconciliationFrames.length;
      });
      fireTimedPointer(getHandle(), 'pointerup', {time: 2000, y: 336});

      // Height and transform swap roles in this one render. That is only
      // invisible with transitions off; live, the composited transform would
      // animate the whole 336px swap while the height jumped, and the sheet
      // would lurch away from the detent before coming back to it.
      expect(sheet.style.height).toBe('448px');
      expect(sheet.style.transform).toBe('');
      expect(sheet.style.transition).toBe('none');

      // Transitions come back for the next gesture.
      act(() => reconciliationFrames.splice(0).forEach(frame => frame(0)));
      expect(sheet.style.transition).toBe('');
    });

    it('uses transforms while dragging and resizes to the visible snapped height', () => {
      const observers = mockResizeObserverInstances();
      mockVisualViewport(800);
      mockWindowHeight(800);
      render(
        <BottomSheet
          isOpen
          onOpenChange={() => {}}
          label="Release notes"
          snapPoints={SNAP_POINTS}
          height="tall">
          Content
        </BottomSheet>,
      );
      const sheet = getSheet();
      const sheetObserver = observers.find(instance =>
        instance.observed.has(sheet),
      );
      act(() => {
        sheetObserver?.callback(
          // A Tall sheet has 736px visible height in this 800px viewport plus
          // the 48px border-box reserve held below the viewport.
          [resizeEntry(784, 736)],
          sheetObserver as unknown as ResizeObserver,
        );
      });

      fireTimedPointer(getHandle(), 'pointerdown', {time: 0, y: 0});
      fireTimedPointer(getHandle(), 'pointermove', {time: 1000, y: 240});

      expect(sheet.style.transform).toBe('translateY(240px)');
      expect(sheet.style.height).toBe('784px');
      expect(sheet.style.transition).toBe('none');

      fireTimedPointer(getHandle(), 'pointerup', {time: 2000, y: 240});
      // Release remains transform-only until the snap finishes.
      // p50 is a visible 400px sheet: 784 - 48 - 400 = 336px offset.
      expect(sheet.style.transform).toBe('translateY(336px)');
      expect(sheet.style.height).toBe('784px');
      expect(sheet.style.transition).toBe('');
      const reconciliationFrames: FrameRequestCallback[] = [];
      vi.mocked(requestAnimationFrame).mockImplementation(callback => {
        reconciliationFrames.push(callback);
        return reconciliationFrames.length;
      });
      fireEvent.transitionEnd(sheet, {propertyName: 'transform'});
      expect(sheet.style.transform).toBe('');
      expect(sheet.style.height).toBe('448px');
      // The transform reset is transition-free so it cannot produce a second
      // fly-in animation after the snap has already reached its destination.
      expect(sheet.style.transition).toBe('none');
      expect(reconciliationFrames.length).toBeGreaterThan(0);
      act(() => reconciliationFrames.splice(0).forEach(frame => frame(0)));
      expect(sheet.style.transition).toBe('');

      // Ignore ResizeObserver frames from the height reconciliation. The
      // next drag must still use the original 784px border-box height.
      act(() => {
        sheetObserver?.callback(
          [resizeEntry(500, 452)],
          sheetObserver as unknown as ResizeObserver,
        );
      });
      fireTimedPointer(getHandle(), 'pointerdown', {time: 3000, y: 240});
      fireTimedPointer(getHandle(), 'pointermove', {time: 4000, y: 140});
      expect(sheet.style.transform).toBe('translateY(236px)');
      expect(sheet.style.height).toBe('784px');
      expect(getBody().style.paddingBlockEnd).toBe('336px');

      // Reversing below the settled point restores the settled height and
      // translates only the distance traveled from that detent. The temporary
      // scroll-preservation inset leaves with the temporary expanded layout.
      fireTimedPointer(getHandle(), 'pointermove', {time: 5000, y: 340});
      expect(sheet.style.transform).toBe('translateY(100px)');
      expect(sheet.style.height).toBe('448px');
      expect(getBody().style.paddingBlockEnd).toBe('');
    });

    it('reconciles the snapped height immediately when transitions are disabled', () => {
      const observers = mockResizeObserverInstances();
      mockVisualViewport(800);
      mockWindowHeight(800);
      render(
        <BottomSheet
          isOpen
          onOpenChange={() => {}}
          label="Release notes"
          snapPoints={SNAP_POINTS}
          height="tall"
          style={{transition: 'none'}}>
          Content
        </BottomSheet>,
      );
      const sheet = getSheet();
      const sheetObserver = observers.find(instance =>
        instance.observed.has(sheet),
      );
      act(() => {
        sheetObserver?.callback(
          [resizeEntry(784, 736)],
          sheetObserver as unknown as ResizeObserver,
        );
      });

      fireTimedPointer(getHandle(), 'pointerdown', {time: 0, y: 0});
      fireTimedPointer(getHandle(), 'pointermove', {time: 1000, y: 240});
      fireTimedPointer(getHandle(), 'pointerup', {time: 2000, y: 240});

      expect(sheet.style.transform).toBe('');
      expect(sheet.style.height).toBe('448px');
    });

    it('restores the maximum height before an upward drag and reconciles at snap', () => {
      const observers = mockResizeObserverInstances();
      mockVisualViewport(800);
      mockWindowHeight(800);
      render(
        <BottomSheet
          isOpen
          onOpenChange={() => {}}
          label="Release notes"
          snapPoints={SNAP_POINTS}
          height="tall">
          Content
        </BottomSheet>,
      );
      const sheet = getSheet();
      const sheetObserver = observers.find(instance =>
        instance.observed.has(sheet),
      );
      act(() => {
        sheetObserver?.callback(
          [resizeEntry(784, 736)],
          sheetObserver as unknown as ResizeObserver,
        );
      });

      // Start at the middle 400px detent.
      fireTimedPointer(getHandle(), 'pointerdown', {time: 0, y: 0});
      fireTimedPointer(getHandle(), 'pointermove', {time: 1000, y: 240});
      fireTimedPointer(getHandle(), 'pointerup', {time: 2000, y: 240});
      fireEvent.transitionEnd(sheet, {propertyName: 'transform'});
      expect(sheet.style.height).toBe('448px');

      // The upward gesture renders the full 784px surface below the viewport
      // and translates it to preserve the visible top edge.
      fireTimedPointer(getHandle(), 'pointerdown', {time: 3000, y: 240});
      fireTimedPointer(getHandle(), 'pointermove', {time: 4000, y: 0});
      expect(sheet.style.transform).toBe('translateY(96px)');
      expect(sheet.style.height).toBe('784px');
      expect(getBody().style.paddingBlockEnd).toBe('336px');

      // Release first animates only the transform, keeping the source layout
      // and scroll range fixed for the entire snap.
      fireTimedPointer(getHandle(), 'pointerup', {time: 5000, y: 0});
      expect(sheet.style.transform).toBe('');
      expect(sheet.style.height).toBe('784px');
      expect(getBody().style.paddingBlockEnd).toBe('336px');

      // At transition end, height and preservation spacing reconcile in one
      // render with the same visible geometry.
      fireEvent.transitionEnd(sheet, {propertyName: 'transform'});
      expect(sheet.style.transform).toBe('');
      expect(sheet.style.height).toBe('');
      expect(getBody().style.paddingBlockEnd).toBe('336px');

      // Once ordinary scrolling brings the content back within its natural
      // range, the retained end padding is no longer needed and is discarded.
      const body = getBody();
      Object.defineProperties(body, {
        clientHeight: {configurable: true, value: 600},
        scrollHeight: {configurable: true, value: 1000},
        scrollTop: {configurable: true, value: 64, writable: true},
      });
      fireEvent.scroll(body);
      expect(body.style.paddingBlockEnd).toBe('');
    });

    it('keeps the settled height stable while dismissing', () => {
      const observers = mockResizeObserverInstances();
      mockVisualViewport(800);
      mockWindowHeight(800);
      render(<ExitHarness snapPoints={SNAP_POINTS} />);
      const sheet = getSheet();
      const sheetObserver = observers.find(instance =>
        instance.observed.has(sheet),
      );
      act(() => {
        sheetObserver?.callback(
          [resizeEntry(784, 736)],
          sheetObserver as unknown as ResizeObserver,
        );
      });

      // First settle at the middle detent.
      fireTimedPointer(getHandle(), 'pointerdown', {time: 0, y: 0});
      fireTimedPointer(getHandle(), 'pointermove', {time: 1000, y: 240});
      fireTimedPointer(getHandle(), 'pointerup', {time: 2000, y: 240});
      fireEvent.transitionEnd(sheet, {propertyName: 'transform'});
      expect(sheet.style.height).toBe('448px');

      // A later dismiss stays transform-only and preserves that settled
      // scroll-area height throughout the exit.
      fireTimedPointer(getHandle(), 'pointerdown', {time: 3000, y: 240});
      fireTimedPointer(getHandle(), 'pointermove', {time: 4000, y: 1000});
      expect(sheet.style.transform).toBe('translateY(760px)');
      expect(sheet.style.height).toBe('448px');
      fireTimedPointer(getHandle(), 'pointerup', {time: 5000, y: 1000});
      expect(sheet.style.height).toBe('448px');

      act(() => {
        sheetObserver?.callback(
          [resizeEntry(200, 152)],
          sheetObserver as unknown as ResizeObserver,
        );
      });
      expect(sheet.style.height).toBe('448px');
    });

    it('re-resolves the settled detent when the window resizes', () => {
      const observers = mockResizeObserverInstances();
      mockVisualViewport(800);
      mockWindowHeight(800);
      render(
        <BottomSheet
          isOpen
          onOpenChange={() => {}}
          label="Release notes"
          snapPoints={SNAP_POINTS}
          height="tall">
          Content
        </BottomSheet>,
      );
      const sheet = getSheet();
      const sheetObserver = observers.find(instance =>
        instance.observed.has(sheet),
      );
      act(() => {
        sheetObserver?.callback(
          [resizeEntry(784, 736)],
          sheetObserver as unknown as ResizeObserver,
        );
      });

      // Settle on the half-height detent: 784 - 48 - 400 = 336px of travel.
      fireTimedPointer(getHandle(), 'pointerdown', {time: 0, y: 0});
      fireTimedPointer(getHandle(), 'pointermove', {time: 1000, y: 336});
      fireTimedPointer(getHandle(), 'pointerup', {time: 2000, y: 336});
      const reconciliationFrames: FrameRequestCallback[] = [];
      vi.mocked(requestAnimationFrame).mockImplementation(callback => {
        reconciliationFrames.push(callback);
        return reconciliationFrames.length;
      });
      fireEvent.transitionEnd(sheet, {propertyName: 'transform'});
      act(() => reconciliationFrames.splice(0).forEach(frame => frame(0)));
      // 448px of layout height shows 400px of sheet: half the 800px window.
      expect(sheet.style.height).toBe('448px');

      // Shrink the window. The sheet's budget is `92dvh`, so its border box
      // follows: 0.92 * 600 + the 48px reserve = 600px.
      vi.spyOn(sheet, 'getBoundingClientRect').mockImplementation(() =>
        rect({
          top: 0,
          bottom: sheet.style.height
            ? Number.parseFloat(sheet.style.height)
            : 600,
        }),
      );
      mockWindowHeight(600);
      act(() => {
        window.dispatchEvent(new Event('resize'));
      });

      // Still the half-height detent, re-resolved against the new window:
      // 348px of layout height shows 300px, half of 600. Before this, the
      // sheet kept its 448px and showed 400px — three quarters of the window.
      expect(sheet.style.height).toBe('348px');
      expect(sheet.style.transform).toBe('');
      // Re-anchoring is not a gesture, so it does not animate.
      expect(sheet.style.transition).toBe('none');
      act(() => reconciliationFrames.splice(0).forEach(frame => frame(0)));
      expect(sheet.style.transition).toBe('');
    });

    it('keeps its detents when the keyboard shrinks the visual viewport', () => {
      const observers = mockResizeObserverInstances();
      const viewport = mockVisualViewport(800);
      mockWindowHeight(800);
      render(
        <BottomSheet
          isOpen
          onOpenChange={() => {}}
          label="Release notes"
          snapPoints={SNAP_POINTS}
          height="tall">
          Content
        </BottomSheet>,
      );
      const sheet = getSheet();
      const sheetObserver = observers.find(instance =>
        instance.observed.has(sheet),
      );
      act(() => {
        sheetObserver?.callback(
          [resizeEntry(784, 736)],
          sheetObserver as unknown as ResizeObserver,
        );
      });

      fireTimedPointer(getHandle(), 'pointerdown', {time: 0, y: 0});
      fireTimedPointer(getHandle(), 'pointermove', {time: 1000, y: 336});
      fireTimedPointer(getHandle(), 'pointerup', {time: 2000, y: 336});
      fireEvent.transitionEnd(sheet, {propertyName: 'transform'});
      expect(sheet.style.height).toBe('448px');

      // The keyboard opens: the visual viewport shrinks, the layout viewport
      // the sheet is measured in does not.
      act(() => {
        viewport.height = 500;
        viewport.dispatchEvent(new Event('resize'));
      });
      expect(sheet.style.height).toBe('448px');

      // The next drag still snaps to the window's detents, not to fractions
      // of the space the keyboard left over.
      fireTimedPointer(getHandle(), 'pointerdown', {time: 3000, y: 0});
      fireTimedPointer(getHandle(), 'pointermove', {time: 4000, y: 288});
      fireTimedPointer(getHandle(), 'pointerup', {time: 5000, y: 288});
      // The peek of an 800px window: 736 - 112 = 624px of travel.
      expect(sheet.style.transform).toBe('translateY(624px)');
    });
  });

  describe('snapPoints', () => {
    // A Tall sheet in an 800px window: a 784px border box, 48px of which is
    // the reserve below the fold, so 736px of it is visible.
    function renderTallSheet(
      snapPoints?: ReadonlyArray<number | string>,
      onOpenChange: (isOpen: boolean) => void = () => {},
    ) {
      const observers = mockResizeObserverInstances();
      mockVisualViewport(800);
      mockWindowHeight(800);
      const view = render(
        <BottomSheet
          isOpen
          onOpenChange={onOpenChange}
          label="Release notes"
          snapPoints={snapPoints}
          height="tall">
          Content
        </BottomSheet>,
      );
      const sheet = getSheet();
      const sheetObserver = observers.find(instance =>
        instance.observed.has(sheet),
      );
      act(() => {
        sheetObserver?.callback(
          [resizeEntry(784, 736)],
          sheetObserver as unknown as ResizeObserver,
        );
      });
      return {sheet, view};
    }

    function dragHandleTo(y: number) {
      fireTimedPointer(getHandle(), 'pointerdown', {time: 0, y: 0});
      fireTimedPointer(getHandle(), 'pointermove', {time: 1000, y});
      fireTimedPointer(getHandle(), 'pointerup', {time: 2000, y});
      fireEvent.transitionEnd(getSheet(), {propertyName: 'transform'});
    }

    it('has no stops of its own, so a released drag springs back', () => {
      const onOpenChange = vi.fn();
      const {sheet} = renderTallSheet(undefined, onOpenChange);

      // 200px down is well short of the dismiss threshold, and there is no
      // stop to catch it, so the sheet returns to fully open.
      dragHandleTo(200);

      expect(sheet.style.transform).toBe('');
      expect(sheet.style.height).toBe('');
      expect(onOpenChange).not.toHaveBeenCalled();
    });

    it('rests at a stop given as a fraction of the viewport', () => {
      const {sheet} = renderTallSheet([0.5]);

      // Half of the 800px window is 400px of visible sheet: 736 - 400 = 336px
      // of travel, taken as layout height once the snap lands.
      dragHandleTo(336);

      expect(sheet.style.height).toBe('448px');
      expect(sheet.style.transform).toBe('');
    });

    it('reads a percentage as the same stop as the fraction', () => {
      const {sheet} = renderTallSheet(['50%']);
      dragHandleTo(336);
      expect(sheet.style.height).toBe('448px');
    });

    it('rests at a stop given as an absolute px length', () => {
      const {sheet} = renderTallSheet(['320px']);

      // A 320px stop sits 736 - 320 = 416px down, whatever the window does.
      dragHandleTo(416);

      expect(sheet.style.height).toBe('368px');
      expect(sheet.style.transform).toBe('');
    });

    it('re-anchors to the same stop when the points change under a resting sheet', () => {
      const {sheet, view} = renderTallSheet([0.5]);
      dragHandleTo(336);
      expect(sheet.style.height).toBe('448px');

      // Without an inline height the sheet renders its natural 92dvh budget.
      vi.spyOn(sheet, 'getBoundingClientRect').mockImplementation(() =>
        rect({
          top: 0,
          bottom: sheet.style.height
            ? Number.parseFloat(sheet.style.height)
            : 784,
        }),
      );

      // The host moves its one stop from half the window to a quarter of it.
      // The sheet is resting on that stop, so it follows — no gesture, and
      // nothing to animate.
      view.rerender(
        <BottomSheet
          isOpen
          onOpenChange={() => {}}
          label="Release notes"
          snapPoints={[0.25]}
          height="tall">
          Content
        </BottomSheet>,
      );

      // 200px of visible sheet is 736 - 200 = 536px of travel.
      expect(sheet.style.height).toBe('248px');
      expect(sheet.style.transform).toBe('');
    });

    it('ignores a stop it cannot resolve, and warns which one', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      // 200 is the px mistake: a bare number is a fraction, never a length.
      const {sheet} = renderTallSheet([0.5, 200]);

      expect(
        warn.mock.calls.some(args => String(args[0]).includes('200')),
      ).toBe(true);

      // The stop it could read still works.
      dragHandleTo(336);
      expect(sheet.style.height).toBe('448px');
      warn.mockRestore();
    });
  });

  describe('mobile keyboard', () => {
    it('claims a transition between fields and delivers it with preventScroll', () => {
      mockIOSWebKit();
      render(
        <BottomSheet
          isOpen
          onOpenChange={() => {}}
          label="Add a comment"
          height="tall">
          <input aria-label="Title" />
          <input aria-label="Comment" />
        </BottomSheet>,
      );
      const title = screen.getByRole('textbox', {name: 'Title'});
      const comment = screen.getByRole('textbox', {name: 'Comment'});
      title.focus();
      const focus = vi.spyOn(comment, 'focus');

      // The keyboard's Next, Tab, and a programmatic focus() all arrive as this
      // one transition, named by relatedTarget on the outgoing blur.
      fireEvent.blur(title, {relatedTarget: comment});

      // Delivered by us, with the browser's reveal refused.
      expect(focus).toHaveBeenCalledWith({preventScroll: true});
    });

    it('does not park focus on a sheet that is closing', () => {
      mockIOSWebKit();
      const content = (isOpen: boolean) => (
        <BottomSheet
          isOpen={isOpen}
          onOpenChange={() => {}}
          label="Add a comment"
          height="tall">
          <input aria-label="Comment" />
        </BottomSheet>
      );
      const {rerender} = render(content(true));
      const sheet = getSheet();
      const input = screen.getByRole('textbox', {name: 'Comment'});
      input.focus();
      const sheetFocus = vi.spyOn(sheet, 'focus');

      // Closing blurs the field as well, and that blur names no destination —
      // the same shape as Done. There is no next tap to keep claimable here,
      // and the host is about to hand focus back to whatever opened the sheet.
      void act(() => rerender(content(false)));

      expect(sheetFocus).not.toHaveBeenCalled();
    });

    it('autofocuses a field without letting the browser reveal it', () => {
      mockIOSWebKit();
      const focus = vi.spyOn(HTMLInputElement.prototype, 'focus');
      render(
        <BottomSheet
          isOpen
          onOpenChange={() => {}}
          label="Add a comment"
          height="tall">
          <input aria-label="Comment" data-autofocus />
        </BottomSheet>,
      );
      // A prototype spy outlives this test unless it is put back by hand.
      const calls = [...focus.mock.calls];
      focus.mockRestore();
      const input = screen.getByRole('textbox', {name: 'Comment'});

      // Opening focuses the field itself, so there is no transition to claim —
      // nothing was focused to blur. The presenting call has to refuse the
      // reveal on its own, or the browser scrolls the page to show a field the
      // sheet was about to show anyway.
      expect(document.activeElement).toBe(input);
      expect(calls).toContainEqual([{preventScroll: true}]);
    });

    it('parks focus on the sheet when the keyboard Done button takes it', () => {
      mockIOSWebKit();
      render(
        <BottomSheet
          isOpen
          onOpenChange={() => {}}
          label="Add a comment"
          height="tall">
          <input aria-label="Comment" />
        </BottomSheet>,
      );
      const sheet = getSheet();
      const input = screen.getByRole('textbox', {name: 'Comment'});
      input.focus();
      const sheetFocus = vi.spyOn(sheet, 'focus');

      // Done dismisses the keyboard and drops focus on the body. Left there,
      // the field is still document.activeElement on the next tap, so no
      // transition fires and the browser reveals it its own way. Parking focus
      // on the sheet keeps the next tap a transition this hook can claim.
      fireEvent.blur(input, {relatedTarget: null});

      expect(sheetFocus).toHaveBeenCalledWith({preventScroll: true});
    });

    it('does not alter ordinary desktop focus when the viewport is unobstructed', () => {
      mockVisualViewport(800);
      mockWindowHeight(800);
      const onFocus = vi.fn();
      render(
        <BottomSheet
          isOpen
          onOpenChange={() => {}}
          label="Add a comment"
          height="tall">
          <input aria-label="Comment" onFocus={onFocus} />
        </BottomSheet>,
      );
      const input = screen.getByRole('textbox', {name: 'Comment'});
      const focus = vi.spyOn(input, 'focus');

      input.focus();

      expect(focus).not.toHaveBeenCalledWith({preventScroll: true});
      expect(onFocus).toHaveBeenCalledTimes(1);
      expect(getBody().style.getPropertyValue('--_sheet-keyboard-inset')).toBe(
        '0px',
      );
    });

    it('keeps Tall geometry fixed while extending and cleaning up its internal scroll range', () => {
      const viewport = mockVisualViewport(500);
      render(
        <BottomSheet
          isOpen
          onOpenChange={() => {}}
          label="Add a comment"
          height="tall">
          <input aria-label="Comment" />
        </BottomSheet>,
      );
      const sheet = getSheet();
      const positioner = getPositioner();
      const body = getBody();
      const input = screen.getByRole('textbox', {name: 'Comment'});
      vi.spyOn(sheet, 'getBoundingClientRect').mockReturnValue(
        rect({top: 0, bottom: 800}),
      );
      vi.spyOn(body, 'getBoundingClientRect').mockReturnValue(
        rect({top: 100, bottom: 800}),
      );
      vi.spyOn(input, 'getBoundingClientRect').mockImplementation(() =>
        rect({
          top: 660 - body.scrollTop,
          bottom: 700 - body.scrollTop,
        }),
      );

      const initialRect = sheet.getBoundingClientRect();

      input.focus();

      expect(sheet.getBoundingClientRect()).toEqual(initialRect);
      expect(sheet.style.height).toBe('');
      expect(sheet.style.getPropertyValue('--_sheet-budget')).toBe('92dvh');
      expect(positioner.style.getPropertyValue('--_sheet-keyboard-lift')).toBe(
        '',
      );
      // 300px keyboard overlap + 48px room for Android suggestion UI.
      expect(body.style.getPropertyValue('--_sheet-keyboard-inset')).toBe(
        '348px',
      );
      // Visible bottom is 500px; preserve the same 48px focus gap.
      expect(body.scrollTop).toBe(248);

      viewport.height = 800;
      void act(() => viewport.dispatchEvent(new Event('resize')));
      expect(body.style.getPropertyValue('--_sheet-keyboard-inset')).toBe(
        '0px',
      );
      expect(sheet.getBoundingClientRect()).toEqual(initialRect);
      expect(sheet.style.height).toBe('');
    });

    it('smoothly scrolls a focused Tall control above the keyboard', () => {
      mockVisualViewport(500);
      render(
        <BottomSheet
          isOpen
          onOpenChange={() => {}}
          label="Add a comment"
          height="tall">
          <input aria-label="Comment" />
        </BottomSheet>,
      );
      const body = getBody();
      const input = screen.getByRole('textbox', {name: 'Comment'});
      const scrollBy = vi.fn((options: ScrollToOptions) => {
        body.scrollTop += options.top ?? 0;
      });
      Object.defineProperty(body, 'scrollBy', {
        configurable: true,
        value: scrollBy,
      });
      vi.spyOn(body, 'getBoundingClientRect').mockReturnValue(
        rect({top: 100, bottom: 800}),
      );
      vi.spyOn(input, 'getBoundingClientRect').mockImplementation(() =>
        rect({
          top: 660 - body.scrollTop,
          bottom: 700 - body.scrollTop,
        }),
      );

      input.focus();

      expect(scrollBy).toHaveBeenCalledWith({top: 248, behavior: 'smooth'});
    });

    it('does not add clearance or scroll when the viewport is unobstructed', () => {
      mockVisualViewport(800);
      mockWindowHeight(800);
      render(
        <BottomSheet
          isOpen
          onOpenChange={() => {}}
          label="Add a comment"
          height="tall">
          <input aria-label="Comment" />
        </BottomSheet>,
      );
      const body = getBody();
      const input = screen.getByRole('textbox', {name: 'Comment'});
      vi.spyOn(body, 'getBoundingClientRect').mockReturnValue(
        rect({top: 100, bottom: 800}),
      );
      vi.spyOn(input, 'getBoundingClientRect').mockReturnValue(
        rect({top: 760, bottom: 790}),
      );

      input.focus();

      expect(body.style.getPropertyValue('--_sheet-keyboard-inset')).toBe(
        '0px',
      );
      expect(body.scrollTop).toBe(0);
    });

    it('does not accommodate the keyboard at a shorter Tall detent', () => {
      mockIOSWebKit();
      const observers = mockResizeObserverInstances();
      const viewport = mockVisualViewport(800);
      mockWindowHeight(800);
      render(
        <BottomSheet
          isOpen
          onOpenChange={() => {}}
          label="Add a comment"
          snapPoints={SNAP_POINTS}
          height="tall">
          <input aria-label="Comment" />
        </BottomSheet>,
      );
      const sheet = getSheet();
      const body = getBody();
      const input = screen.getByRole('textbox', {name: 'Comment'});
      const sheetObserver = observers.find(instance =>
        instance.observed.has(sheet),
      );
      expect(sheetObserver).toBeDefined();
      act(() => {
        sheetObserver?.callback(
          [resizeEntry(784)],
          sheetObserver as unknown as ResizeObserver,
        );
      });

      fireTimedPointer(getHandle(), 'pointerdown', {time: 0, y: 0});
      fireTimedPointer(getHandle(), 'pointermove', {time: 1000, y: 240});
      fireTimedPointer(getHandle(), 'pointerup', {time: 2000, y: 240});
      fireEvent.transitionEnd(sheet, {propertyName: 'transform'});
      // Settled at the p50 detent: 400px of visible sheet plus the 48px
      // border-box reserve held below the viewport.
      expect(sheet.style.transform).toBe('');
      expect(sheet.style.height).toBe('448px');

      vi.spyOn(body, 'getBoundingClientRect').mockReturnValue(
        rect({top: 500, bottom: 1200}),
      );
      vi.spyOn(input, 'getBoundingClientRect').mockReturnValue(
        rect({top: 700, bottom: 740}),
      );
      viewport.height = 500;
      const focus = vi.spyOn(input, 'focus');
      // A transition the browser would drive: at a shorter detent the hook
      // must not claim it, so nothing focuses the field but the caller.
      fireEvent.blur(sheet, {relatedTarget: input});
      expect(focus).not.toHaveBeenCalled();

      focus.mockRestore();
      input.focus();
      void act(() => viewport.dispatchEvent(new Event('resize')));

      expect(body.style.getPropertyValue('--_sheet-keyboard-inset')).toBe(
        '0px',
      );
      expect(body.scrollTop).toBe(0);
      // The keyboard moved nothing: the sheet still rests at that detent.
      expect(sheet.style.transform).toBe('');
      expect(sheet.style.height).toBe('448px');
    });

    it.each([
      ['Hug', 'hug'],
      ['Capped', 'capped'],
      ['numeric', 480],
      ['custom CSS', '70dvh'],
    ] as const)(
      'does not add keyboard behavior to a %s height',
      (_label, height) => {
        mockIOSWebKit();
        const viewport = mockVisualViewport(500);
        render(
          <BottomSheet
            isOpen
            onOpenChange={() => {}}
            label="Add a comment"
            height={height}>
            <input aria-label="Comment" />
          </BottomSheet>,
        );
        const sheet = getSheet();
        const positioner = getPositioner();
        const body = getBody();
        const input = screen.getByRole('textbox', {name: 'Comment'});
        const focus = vi.spyOn(input, 'focus');
        const sheetFocus = vi.spyOn(sheet, 'focus');
        vi.spyOn(body, 'getBoundingClientRect').mockReturnValue(
          rect({top: 400, bottom: 800}),
        );
        vi.spyOn(input, 'getBoundingClientRect').mockReturnValue(
          rect({top: 700, bottom: 740}),
        );
        body.scrollTop = 20;

        fireEvent.touchStart(input);
        // These heights opt out, so a browser-driven transition is left alone.
        fireEvent.blur(sheet, {relatedTarget: input});
        fireEvent.pointerDown(input, {pointerId: 1, clientY: 200});
        body.scrollTop = 120;
        fireEvent.focus(input, {relatedTarget: null});
        void act(() => viewport.dispatchEvent(new Event('resize')));

        expect(body.scrollTop).toBe(120);
        expect(focus).not.toHaveBeenCalled();
        expect(sheetFocus).not.toHaveBeenCalled();
        expect(body.style.getPropertyValue('--_sheet-keyboard-inset')).toBe('');
        expect(
          positioner.style.getPropertyValue('--_sheet-keyboard-lift'),
        ).toBe('');
        expect(sheet.style.height).toBe('');
      },
    );

    it.each([
      ['standalone no-scrim', 'standalone', false],
      ['modal switcher', 'switcher', true],
      ['no-scrim switcher', 'switcher', false],
    ] as const)(
      'supports Tall internal keyboard scrolling in a %s presentation',
      (_label, host, hasScrim) => {
        mockVisualViewport(500);
        const content = <input aria-label="Comment" />;
        const result =
          host === 'standalone'
            ? render(
                <BottomSheet
                  isOpen
                  onOpenChange={() => {}}
                  label="Add a comment"
                  height="tall"
                  hasScrim={hasScrim}>
                  {content}
                </BottomSheet>,
              )
            : render(
                <BottomSheetSwitcher
                  activeSheet="comment"
                  onActiveSheetChange={() => {}}
                  hasScrim={hasScrim}>
                  <BottomSheet
                    sheetId="comment"
                    label="Add a comment"
                    height="tall">
                    {content}
                  </BottomSheet>
                </BottomSheetSwitcher>,
              );
        const body = getBody();
        const input = screen.getByRole('textbox', {name: 'Comment'});
        vi.spyOn(body, 'getBoundingClientRect').mockReturnValue(
          rect({top: 100, bottom: 800}),
        );
        vi.spyOn(input, 'getBoundingClientRect').mockImplementation(() =>
          rect({
            top: 660 - body.scrollTop,
            bottom: 700 - body.scrollTop,
          }),
        );

        input.focus();

        expect(body.style.getPropertyValue('--_sheet-keyboard-inset')).toBe(
          '348px',
        );
        expect(body.scrollTop).toBe(248);
        result.unmount();
      },
    );

    it('re-reveals a focused Tall control when content layout changes', () => {
      const observers = mockResizeObserverInstances();
      mockVisualViewport(500);
      render(
        <BottomSheet
          isOpen
          onOpenChange={() => {}}
          label="Add a comment"
          height="tall">
          <input aria-label="Comment" />
        </BottomSheet>,
      );
      const body = getBody();
      const input = screen.getByRole('textbox', {name: 'Comment'});
      let layoutShift = 0;
      vi.spyOn(body, 'getBoundingClientRect').mockReturnValue(
        rect({top: 100, bottom: 800}),
      );
      vi.spyOn(input, 'getBoundingClientRect').mockImplementation(() =>
        rect({
          top: 660 + layoutShift - body.scrollTop,
          bottom: 700 + layoutShift - body.scrollTop,
        }),
      );

      input.focus();
      expect(body.scrollTop).toBe(248);

      layoutShift = 200;
      const observer = observers.find(instance => instance.observed.has(input));
      expect(observer).toBeDefined();
      act(() => {
        observer?.callback([], observer as unknown as ResizeObserver);
      });

      expect(body.scrollTop).toBe(448);
    });

    it('retains Tall keyboard scroll space during travel until the viewport recovers', () => {
      const viewport = mockVisualViewport(500);
      render(
        <BottomSheet
          isOpen
          onOpenChange={() => {}}
          label="Add a comment"
          height="tall">
          <input aria-label="Comment" />
        </BottomSheet>,
      );
      const sheet = getSheet();
      const positioner = getPositioner();
      const body = getBody();
      const input = screen.getByRole('textbox', {name: 'Comment'});
      vi.spyOn(sheet, 'getBoundingClientRect').mockReturnValue(
        rect({top: 0, bottom: 800}),
      );
      vi.spyOn(body, 'getBoundingClientRect').mockReturnValue(
        rect({top: 100, bottom: 800}),
      );
      vi.spyOn(input, 'getBoundingClientRect').mockImplementation(() =>
        rect({
          top: 660 - body.scrollTop,
          bottom: 700 - body.scrollTop,
        }),
      );

      input.focus();
      expect(body.scrollTop).toBe(248);
      expect(body.style.getPropertyValue('--_sheet-keyboard-inset')).toBe(
        '348px',
      );

      const pointerDownAllowed = fireEvent.pointerDown(getHandle(), {
        pointerId: 1,
        clientY: 0,
        button: 0,
        isPrimary: true,
      });
      expect(pointerDownAllowed).toBe(false);
      expect(document.activeElement).toBe(input);

      fireEvent.pointerMove(getHandle(), {pointerId: 1, clientY: 40});

      expect(document.activeElement).toBe(sheet);
      expect(positioner.style.getPropertyValue('--_sheet-keyboard-lift')).toBe(
        '',
      );
      expect(body.style.getPropertyValue('--_sheet-keyboard-inset')).toBe(
        '348px',
      );
      expect(body.scrollTop).toBe(248);

      viewport.height = 800;
      void act(() => viewport.dispatchEvent(new Event('resize')));
      expect(body.style.getPropertyValue('--_sheet-keyboard-inset')).toBe(
        '0px',
      );
    });

    it('retains Tall keyboard scroll space after blur until the viewport recovers', () => {
      const viewport = mockVisualViewport(500);
      render(
        <BottomSheet
          isOpen
          onOpenChange={() => {}}
          label="Add a comment"
          height="tall">
          <input aria-label="Comment" />
        </BottomSheet>,
      );
      const body = getBody();
      const input = screen.getByRole('textbox', {name: 'Comment'});
      vi.spyOn(body, 'getBoundingClientRect').mockReturnValue(
        rect({top: 100, bottom: 800}),
      );
      vi.spyOn(input, 'getBoundingClientRect').mockImplementation(() =>
        rect({
          top: 660 - body.scrollTop,
          bottom: 700 - body.scrollTop,
        }),
      );
      input.focus();
      expect(body.style.getPropertyValue('--_sheet-keyboard-inset')).toBe(
        '348px',
      );

      input.blur();

      expect(body.style.getPropertyValue('--_sheet-keyboard-inset')).toBe(
        '348px',
      );

      viewport.height = 800;
      void act(() => viewport.dispatchEvent(new Event('resize')));
      expect(body.style.getPropertyValue('--_sheet-keyboard-inset')).toBe(
        '0px',
      );
    });

    it('blurs the focused Tall field and retains its inset until the viewport recovers', () => {
      const viewport = mockVisualViewport(500);
      const onOpenChange = vi.fn();
      const content = (isOpen: boolean) => (
        <BottomSheet
          isOpen={isOpen}
          onOpenChange={onOpenChange}
          label="Add a comment"
          height="tall">
          <input aria-label="Comment" />
        </BottomSheet>
      );
      const {rerender} = render(content(true));
      const body = getBody();
      const input = screen.getByRole('textbox', {name: 'Comment'});
      vi.spyOn(body, 'getBoundingClientRect').mockReturnValue(
        rect({top: 100, bottom: 800}),
      );
      vi.spyOn(input, 'getBoundingClientRect').mockImplementation(() =>
        rect({
          top: 660 - body.scrollTop,
          bottom: 700 - body.scrollTop,
        }),
      );
      input.focus();
      expect(body.style.getPropertyValue('--_sheet-keyboard-inset')).toBe(
        '348px',
      );

      rerender(content(false));

      expect(document.activeElement).not.toBe(input);
      expect(body.style.getPropertyValue('--_sheet-keyboard-inset')).toBe(
        '348px',
      );

      viewport.height = 800;
      void act(() => viewport.dispatchEvent(new Event('resize')));
      expect(body.style.getPropertyValue('--_sheet-keyboard-inset')).toBe(
        '0px',
      );
    });

    it('retains Tall keyboard scroll space through a switcher handoff until the viewport recovers', () => {
      const viewport = mockVisualViewport(500);
      const content = (activeSheet: string) => (
        <BottomSheetSwitcher
          activeSheet={activeSheet}
          onActiveSheetChange={() => {}}>
          <BottomSheet sheetId="comment" label="Add a comment" height="tall">
            <input aria-label="Comment" />
          </BottomSheet>
          <BottomSheet sheetId="confirmation" label="Confirmation">
            Confirmation
          </BottomSheet>
        </BottomSheetSwitcher>
      );
      const {rerender} = render(content('comment'));
      const body = getBody();
      const input = screen.getByRole('textbox', {name: 'Comment'});
      vi.spyOn(body, 'getBoundingClientRect').mockReturnValue(
        rect({top: 100, bottom: 800}),
      );
      vi.spyOn(input, 'getBoundingClientRect').mockImplementation(() =>
        rect({
          top: 660 - body.scrollTop,
          bottom: 700 - body.scrollTop,
        }),
      );
      input.focus();
      expect(body.style.getPropertyValue('--_sheet-keyboard-inset')).toBe(
        '348px',
      );

      rerender(content('confirmation'));

      expect(document.activeElement).not.toBe(input);
      expect(body.style.getPropertyValue('--_sheet-keyboard-inset')).toBe(
        '348px',
      );

      viewport.height = 800;
      void act(() => viewport.dispatchEvent(new Event('resize')));
      expect(body.style.getPropertyValue('--_sheet-keyboard-inset')).toBe(
        '0px',
      );
    });

    it('puts back a document scroll the browser makes to reveal a field', () => {
      mockVisualViewport(377);
      render(
        <BottomSheet
          isOpen
          onOpenChange={() => {}}
          label="Add a comment"
          height="tall">
          <input aria-label="Comment" />
        </BottomSheet>,
      );
      const body = getBody();
      const input = screen.getByRole('textbox', {name: 'Comment'});
      vi.spyOn(body, 'getBoundingClientRect').mockReturnValue(
        rect({top: 57, bottom: 714}),
      );
      vi.spyOn(input, 'getBoundingClientRect').mockImplementation(() =>
        rect({top: 600 - body.scrollTop, bottom: 640 - body.scrollTop}),
      );
      input.focus();
      const scrollTo = vi.mocked(window.scrollTo);
      scrollTo.mockClear();
      const scrolledBy = body.scrollTop;

      // The page numbers an iPhone 17 produces when the browser reveals a
      // focused field in a scroll-locked, fixed sheet: it scrolls the DOCUMENT,
      // and the sheet — fixed — travels with it.
      Object.defineProperty(window, 'scrollY', {
        configurable: true,
        value: 337,
      });
      fireEvent.scroll(window);

      expect(scrollTo).toHaveBeenCalledWith(0, 0);
      // …and the control is still inside the safe area afterwards: the sheet's
      // own scroller holds it there, so putting the document back does not
      // hide what the browser was trying to reveal.
      expect(input.getBoundingClientRect().bottom).toBeLessThanOrEqual(
        377 - 48,
      );
      expect(body.scrollTop).toBe(scrolledBy);
      Object.defineProperty(window, 'scrollY', {configurable: true, value: 0});
    });

    it('leaves the document alone when no keyboard is measured', () => {
      mockVisualViewport(800);
      render(
        <BottomSheet
          isOpen
          onOpenChange={() => {}}
          label="Add a comment"
          height="tall">
          <input aria-label="Comment" />
        </BottomSheet>,
      );
      const body = getBody();
      const input = screen.getByRole('textbox', {name: 'Comment'});
      vi.spyOn(body, 'getBoundingClientRect').mockReturnValue(
        rect({top: 57, bottom: 700}),
      );
      vi.spyOn(input, 'getBoundingClientRect').mockReturnValue(
        rect({top: 600, bottom: 640}),
      );
      input.focus();
      const scrollTo = vi.mocked(window.scrollTo);
      scrollTo.mockClear();

      // An ordinary page scroll with no keyboard up is the user's, not the
      // browser's, and a non-modal sheet leaves the page scrollable.
      Object.defineProperty(window, 'scrollY', {
        configurable: true,
        value: 120,
      });
      fireEvent.scroll(window);

      expect(scrollTo).not.toHaveBeenCalled();
      Object.defineProperty(window, 'scrollY', {configurable: true, value: 0});
    });

    it('delivers a browser-driven transition itself, then reveals the field', () => {
      mockIOSWebKit();
      mockVisualViewport(500);
      render(
        <BottomSheet
          isOpen
          onOpenChange={() => {}}
          label="Add a comment"
          height="tall">
          <input aria-label="Title" />
          <input aria-label="Comment" />
        </BottomSheet>,
      );
      const body = getBody();
      const title = screen.getByRole('textbox', {name: 'Title'});
      const comment = screen.getByRole('textbox', {name: 'Comment'});
      const scrolls: {
        top: number;
        behavior?: ScrollBehavior;
        focusLanded: boolean;
      }[] = [];
      Object.defineProperty(body, 'scrollBy', {
        configurable: true,
        value: (options: ScrollToOptions) => {
          body.scrollTop += options.top ?? 0;
          scrolls.push({
            top: options.top ?? 0,
            behavior: options.behavior,
            focusLanded: document.activeElement === comment,
          });
        },
      });
      vi.spyOn(body, 'getBoundingClientRect').mockReturnValue(
        rect({top: 100, bottom: 800}),
      );
      vi.spyOn(title, 'getBoundingClientRect').mockImplementation(() =>
        rect({top: 150 - body.scrollTop, bottom: 190 - body.scrollTop}),
      );
      vi.spyOn(comment, 'getBoundingClientRect').mockImplementation(() =>
        rect({top: 660 - body.scrollTop, bottom: 700 - body.scrollTop}),
      );

      // The first field opens the keyboard and is already inside the safe
      // area, so nothing has to move for it.
      title.focus();
      expect(body.style.getPropertyValue('--_sheet-keyboard-inset')).toBe(
        '348px',
      );
      expect(scrolls).toEqual([]);

      // A keyboard accessory "Next" or a Tab arrives as a blur naming the
      // destination. We deliver that focus with preventScroll — refusing the
      // browser's reveal — and then reveal the field ourselves, inside the
      // sheet.
      fireEvent.blur(title, {relatedTarget: comment});

      expect(document.activeElement).toBe(comment);
      expect(scrolls).toEqual([
        {top: 248, behavior: 'smooth', focusLanded: true},
      ]);
      expect(body.scrollTop).toBe(248);
    });

    it('does not scroll a browser-driven transition when the viewport is unobstructed', () => {
      mockIOSWebKit();
      mockVisualViewport(800);
      render(
        <BottomSheet
          isOpen
          onOpenChange={() => {}}
          label="Add a comment"
          height="tall">
          <input aria-label="Title" />
          <input aria-label="Comment" />
        </BottomSheet>,
      );
      const body = getBody();
      const title = screen.getByRole('textbox', {name: 'Title'});
      const comment = screen.getByRole('textbox', {name: 'Comment'});
      const scrolls: number[] = [];
      Object.defineProperty(body, 'scrollBy', {
        configurable: true,
        // Apply the scroll, as the real scroller would: a reveal that has
        // already happened must read as no distance left to travel, otherwise
        // every later reveal looks like a fresh one.
        value: (options: ScrollToOptions) => {
          body.scrollTop += options.top ?? 0;
          scrolls.push(options.top ?? 0);
        },
      });
      vi.spyOn(body, 'getBoundingClientRect').mockReturnValue(
        rect({top: 100, bottom: 800}),
      );
      vi.spyOn(title, 'getBoundingClientRect').mockReturnValue(
        rect({top: 150, bottom: 190}),
      );
      // Below the body's visible area, so a reveal has somewhere to travel.
      vi.spyOn(comment, 'getBoundingClientRect').mockImplementation(() =>
        rect({top: 860 - body.scrollTop, bottom: 900 - body.scrollTop}),
      );

      title.focus();
      scrolls.length = 0;
      const scrollTo = vi.mocked(window.scrollTo);
      scrollTo.mockClear();
      fireEvent.blur(title, {relatedTarget: comment});

      // With no keyboard there is no clearance to leave and nothing to race,
      // but the control still has to end up visible — brought there once, by
      // the sheet's own scroller, with the page left alone.
      expect(scrolls).toEqual([100]);
      expect(scrollTo).not.toHaveBeenCalled();
    });

    it('leaves the page alone behind a non-modal sheet', () => {
      const layoutBottom = window.innerHeight;
      mockVisualViewport(500);
      render(
        <BottomSheet
          isOpen
          onOpenChange={() => {}}
          label="Add a comment"
          height="tall"
          hasScrim={false}>
          <input aria-label="Comment" />
        </BottomSheet>,
      );
      const body = getBody();
      const input = screen.getByRole('textbox', {name: 'Comment'});
      vi.spyOn(body, 'getBoundingClientRect').mockReturnValue(
        rect({top: 100, bottom: layoutBottom}),
      );
      vi.spyOn(input, 'getBoundingClientRect').mockImplementation(() =>
        rect({top: 600 - body.scrollTop, bottom: 640 - body.scrollTop}),
      );
      input.focus();
      const scrollTo = vi.mocked(window.scrollTo);
      scrollTo.mockClear();

      // Without a scrim the page behind stays scrollable, so a document scroll
      // is the user's. Putting it back would fight them.
      Object.defineProperty(window, 'scrollY', {
        configurable: true,
        value: 200,
      });
      fireEvent.scroll(window);

      expect(scrollTo).not.toHaveBeenCalled();
      Object.defineProperty(window, 'scrollY', {configurable: true, value: 0});
    });

    it('holds the keyboard scroll range through a pan, on the blur path', () => {
      // A fully expanded Tall sheet — the only shape this hook runs in — is
      // pinned to the layout viewport bottom, so the body's bottom IS
      // innerHeight. Giving it a cushion below that would hide every bug in
      // this file: the cushion, not the measurement, would keep the overlap
      // positive under a pan.
      const layoutBottom = window.innerHeight;
      const viewport = mockVisualViewport(500);
      render(
        <BottomSheet
          isOpen
          onOpenChange={() => {}}
          label="Add a comment"
          height="tall">
          <input aria-label="Comment" />
        </BottomSheet>,
      );
      const body = getBody();
      const input = screen.getByRole('textbox', {name: 'Comment'});
      vi.spyOn(body, 'getBoundingClientRect').mockReturnValue(
        rect({top: 100, bottom: layoutBottom}),
      );
      vi.spyOn(input, 'getBoundingClientRect').mockImplementation(() =>
        rect({top: 660 - body.scrollTop, bottom: 700 - body.scrollTop}),
      );
      input.focus();
      const inset = body.style.getPropertyValue('--_sheet-keyboard-inset');
      expect(inset).toBe(`${layoutBottom - (500 - 48)}px`);

      // The browser pans the page up to reveal a field: the same 500px of
      // visible page, now offset so its bottom edge coincides with the layout
      // viewport bottom — with the keyboard still on screen. Read the bottom
      // and that is indistinguishable from the keyboard closing.
      viewport.offsetTop = window.innerHeight - 500;
      input.blur();

      // The keyboard did not change size, so neither does the scroll range.
      expect(body.style.getPropertyValue('--_sheet-keyboard-inset')).toBe(
        inset,
      );
    });

    it('keeps defending a pinned sheet after the browser has panned it once', () => {
      // The regression that made the device symptom permanent: one pan read as
      // "no keyboard" cleared the inset AND cleared hasKeyboardLayout, which
      // disarms the head start below — so every subsequent reveal panned, and
      // the sheet never recovered.
      const layoutBottom = window.innerHeight;
      mockIOSWebKit();
      const viewport = mockVisualViewport(500);
      render(
        <BottomSheet
          isOpen
          onOpenChange={() => {}}
          label="Add a comment"
          height="tall">
          <input aria-label="Title" />
          <input aria-label="Comment" />
        </BottomSheet>,
      );
      const body = getBody();
      const title = screen.getByRole('textbox', {name: 'Title'});
      const comment = screen.getByRole('textbox', {name: 'Comment'});
      const scrolls: {top: number; focusLanded: boolean}[] = [];
      Object.defineProperty(body, 'scrollBy', {
        configurable: true,
        value: (options: ScrollToOptions) => {
          body.scrollTop += options.top ?? 0;
          scrolls.push({
            top: options.top ?? 0,
            focusLanded: document.activeElement === comment,
          });
        },
      });
      vi.spyOn(body, 'getBoundingClientRect').mockReturnValue(
        rect({top: 100, bottom: layoutBottom}),
      );
      vi.spyOn(title, 'getBoundingClientRect').mockReturnValue(
        rect({top: 150, bottom: 190}),
      );
      vi.spyOn(comment, 'getBoundingClientRect').mockImplementation(() =>
        rect({top: 700 - body.scrollTop, bottom: 740 - body.scrollTop}),
      );

      title.focus();
      const inset = body.style.getPropertyValue('--_sheet-keyboard-inset');
      expect(inset).toBe(`${layoutBottom - (500 - 48)}px`);

      viewport.offsetTop = layoutBottom - 500;
      void act(() => viewport.dispatchEvent(new Event('resize')));
      expect(body.style.getPropertyValue('--_sheet-keyboard-inset')).toBe(
        inset,
      );

      // And the next browser-driven transition is still claimed and revealed,
      // by a distance measured against the unshifted keyboard boundary.
      scrolls.length = 0;
      fireEvent.blur(title, {relatedTarget: comment});

      expect(document.activeElement).toBe(comment);
      expect(scrolls[0]).toEqual({
        top: 740 - (500 - 48),
        focusLanded: true,
      });
    });
  });

  describe('focus restore', () => {
    function Harness() {
      const [isOpen, setIsOpen] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setIsOpen(true)}>
            Open sheet
          </button>
          <BottomSheet isOpen={isOpen} onOpenChange={setIsOpen} label="Filters">
            <button type="button" onClick={() => setIsOpen(false)}>
              Done
            </button>
          </BottomSheet>
        </>
      );
    }

    it('restores focus to the opener after close', () => {
      render(<Harness />);
      const opener = screen.getByRole('button', {name: 'Open sheet'});
      opener.focus();
      fireEvent.click(opener);
      fireEvent.click(screen.getByRole('button', {name: 'Done'}));
      finishSheetExit();

      expect(document.activeElement).toBe(opener);
    });

    it('prefers an explicit final focus target', () => {
      const finalFocusRef = createRef<HTMLButtonElement>();
      function ExplicitFocusHarness() {
        const [isOpen, setIsOpen] = useState(true);
        return (
          <>
            <button ref={finalFocusRef} type="button">
              Adaptive trigger
            </button>
            <BottomSheet
              isOpen={isOpen}
              onOpenChange={setIsOpen}
              finalFocusRef={finalFocusRef}
              label="Filters">
              <button type="button" onClick={() => setIsOpen(false)}>
                Done
              </button>
            </BottomSheet>
          </>
        );
      }

      render(<ExplicitFocusHarness />);
      fireEvent.click(screen.getByRole('button', {name: 'Done'}));
      finishSheetExit();

      expect(document.activeElement).toBe(finalFocusRef.current);
    });

    // The returned focus shows the focus-visible ring only after keyboard
    // input (`architecture:interaction-modality` INV1). A plain focus() leaves
    // that to the browser, which rings it after a pointer close: WebKit after
    // a tap, and Chromium when the sheet was opened from the keyboard.
    describe('ring on the returned focus', () => {
      beforeEach(() => {
        __resetInteractionModalityForTest();
      });

      afterEach(() => {
        vi.restoreAllMocks();
      });

      function openThenClose(closeWith: 'pointer' | 'keyboard') {
        render(<Harness />);
        const opener = screen.getByRole('button', {name: 'Open sheet'});
        opener.focus();
        fireEvent.click(opener);
        const done = screen.getByRole('button', {name: 'Done'});
        if (closeWith === 'pointer') {
          fireEvent.pointerDown(done);
        } else {
          fireEvent.keyDown(done, {key: 'Enter'});
        }
        fireEvent.click(done);
        return opener;
      }

      it('asks the browser for no ring after a pointer close', () => {
        const opener = openThenClose('pointer');
        const focus = vi.spyOn(opener, 'focus');
        finishSheetExit();

        expect(opener).toHaveFocus();
        expect(focus.mock.calls).toEqual([[{focusVisible: false}]]);
      });

      it('leaves the ring to the browser after a keyboard close', () => {
        const opener = openThenClose('keyboard');
        const focus = vi.spyOn(opener, 'focus');
        finishSheetExit();

        expect(opener).toHaveFocus();
        expect(focus.mock.calls).toEqual([[]]);
      });

      it('clears a ring the native close already drew before refocusing', () => {
        const opener = openThenClose('pointer');
        // The browser's own dialog close restores focus to the opener, with a
        // ring, before the sheet moves focus, and focusing the focused element
        // changes nothing.
        HTMLDialogElement.prototype.close = vi.fn(function (
          this: HTMLDialogElement,
        ) {
          this.removeAttribute('open');
          opener.focus();
        });
        const matches = HTMLElement.prototype.matches;
        vi.spyOn(HTMLElement.prototype, 'matches').mockImplementation(function (
          this: HTMLElement,
          selector: string,
        ) {
          return selector === ':focus-visible'
            ? this === opener
            : matches.call(this, selector);
        });
        const blur = vi.spyOn(opener, 'blur');
        const focus = vi.spyOn(opener, 'focus');
        finishSheetExit();

        expect(blur).toHaveBeenCalledTimes(1);
        expect(focus.mock.calls.at(-1)).toEqual([{focusVisible: false}]);
        expect(blur.mock.invocationCallOrder[0]).toBeLessThan(
          focus.mock.invocationCallOrder.at(-1) ?? 0,
        );
        expect(opener).toHaveFocus();
      });

      it('asks for no ring on an explicit final focus target too', () => {
        const finalFocusRef = createRef<HTMLButtonElement>();
        function ExplicitFocusHarness() {
          const [isOpen, setIsOpen] = useState(true);
          return (
            <>
              <button ref={finalFocusRef} type="button">
                Adaptive trigger
              </button>
              <BottomSheet
                isOpen={isOpen}
                onOpenChange={setIsOpen}
                finalFocusRef={finalFocusRef}
                label="Filters">
                <button type="button" onClick={() => setIsOpen(false)}>
                  Done
                </button>
              </BottomSheet>
            </>
          );
        }

        render(<ExplicitFocusHarness />);
        const done = screen.getByRole('button', {name: 'Done'});
        fireEvent.pointerDown(done);
        fireEvent.click(done);
        const target = finalFocusRef.current!;
        const focus = vi.spyOn(target, 'focus');
        finishSheetExit();

        expect(target).toHaveFocus();
        expect(focus.mock.calls).toEqual([[{focusVisible: false}]]);
      });
    });
  });

  describe('initial focus', () => {
    it('focuses the sheet panel on open, not the first control', () => {
      render(
        <BottomSheet isOpen onOpenChange={() => {}} label="Filters">
          <button type="button">First action</button>
        </BottomSheet>,
      );
      const panel = getSheet();
      expect(document.activeElement).toBe(panel);
      expect(document.activeElement).not.toBe(
        screen.getByRole('button', {name: 'First action'}),
      );
    });

    it('honors a descendant with data-autofocus', () => {
      render(
        <BottomSheet isOpen onOpenChange={() => {}} label="Filters">
          <input data-autofocus aria-label="Search" />
        </BottomSheet>,
      );
      expect(document.activeElement).toBe(
        screen.getByRole('textbox', {name: 'Search'}),
      );
    });
  });

  describe('accessible name', () => {
    it('warns in development when label is empty', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      render(
        <BottomSheet isOpen onOpenChange={() => {}} label="">
          Content
        </BottomSheet>,
      );
      expect(
        warn.mock.calls.some(args => String(args[0]).includes('BottomSheet')),
      ).toBe(true);
      warn.mockRestore();
    });
  });

  describe('reduced motion', () => {
    it('opens without throwing when prefers-reduced-motion is set', () => {
      vi.stubGlobal(
        'matchMedia',
        vi.fn().mockReturnValue({
          matches: true,
          media: '(prefers-reduced-motion: reduce)',
          onchange: null,
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          addListener: vi.fn(),
          removeListener: vi.fn(),
          dispatchEvent: vi.fn(),
        }),
      );
      render(
        <BottomSheet isOpen onOpenChange={() => {}} label="Filters">
          Content
        </BottomSheet>,
      );
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
  });

  describe('container padding isolation', () => {
    it('resets container padding custom properties to 0px on the sheet panel element', () => {
      render(
        <BottomSheet isOpen onOpenChange={() => {}} label="Filters">
          Content
        </BottomSheet>,
      );
      const sheet = getSheet();
      const computed = window.getComputedStyle(sheet);
      expect(
        computed.getPropertyValue('--container-padding-inline-start'),
      ).toBe('0px');
      expect(computed.getPropertyValue('--container-padding-inline-end')).toBe(
        '0px',
      );
      expect(computed.getPropertyValue('--container-padding-block-start')).toBe(
        '0px',
      );
      expect(computed.getPropertyValue('--container-padding-block-end')).toBe(
        '0px',
      );
    });
  });

  describe('container padding', () => {
    it('passes padding to the content box of a standalone sheet', () => {
      render(
        <BottomSheet isOpen onOpenChange={() => {}} label="Filters" padding={0}>
          <span data-testid="sheet-child">Content</span>
        </BottomSheet>,
      );
      const box = screen.getByTestId('sheet-child').parentElement!;
      expect(
        getComputedStyle(box).getPropertyValue(
          '--container-padding-inline-start',
        ),
      ).toBe('var(--spacing-0)');
      expect(getSheet().hasAttribute('padding')).toBe(false);
    });

    it('passes padding to the content box of a switcher sheet', () => {
      render(
        <BottomSheetSwitcher
          activeSheet="details"
          onActiveSheetChange={() => {}}>
          <BottomSheet sheetId="details" label="Details" padding={2}>
            <span data-testid="switcher-child">Content</span>
          </BottomSheet>
        </BottomSheetSwitcher>,
      );
      const box = screen.getByTestId('switcher-child').parentElement!;
      expect(
        getComputedStyle(box).getPropertyValue(
          '--container-padding-inline-start',
        ),
      ).toBe('var(--spacing-2)');
    });
  });
});

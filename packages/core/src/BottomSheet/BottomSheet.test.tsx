// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file BottomSheet.test.tsx
 * @input Uses vitest, @testing-library/react, BottomSheet component
 * @output Unit tests for BottomSheet behavior and observed content anatomy
 * @position Core testing; validates BottomSheet.tsx implementation
 *
 * SYNC: When BottomSheet.tsx changes, update tests to match new behavior
 */

import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
  onTestFinished,
} from 'vitest';
import {act, cleanup, render, screen, fireEvent} from '@testing-library/react';
import {
  Profiler,
  Suspense,
  createRef,
  startTransition,
  use,
  useState,
  type ReactNode,
} from 'react';
import {BottomSheet} from './BottomSheet';
import {BottomSheetEscapeContext} from './bottomSheetEscape';
import {resetBottomSheetStackForTests} from './bottomSheetStack';
import {BottomSheetSwitcher} from './BottomSheetSwitcher';
import {getFocusableElements} from '../hooks/useFocusTrap';
import {__resetInteractionModalityForTest} from '../utils/interactionModality';
import {__focusTakeoverCallersForTest} from '../keyboard/keyboardHeight';
import {__resetRevealsAtReportForTest} from '../keyboard/useMobileKeyboard';
import {getKeyboardLayoutGuide} from '../keyboard/keyboardLayoutGuide';
import {animatorFor} from '../motion/animator';

// A sheet has no stops unless its host asks for them, so the tests that
// exercise detents pass their own. These three — a 14% peek, a half-height
// stop, and a 92% stop the Tall budget already covers — are the geometry the
// height assertions below are written against.
const SNAP_POINTS: ReadonlyArray<number> = [0.14, 0.5, 0.92];

// jsdom doesn't implement <dialog> open/close or pointer capture; stub them.
beforeEach(() => {
  resetBottomSheetStackForTests();
  HTMLDialogElement.prototype.showModal = vi.fn(function (
    this: HTMLDialogElement,
  ) {
    this.setAttribute('open', '');
  });
  HTMLDialogElement.prototype.show = vi.fn(function (this: HTMLDialogElement) {
    this.setAttribute('open', '');
  });
  // A non-modal sheet is a manual popover; jsdom's stand-ins keep the same
  // `open` marker the dialog paths use (the Drawer tests do the same).
  HTMLElement.prototype.showPopover = vi.fn(function (this: HTMLElement) {
    this.setAttribute('open', '');
  });
  HTMLElement.prototype.hidePopover = vi.fn(function (this: HTMLElement) {
    this.removeAttribute('open');
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
  __resetRevealsAtReportForTest();
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

// A touch platform that measures the keyboard (spec:AST-099 FR6): a visual
// viewport, and no keyboard geometry API of its own. The user agent below no
// longer decides anything; the capability does.
function mockIOSWebKit() {
  if (window.visualViewport == null) {
    mockVisualViewport(window.innerHeight);
  }
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
  mockPrimaryPointer('coarse');
}

// The primary pointer `matchMedia` reports: a touch screen's coarse finger,
// or a desktop's fine mouse.
function mockPrimaryPointer(pointer: 'coarse' | 'fine') {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: query === `(pointer: ${pointer})`,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  );
}

// A touch screen whose user asked for reduced motion.
function mockReducedMotionOnTouch() {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches:
        query === '(pointer: coarse)' ||
        query === '(prefers-reduced-motion: reduce)' ||
        query === '(prefers-reduced-motion: reduce) and (pointer: coarse)',
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  );
}

// A browser with its own keyboard geometry API (navigator.virtualKeyboard).
// Desktop Chrome's visual viewport never shrinks for a keyboard. The module
// measures Chrome on Android from its visual viewport, like every browser.
function mockKeyboardGeometryApi() {
  const navigatorMock = Object.create(window.navigator);
  Object.defineProperty(navigatorMock, 'virtualKeyboard', {
    configurable: true,
    value: {overlaysContent: false},
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

/**
 * Lays a sheet out `height` px tall, as the browser's resize observer would.
 * A touch release lands by the sheet's geometry, so a touch dismissal needs
 * one.
 */
function layOutSheet(
  observers: ResizeObserverRecord[],
  sheet: HTMLElement,
  height = 400,
) {
  const observer = observers.find(instance => instance.observed.has(sheet));
  act(() => {
    observer?.callback(
      [resizeEntry(height)],
      observer as unknown as ResizeObserver,
    );
  });
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
// One clock for the drags: each event comes 16 ms after the one before, so
// a drag's release velocity follows its events' own timestamps.
let dragTime = 0;

function drag(
  handle: HTMLElement,
  points: {y: number}[],
  pointerType: 'mouse' | 'touch' | 'pen' = 'mouse',
) {
  const [down, ...rest] = points;
  const at = (y: number) => {
    dragTime += 16;
    return {time: dragTime, y, pointerType};
  };
  fireTimedPointer(handle, 'pointerdown', at(down.y));
  for (const p of rest) {
    fireTimedPointer(handle, 'pointermove', at(p.y));
  }
  const last = points[points.length - 1];
  fireTimedPointer(handle, 'pointerup', at(last.y));
}

function fireTimedPointer(
  target: Element,
  type: 'pointerdown' | 'pointermove' | 'pointerup',
  {time, y, pointerType}: {time: number; y: number; pointerType?: string},
) {
  const event = new Event(type, {bubbles: true, cancelable: true});
  Object.defineProperties(event, {
    button: {value: 0},
    clientY: {value: y},
    isPrimary: {value: true},
    pointerId: {value: 1},
    timeStamp: {value: time},
  });
  if (pointerType != null) {
    Object.defineProperty(event, 'pointerType', {value: pointerType});
  }
  return fireEvent(target, event);
}

// The room the keyboard takes at the end of a Tall sheet's body, CSS px, or 0
// when the sheet lays out none. The functional style on the body's content box sets
// it as its `::after` box's height.
function keyboardInsetOf(body: HTMLElement): number {
  const content = body.firstElementChild;
  const match = /--[\w-]+:\s*(-?[\d.]+)px/.exec(
    content?.getAttribute('style') ?? '',
  );
  return match == null ? 0 : Number(match[1]);
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
    // With focus elsewhere at the close, the exiting sheet is inert and
    // hidden at once (BottomSheetCloseFocus.test.tsx covers focus inside).
    act(() => (document.activeElement as HTMLElement | null)?.blur());

    fireEvent.click(screen.getByRole('button', {name: 'Close sheet'}));

    expect(dialog).toHaveAttribute('open');
    expect(dialog).toHaveAttribute('inert');
    expect(dialog).toHaveAttribute('aria-hidden', 'true');
    expect(dialog).not.toHaveAttribute('aria-modal');
    expect(dialog).toHaveStyle({'--_sheet-scrim-opacity': '0'});
    expect(document.documentElement.style.overflow).toBe('hidden');

    finishSheetExit();

    expect(dialog).not.toHaveAttribute('open');
    expect(document.documentElement.style.overflow).not.toBe('hidden');
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
    it('opens non-modally: a manual popover instead of showModal(), no aria-modal', () => {
      render(
        <BottomSheet
          isOpen
          onOpenChange={() => {}}
          label="Filters"
          hasScrim={false}>
          Content
        </BottomSheet>,
      );
      // In the top layer as a manual popover (no light dismiss, no backdrop)
      // so sheets order by presentation without a page-level z-index.
      expect(HTMLElement.prototype.showPopover).toHaveBeenCalled();
      expect(HTMLDialogElement.prototype.show).not.toHaveBeenCalled();
      expect(HTMLDialogElement.prototype.showModal).not.toHaveBeenCalled();
      expect(screen.getByRole('dialog')).toHaveAttribute('popover', 'manual');
      expect(screen.getByRole('dialog')).not.toHaveAttribute('aria-modal');
    });

    it('focuses the panel, as show() did, when the browser focuses the popover on show (an engine whose show() lands on the panel container)', () => {
      // Chromium's `show()` focusing steps land on the panel (tabindex -1,
      // no ring); `showPopover()` lands on the first control and draws a
      // ring. The sheet puts focus on the panel so a lone non-modal sheet
      // focuses exactly as it did. The engine is told apart by what its
      // `show()` does: here it focuses the tabindex -1 container.
      const show = HTMLDialogElement.prototype.show;
      HTMLDialogElement.prototype.show = vi.fn(function (
        this: HTMLDialogElement,
      ) {
        this.setAttribute('open', '');
        this.querySelector<HTMLElement>('[tabindex="-1"]')?.focus();
      });
      const showPopover = HTMLElement.prototype.showPopover;
      HTMLElement.prototype.showPopover = vi.fn(function (this: HTMLElement) {
        this.setAttribute('open', '');
        // The popover focusing steps: the autofocus delegate when there is
        // one, else (as Chromium does) the first control.
        (
          this.querySelector<HTMLElement>('[autofocus]') ??
          this.querySelector<HTMLElement>('button')
        )?.focus();
      });
      try {
        const opener = document.createElement('button');
        document.body.appendChild(opener);
        opener.focus();
        const events: string[] = [];
        render(
          <BottomSheet
            isOpen
            onOpenChange={() => {}}
            label="Filters"
            hasScrim={false}>
            <button
              type="button"
              onFocus={() => events.push('focus')}
              onBlur={() => events.push('blur')}>
              First action
            </button>
          </BottomSheet>,
        );
        expect(document.activeElement).toBe(getSheet());
        // The control is never focused on the way to the panel, so a field
        // validating on blur would not fire.
        expect(events).toEqual([]);
        expect(getSheet()).not.toHaveAttribute('autofocus');
        opener.remove();
      } finally {
        HTMLElement.prototype.showPopover = showPopover;
        HTMLDialogElement.prototype.show = show;
      }
    });

    it('measures the engine inside its own dialog, so a first non-modal sheet opened inside an open modal does not cache the wrong answer', () => {
      // A browser moves no focus into a dialog that sits under an open
      // modal's inertness. The stub models that for `show()`: a dialog
      // appended to the body while a modal outside it is open focuses
      // nothing; one inside the modal (or with no modal open) focuses its
      // tabindex -1 container, as Chromium's show() does.
      const show = HTMLDialogElement.prototype.show;
      HTMLDialogElement.prototype.show = vi.fn(function (
        this: HTMLDialogElement,
      ) {
        this.setAttribute('open', '');
        const modal = Array.from(
          document.querySelectorAll<HTMLDialogElement>(
            'dialog[open][aria-modal="true"]',
          ),
        ).find(d => !d.contains(this));
        if (modal != null) {
          return;
        }
        this.querySelector<HTMLElement>('[tabindex="-1"]')?.focus();
      });
      const showPopover = HTMLElement.prototype.showPopover;
      HTMLElement.prototype.showPopover = vi.fn(function (this: HTMLElement) {
        this.setAttribute('open', '');
        (
          this.querySelector<HTMLElement>('[autofocus]') ??
          this.querySelector<HTMLElement>('button')
        )?.focus();
      });
      function App() {
        const [isModalOpen, setIsModalOpen] = useState(true);
        const [isHintOpen, setIsHintOpen] = useState(false);
        const [isLoneOpen, setIsLoneOpen] = useState(false);
        return (
          <>
            <BottomSheet
              isOpen={isModalOpen}
              onOpenChange={setIsModalOpen}
              label="Settings">
              <button type="button" onClick={() => setIsHintOpen(true)}>
                Show hint
              </button>
              <button type="button" onClick={() => setIsModalOpen(false)}>
                Done
              </button>
              <BottomSheet
                isOpen={isHintOpen}
                onOpenChange={setIsHintOpen}
                hasScrim={false}
                label="Hint">
                <button type="button">Got it</button>
              </BottomSheet>
            </BottomSheet>
            <button type="button" onClick={() => setIsLoneOpen(true)}>
              Open filters
            </button>
            <BottomSheet
              isOpen={isLoneOpen}
              onOpenChange={setIsLoneOpen}
              hasScrim={false}
              label="Filters">
              <button type="button">First action</button>
            </BottomSheet>
          </>
        );
      }
      try {
        render(<App />);
        // The first non-modal sheet of the page opens inside the open modal:
        // the engine is measured there, where show() can move focus.
        fireEvent.click(screen.getByRole('button', {name: 'Show hint'}));
        const hint = screen.getByRole('dialog', {name: 'Hint'});
        expect(document.activeElement).toBe(
          hint.querySelector('.astryx-bottom-sheet'),
        );
        fireEvent.click(screen.getByRole('button', {name: 'Done'}));
        // A later lone non-modal sheet focuses as show() would: the panel.
        fireEvent.click(screen.getByRole('button', {name: 'Open filters'}));
        const filters = screen.getByRole('dialog', {name: 'Filters'});
        expect(document.activeElement).toBe(
          filters.querySelector('.astryx-bottom-sheet'),
        );
      } finally {
        HTMLElement.prototype.showPopover = showPopover;
        HTMLDialogElement.prototype.show = show;
      }
    });

    it('leaves focus on the first control, as show() did, in an engine whose show() skips the panel container', () => {
      // Firefox's `show()` and `showPopover()` both land on the first
      // control in the sheet. Nothing is re-targeted, so a lone non-modal
      // sheet focuses as it did with `show()` there too.
      const show = HTMLDialogElement.prototype.show;
      HTMLDialogElement.prototype.show = vi.fn(function (
        this: HTMLDialogElement,
      ) {
        this.setAttribute('open', '');
        this.querySelector<HTMLElement>('button')?.focus();
      });
      const showPopover = HTMLElement.prototype.showPopover;
      HTMLElement.prototype.showPopover = vi.fn(function (this: HTMLElement) {
        this.setAttribute('open', '');
        (
          this.querySelector<HTMLElement>('[autofocus]') ??
          this.querySelector<HTMLElement>('button')
        )?.focus();
      });
      try {
        const opener = document.createElement('button');
        document.body.appendChild(opener);
        opener.focus();
        render(
          <BottomSheet
            isOpen
            onOpenChange={() => {}}
            label="Filters"
            hasScrim={false}>
            <button type="button">First action</button>
          </BottomSheet>,
        );
        expect(document.activeElement).toBe(
          screen.getByRole('button', {name: 'First action'}),
        );
        expect(getSheet()).not.toHaveAttribute('autofocus');
        opener.remove();
      } finally {
        HTMLElement.prototype.showPopover = showPopover;
        HTMLDialogElement.prototype.show = show;
      }
    });

    it('returns focus to its opener on close when the person was still in the sheet', () => {
      const opener = document.createElement('button');
      opener.textContent = 'Open';
      document.body.appendChild(opener);
      opener.focus();
      try {
        render(<ExitHarness hasScrim={false} />);
        // The person moved into the sheet (e.g. tabbed to its control).
        screen.getByRole('button', {name: 'Close sheet'}).focus();
        fireEvent.keyDown(screen.getByRole('dialog'), {key: 'Escape'});
        finishSheetExit();
        expect(screen.getByRole('dialog', {hidden: true})).not.toHaveAttribute(
          'open',
        );
        expect(document.activeElement).toBe(opener);
      } finally {
        opener.remove();
      }
    });

    it('always focuses finalFocusRef on close, even when focus had left the sheet', () => {
      const elsewhere = document.createElement('input');
      const target = document.createElement('button');
      target.textContent = 'Target';
      document.body.append(elsewhere, target);
      const finalFocusRef = {current: target as HTMLElement | null};
      function Harness() {
        const [isOpen, setIsOpen] = useState(true);
        return (
          <>
            <button type="button" onClick={() => setIsOpen(false)}>
              Close from page
            </button>
            <BottomSheet
              isOpen={isOpen}
              onOpenChange={setIsOpen}
              hasScrim={false}
              finalFocusRef={finalFocusRef}
              label="Filters">
              Content
            </BottomSheet>
          </>
        );
      }
      try {
        render(<Harness />);
        // The page stayed live: the person moved on, then a page control
        // closed the sheet. The explicit target still receives focus.
        elsewhere.focus();
        fireEvent.click(screen.getByRole('button', {name: 'Close from page'}));
        finishSheetExit();
        expect(document.activeElement).toBe(target);
      } finally {
        elsewhere.remove();
        target.remove();
      }
    });

    it('leaves focus where the person took it when the sheet closes from the page', () => {
      const opener = document.createElement('button');
      const elsewhere = document.createElement('input');
      document.body.append(opener, elsewhere);
      opener.focus();
      try {
        render(<ExitHarness hasScrim={false} />);
        // The page stayed live: the person moved on, then the sheet closed
        // (a timer, a page control).
        elsewhere.focus();
        fireEvent.click(screen.getByRole('button', {name: 'Close sheet'}));
        finishSheetExit();
        expect(document.activeElement).toBe(elsewhere);
      } finally {
        opener.remove();
        elsewhere.remove();
      }
    });

    it('leaves focus alone when the browser does not move it on show', () => {
      const opener = document.createElement('button');
      document.body.appendChild(opener);
      opener.focus();
      render(
        <BottomSheet
          isOpen
          onOpenChange={() => {}}
          label="Filters"
          hasScrim={false}>
          <button type="button">First action</button>
        </BottomSheet>,
      );
      expect(document.activeElement).toBe(opener);
      opener.remove();
    });

    it('falls back to show() below the Popover API support floor', () => {
      const showPopover = HTMLElement.prototype.showPopover;
      // @ts-expect-error -- emulate a browser without the Popover API
      delete HTMLElement.prototype.showPopover;
      try {
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
      } finally {
        HTMLElement.prototype.showPopover = showPopover;
      }
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
      expect(document.documentElement.style.overflow).not.toBe('hidden');

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
    it("a sheet opened from inside another sheet's content drags to dismiss by its own handle, and the covered host neither drags nor takes the pointer (FR6, FR7)", () => {
      const onInnerOpenChange = vi.fn();
      const onOuterOpenChange = vi.fn();
      const observers = mockResizeObserverInstances();
      render(
        <BottomSheet isOpen onOpenChange={onOuterOpenChange} label="Outer">
          Outer content
          <BottomSheet isOpen onOpenChange={onInnerOpenChange} label="Inner">
            Inner content
          </BottomSheet>
        </BottomSheet>,
      );
      const dialogs = screen.getAllByRole('dialog', {hidden: true});
      expect(dialogs).toHaveLength(2);
      const [outerDialog, innerDialog] = dialogs;
      // The inner sheet's dialog is rendered inside the outer sheet's body,
      // so its events bubble through the outer body's gesture listeners.
      expect(outerDialog.contains(innerDialog)).toBe(true);
      const outerPanel = outerDialog.querySelector<HTMLElement>(
        ':scope > .astryx-bottom-sheet',
      )!;
      const outerBody = outerPanel.querySelector<HTMLElement>(
        ':scope > :not([aria-hidden])',
      )!;
      const innerHandle = innerDialog.querySelector<HTMLElement>(
        '.astryx-bottom-sheet > [aria-hidden="true"]',
      )!;
      layOutSheet(
        observers,
        innerDialog.querySelector<HTMLElement>('.astryx-bottom-sheet')!,
      );
      // `setPointerCapture` is a prototype stub here, so record who captures.
      const captured: Element[] = [];
      const capture = vi
        .spyOn(Element.prototype, 'setPointerCapture')
        .mockImplementation(function (this: Element) {
          captured.push(this);
        });
      drag(innerHandle, [{y: 0}, {y: 40}, {y: 120}], 'touch');
      capture.mockRestore();
      // The inner sheet's own drag ran to its dismissal.
      expect(onInnerOpenChange).toHaveBeenCalledWith(false);
      // The covered host saw the same pointer bubble up and did nothing with
      // it: no drag of its own (its panel keeps its resting transform) and no
      // pointer capture, which would have cancelled the inner handle's drag.
      expect(onOuterOpenChange).not.toHaveBeenCalled();
      expect(captured).toContain(innerHandle);
      expect(captured).not.toContain(outerBody);
      expect(outerPanel.style.transform).toBe('');
    });

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

    it('restores the layout height in the same task as the transform when a drag crosses its detent, without a synchronous render', async () => {
      const observers = mockResizeObserverInstances();
      mockVisualViewport(800);
      mockWindowHeight(800);
      let commits = 0;
      render(
        <Profiler
          id="sheet"
          onRender={() => {
            commits += 1;
          }}>
          <BottomSheet
            isOpen
            onOpenChange={() => {}}
            label="Release notes"
            snapPoints={SNAP_POINTS}
            height="tall">
            Content
          </BottomSheet>
        </Profiler>,
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

      // Rest on p50 (offset 336): the scrolling area gives up 336px of
      // layout height and the sheet carries no transform.
      fireTimedPointer(getHandle(), 'pointerdown', {time: 0, y: 0});
      fireTimedPointer(getHandle(), 'pointermove', {time: 1000, y: 336});
      fireTimedPointer(getHandle(), 'pointerup', {time: 2000, y: 336});
      expect(sheet.style.height).toBe('448px');
      expect(sheet.style.transform).toBe('');

      const replacedNodes: Node[] = [];
      const mutations = new MutationObserver(records => {
        for (const record of records) {
          replacedNodes.push(...record.addedNodes, ...record.removedNodes);
        }
      });
      mutations.observe(sheet, {childList: true, subtree: true});
      fireTimedPointer(getHandle(), 'pointerdown', {time: 3000, y: 336});

      // Each finger sample arrives outside act(), as a browser delivers it:
      // a render React schedules for later is still pending when this task
      // ends, and the browser paints whatever the element holds then.
      const reactGlobals = globalThis as {IS_REACT_ACT_ENVIRONMENT?: boolean};
      const wasActEnvironment = reactGlobals.IS_REACT_ACT_ENVIRONMENT;
      reactGlobals.IS_REACT_ACT_ENVIRONMENT = false;
      const sampleAt = (time: number, y: number) => {
        const event = new Event('pointermove', {bubbles: true});
        Object.defineProperties(event, {
          clientY: {value: y},
          isPrimary: {value: true},
          pointerId: {value: 1},
          timeStamp: {value: time},
        });
        getHandle().dispatchEvent(event);
        return {
          height: sheet.style.height,
          transform: sheet.style.transform,
          inset: getBody().style.paddingBlockEnd,
        };
      };
      let above: {height: string; transform: string; inset: string};
      let below: {height: string; transform: string; inset: string};
      const commitsBeforeCrossing = commits;
      let commitsInCrossingTasks: number;
      try {
        // Up past the detent: the transform is written for the full height
        // (no layout split), so the full height has to be there too.
        above = sampleAt(4000, 136);
        // Back down past it: the split returns with the transform.
        below = sampleAt(5000, 436);
        // React committed nothing inside those input tasks: the elements were
        // written directly, not through a forced synchronous render.
        commitsInCrossingTasks = commits - commitsBeforeCrossing;
      } finally {
        reactGlobals.IS_REACT_ACT_ENVIRONMENT = wasActEnvironment;
      }
      await act(async () => {});

      expect(above.transform).toMatch(/^translateY\(/);
      expect(above.height).toBe('784px');
      // The scrolling area keeps its scroll position across the taller
      // height: its end inset lands with it.
      expect(above.inset).toBe('336px');
      expect(below.transform).toBe('translateY(100px)');
      expect(below.height).toBe('448px');
      expect(below.inset).toBe('');
      expect(commitsInCrossingTasks).toBe(0);
      // The scheduled render caught up to the values already on screen.
      expect(sheet.style.height).toBe('448px');
      expect(sheet.style.transform).toBe('translateY(100px)');
      // Nothing in the sheet was replaced along the way.
      mutations.disconnect();
      expect(replacedNodes).toEqual([]);
    });

    it("rests at the detent's height when the finger lifts in the same task as the move that crossed it", async () => {
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

      // Rest on p50 (offset 336) with the 336px layout split.
      fireTimedPointer(getHandle(), 'pointerdown', {time: 0, y: 0});
      fireTimedPointer(getHandle(), 'pointermove', {time: 1000, y: 336});
      fireTimedPointer(getHandle(), 'pointerup', {time: 2000, y: 336});
      expect(sheet.style.height).toBe('448px');
      fireTimedPointer(getHandle(), 'pointerdown', {time: 3000, y: 336});

      // A 3px nudge up crosses the detent, and the finger lifts before the
      // render that move scheduled has committed: both arrive in one task,
      // outside act(), as a browser can deliver them.
      const reactGlobals = globalThis as {IS_REACT_ACT_ENVIRONMENT?: boolean};
      const wasActEnvironment = reactGlobals.IS_REACT_ACT_ENVIRONMENT;
      reactGlobals.IS_REACT_ACT_ENVIRONMENT = false;
      const dispatch = (
        type: 'pointermove' | 'pointerup',
        time: number,
        y: number,
      ) => {
        const event = new Event(type, {bubbles: true, cancelable: true});
        Object.defineProperties(event, {
          button: {value: 0},
          clientY: {value: y},
          isPrimary: {value: true},
          pointerId: {value: 1},
          timeStamp: {value: time},
        });
        getHandle().dispatchEvent(event);
      };
      let heightAboveDetent: string;
      try {
        dispatch('pointermove', 4000, 333);
        heightAboveDetent = sheet.style.height;
        dispatch('pointerup', 4500, 333);
      } finally {
        reactGlobals.IS_REACT_ACT_ENVIRONMENT = wasActEnvironment;
      }
      await act(async () => {});

      // The crossing move drew the sheet at its full height...
      expect(heightAboveDetent).toBe('784px');
      // ...and at rest it is drawn at p50 again: the split height, no
      // offset, and no end inset left over from the drag.
      expect(sheet.style.height).toBe('448px');
      expect(sheet.style.transform).toBe('');
      expect(getBody().style.paddingBlockEnd).toBe('');
    });

    describe('with a caller-set height', () => {
      // Rests on p50 (offset 336), presses the handle again, and returns the
      // sheet and a dispatcher that delivers pointer events outside act(), as
      // a browser does, so a render React schedules is still pending when
      // each event's task ends.
      function restOnHalfWithCallerHeight() {
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
            style={{height: '500px'}}>
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
        fireTimedPointer(getHandle(), 'pointerdown', {time: 3000, y: 336});
        const outsideAct = (run: (dispatch: typeof dispatchRaw) => void) => {
          const reactGlobals = globalThis as {
            IS_REACT_ACT_ENVIRONMENT?: boolean;
          };
          const wasActEnvironment = reactGlobals.IS_REACT_ACT_ENVIRONMENT;
          reactGlobals.IS_REACT_ACT_ENVIRONMENT = false;
          try {
            run(dispatchRaw);
          } finally {
            reactGlobals.IS_REACT_ACT_ENVIRONMENT = wasActEnvironment;
          }
        };
        function dispatchRaw(
          type: 'pointermove' | 'pointerup',
          time: number,
          y: number,
        ) {
          const event = new Event(type, {bubbles: true, cancelable: true});
          Object.defineProperties(event, {
            button: {value: 0},
            clientY: {value: y},
            isPrimary: {value: true},
            pointerId: {value: 1},
            timeStamp: {value: time},
          });
          getHandle().dispatchEvent(event);
        }
        return {sheet, outsideAct};
      }

      it('keeps the caller height through a drag across the detent and back', async () => {
        const {sheet, outsideAct} = restOnHalfWithCallerHeight();
        expect(sheet.style.height).toBe('500px');

        const heights: string[] = [];
        outsideAct(dispatch => {
          dispatch('pointermove', 4000, 136);
          heights.push(sheet.style.height);
          dispatch('pointermove', 5000, 436);
          heights.push(sheet.style.height);
        });
        await act(async () => {});
        outsideAct(dispatch => {
          dispatch('pointerup', 6000, 336);
        });
        await act(async () => {});

        // The caller's height owns the element: the crossing writes only the
        // transform and the end inset, and nothing replaces the height after.
        expect(heights).toEqual(['500px', '500px']);
        expect(sheet.style.height).toBe('500px');
      });

      it('keeps the caller height when the finger lifts in the same task as the crossing move', async () => {
        const {sheet, outsideAct} = restOnHalfWithCallerHeight();

        let heightAboveDetent = '';
        outsideAct(dispatch => {
          dispatch('pointermove', 4000, 333);
          heightAboveDetent = sheet.style.height;
          dispatch('pointerup', 4500, 333);
        });
        await act(async () => {});

        expect(heightAboveDetent).toBe('500px');
        expect(sheet.style.height).toBe('500px');
      });
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

    it('rests at the committed stop when React discards a render that moves it', async () => {
      const observers = mockResizeObserverInstances();
      mockVisualViewport(800);
      mockWindowHeight(800);
      // A transition that suspends for good: React renders the new stops,
      // then keeps the committed tree and never commits that render.
      const forever = new Promise<never>(() => {});
      function Forever(): null {
        use(forever);
        return null;
      }
      function Screen({
        snapPoints,
        isPending,
      }: {
        snapPoints: ReadonlyArray<number>;
        isPending: boolean;
      }) {
        return (
          <Suspense fallback={null}>
            <BottomSheet
              isOpen
              onOpenChange={() => {}}
              label="Release notes"
              snapPoints={snapPoints}
              height="tall">
              Content
            </BottomSheet>
            {isPending ? <Forever /> : null}
          </Suspense>
        );
      }
      const view = render(<Screen snapPoints={[0.5]} isPending={false} />);
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
      await act(async () => {
        startTransition(() => {
          view.rerender(<Screen snapPoints={[0.25]} isPending />);
        });
      });

      // The committed stop is still half the window: 336px of travel.
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
    // The reveal-pan watch reads touches to leave a reader's own pan alone:
    // the most touch listeners registered at once.
    function trackTouchListeners(): () => number {
      const live = new Set<unknown>();
      let most = 0;
      const add = window.addEventListener.bind(window);
      const remove = window.removeEventListener.bind(window);
      const adding = vi
        .spyOn(window, 'addEventListener')
        .mockImplementation((type, listener, options) => {
          if (type === 'touchstart') {
            live.add(listener);
            most = Math.max(most, live.size);
          }
          add(type, listener, options);
        });
      const removing = vi
        .spyOn(window, 'removeEventListener')
        .mockImplementation((type, listener, options) => {
          if (type === 'touchstart') {
            live.delete(listener);
          }
          remove(type, listener, options);
        });
      onTestFinished(() => {
        adding.mockRestore();
        removing.mockRestore();
      });
      return () => most;
    }

    it('registers no touch listener for a presented Tall sheet under a fine pointer (architecture INV13, spec:AST-094 FR24)', () => {
      mockPrimaryPointer('fine');
      mockWindowHeight(800);
      mockVisualViewport(800);
      const mostTouchListeners = trackTouchListeners();
      render(
        <BottomSheet
          isOpen
          onOpenChange={() => {}}
          label="Add a comment"
          height="tall">
          <input aria-label="Comment" />
        </BottomSheet>,
      );
      expect(screen.getByRole('textbox', {name: 'Comment'})).toBeVisible();
      expect(mostTouchListeners()).toBe(0);
    });

    it('installs no focus takeover for a presented Tall sheet under a fine pointer (architecture INV13, spec:AST-094 FR24)', () => {
      mockPrimaryPointer('fine');
      mockWindowHeight(800);
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
      expect(screen.getByRole('textbox', {name: 'Comment'})).toBeVisible();
      expect(__focusTakeoverCallersForTest(document)).toBe(0);
    });

    it('installs the focus takeover for each presented Tall sheet under a coarse pointer, through the one shared listener (spec:AST-094 FR24)', () => {
      mockPrimaryPointer('coarse');
      mockWindowHeight(800);
      mockVisualViewport(800);
      render(
        <>
          <BottomSheet
            isOpen
            onOpenChange={() => {}}
            label="Add a comment"
            height="tall">
            <input aria-label="Comment" />
          </BottomSheet>
          <BottomSheet
            isOpen
            onOpenChange={() => {}}
            label="Add a note"
            height="tall">
            <input aria-label="Note" />
          </BottomSheet>
        </>,
      );
      // Both sheets claim focus moves through the keyboard module's one
      // document listener (its own test counts that listener).
      expect(__focusTakeoverCallersForTest(document)).toBe(2);
    });

    it('registers one touch listener for two presented Tall sheets under a coarse pointer (spec:AST-094 FR24)', () => {
      mockPrimaryPointer('coarse');
      mockWindowHeight(800);
      mockVisualViewport(800);
      const mostTouchListeners = trackTouchListeners();
      render(
        <>
          <BottomSheet
            isOpen
            onOpenChange={() => {}}
            label="Add a comment"
            height="tall">
            <input aria-label="Comment" />
          </BottomSheet>
          <BottomSheet
            isOpen
            onOpenChange={() => {}}
            label="Add a note"
            height="tall">
            <input aria-label="Note" />
          </BottomSheet>
        </>,
      );
      expect(screen.getByRole('textbox', {name: 'Note'})).toBeInTheDocument();
      expect(mostTouchListeners()).toBe(1);
    });

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

    it('leaves focus to desktop Safari and Firefox, which measure but have a fine pointer (AST-017 FR59)', () => {
      // A visual viewport and no keyboard geometry API, as on iOS, but a mouse.
      mockVisualViewport(800);
      mockWindowHeight(800);
      mockPrimaryPointer('fine');
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
      const sheet = getSheet();
      const title = screen.getByRole('textbox', {name: 'Title'});
      const comment = screen.getByRole('textbox', {name: 'Comment'});
      title.focus();
      const commentFocus = vi.spyOn(comment, 'focus');
      const sheetFocus = vi.spyOn(sheet, 'focus');

      // Tab between fields: the browser's own move, not one delivered here.
      fireEvent.blur(title, {relatedTarget: comment});
      expect(commentFocus).not.toHaveBeenCalled();

      // A window switch blurs the field for nothing. The sheet does not park
      // focus on itself, so focus comes back to the field.
      fireEvent.blur(title, {relatedTarget: null});
      expect(sheetFocus).not.toHaveBeenCalled();
    });

    it('does not alter ordinary desktop focus when the viewport is unobstructed', () => {
      mockVisualViewport(800);
      mockWindowHeight(800);
      mockKeyboardGeometryApi();
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
      expect(keyboardInsetOf(getBody())).toBe(0);
    });

    it('lays out no keyboard room when the body overhangs the viewport by a fraction of a pixel', () => {
      // On Chrome for Android, the visual viewport can be 0.3 px taller than
      // the layout viewport. A sheet sized to it ends that far below it.
      mockIOSWebKit();
      mockWindowHeight(800);
      mockVisualViewport(800.3);
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
        rect({top: 100, bottom: 800.3}),
      );
      vi.spyOn(input, 'getBoundingClientRect').mockReturnValue(
        rect({top: 700, bottom: 740}),
      );

      input.focus();

      expect(keyboardInsetOf(body)).toBe(0);
    });

    it('scrolls nothing for a field in the bottom clearance band when the body overhangs the viewport by a fraction of a pixel', () => {
      // Chrome on Android: the visual viewport can be 0.3 px taller than the
      // layout viewport. With no keyboard up, a field in the sheet's bottom
      // 48 px is already visible: the suggestion clearance is for a keyboard.
      mockIOSWebKit();
      mockWindowHeight(800);
      mockVisualViewport(800.3);
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
        rect({top: 100, bottom: 800.3}),
      );
      vi.spyOn(input, 'getBoundingClientRect').mockReturnValue(
        rect({top: 760, bottom: 790}),
      );
      const scrollBy = vi.fn();
      Object.defineProperty(body, 'scrollBy', {
        configurable: true,
        value: scrollBy,
      });

      input.focus();

      expect(scrollBy).not.toHaveBeenCalled();
      expect(body.scrollTop).toBe(0);
    });

    it('keeps Tall geometry fixed while extending and cleaning up its internal scroll range', () => {
      mockWindowHeight(800);
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
      expect(keyboardInsetOf(body)).toBe(348);
      // Visible bottom is 500px; preserve the same 48px focus gap.
      expect(body.scrollTop).toBe(248);

      viewport.height = 800;
      void act(() => viewport.dispatchEvent(new Event('resize')));
      expect(keyboardInsetOf(body)).toBe(0);
      expect(body.scrollTop).toBe(0);
      expect(sheet.getBoundingClientRect()).toEqual(initialRect);
      expect(sheet.style.height).toBe('');
    });

    it('restores a top field when interactive keyboard dismissal leaves only the accessory bar', () => {
      const viewport = mockVisualViewport(500);
      render(
        <BottomSheet
          isOpen
          onOpenChange={() => {}}
          label="Search items"
          height="tall">
          <input aria-label="Search" />
        </BottomSheet>,
      );
      const body = getBody();
      const input = screen.getByRole('textbox', {name: 'Search'});
      vi.spyOn(body, 'getBoundingClientRect').mockReturnValue(
        rect({top: 100, bottom: 800}),
      );
      vi.spyOn(input, 'getBoundingClientRect').mockImplementation(() =>
        rect({top: 150 - body.scrollTop, bottom: 190 - body.scrollTop}),
      );

      input.focus();
      expect(keyboardInsetOf(body)).toBe(348);
      expect(body.scrollTop).toBe(0);

      // Safari can move the sheet body during the interactive dismissal. The
      // main keyboard has gone, but its accessory bar still shortens the visual
      // viewport, so this is recovery without a full-height viewport yet.
      body.scrollTop = 300;
      viewport.height = 720;
      void act(() => viewport.dispatchEvent(new Event('resize')));

      expect(body.scrollTop).toBe(0);
      expect(keyboardInsetOf(body)).toBe(128);

      // Once that recovery step has been consumed, later layout work at the
      // same visual-viewport height must not overwrite the person's scrolling.
      body.scrollTop = 80;
      void act(() => window.dispatchEvent(new Event('resize')));
      // The ordinary safe-area pass may clamp scrolling just enough to keep
      // the still-focused top field visible, but it must not reset to the old
      // pre-keyboard position again.
      expect(body.scrollTop).toBe(50);
    });

    it('re-reveals a later focused field after full keyboard recovery restores the opening scroll position', () => {
      mockWindowHeight(800);
      const viewport = mockVisualViewport(500);
      render(
        <BottomSheet
          isOpen
          onOpenChange={() => {}}
          label="Edit details"
          height="tall">
          <input aria-label="First" />
          <input aria-label="Later" />
        </BottomSheet>,
      );
      const body = getBody();
      const first = screen.getByRole('textbox', {name: 'First'});
      const later = screen.getByRole('textbox', {name: 'Later'});
      Object.defineProperty(body, 'scrollBy', {
        configurable: true,
        value: ({top = 0}: ScrollToOptions) => {
          body.scrollTop += top;
        },
      });
      vi.spyOn(body, 'getBoundingClientRect').mockReturnValue(
        rect({top: 100, bottom: 800}),
      );
      vi.spyOn(first, 'getBoundingClientRect').mockImplementation(() =>
        rect({top: 150 - body.scrollTop, bottom: 190 - body.scrollTop}),
      );
      vi.spyOn(later, 'getBoundingClientRect').mockImplementation(() =>
        rect({top: 860 - body.scrollTop, bottom: 900 - body.scrollTop}),
      );

      first.focus();
      expect(body.scrollTop).toBe(0);
      later.focus();
      expect(body.scrollTop).toBe(448);

      viewport.height = 800;
      void act(() => viewport.dispatchEvent(new Event('resize')));

      expect(keyboardInsetOf(body)).toBe(0);
      // Cleanup restores 0, then the unobstructed safe-area pass reveals the
      // still-focused later field at the bottom of the 100–800 body viewport.
      expect(body.scrollTop).toBe(100);
    });

    it('retains the accommodated body scroll through partial viewport recovery while focus is leaving', () => {
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
      Object.defineProperty(body, 'scrollBy', {
        configurable: true,
        value: ({top = 0}: ScrollToOptions) => {
          body.scrollTop += top;
        },
      });
      vi.spyOn(body, 'getBoundingClientRect').mockReturnValue(
        rect({top: 100, bottom: 800}),
      );
      vi.spyOn(input, 'getBoundingClientRect').mockImplementation(() =>
        rect({top: 660 - body.scrollTop, bottom: 700 - body.scrollTop}),
      );

      input.focus();
      expect(body.scrollTop).toBe(248);
      input.blur();
      viewport.height = 720;
      void act(() => viewport.dispatchEvent(new Event('resize')));

      expect(body.scrollTop).toBe(248);
      expect(keyboardInsetOf(body)).toBe(128);

      viewport.height = 800;
      void act(() => viewport.dispatchEvent(new Event('resize')));
      expect(body.scrollTop).toBe(0);
      expect(keyboardInsetOf(body)).toBe(0);
    });

    it('lays out the keyboard room in Chrome on Android, which has its own keyboard geometry API (spec:AST-099 DEC-4)', () => {
      // Gboard shrinks Chrome's visual viewport while the layout viewport
      // keeps its height; the VirtualKeyboard API is not read.
      mockKeyboardGeometryApi();
      mockPrimaryPointer('coarse');
      mockWindowHeight(800);
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
      vi.spyOn(body, 'getBoundingClientRect').mockReturnValue(
        rect({top: 100, bottom: 800}),
      );
      vi.spyOn(input, 'getBoundingClientRect').mockReturnValue(
        rect({top: 300, bottom: 340}),
      );

      input.focus();

      expect(keyboardInsetOf(body)).toBe(348);
    });

    describe('on Gboard\u2019s slides in Chrome on Android (spec:AST-099 FR8)', () => {
      // A Tall sheet in Chrome on Android. Its body, from top 100 to bottom
      // 800, holds 800 px of content and the room after it. So the last
      // field's reveal scrolls into the room. The body's scroll stays within
      // its range, as a browser keeps it. `scrollBy` records a smooth scroll
      // and moves nothing, unless `instantScrollBy` lands it at once.
      function renderChromeSheet({
        instantScrollBy = false,
        roomRangeShort = 0,
        pointer = 'coarse',
        picker,
      }: {
        instantScrollBy?: boolean;
        roomRangeShort?: number;
        pointer?: 'coarse' | 'fine';
        picker?: ReactNode;
      } = {}) {
        mockKeyboardGeometryApi();
        mockPrimaryPointer(pointer);
        mockWindowHeight(800);
        const viewport = Object.assign(mockVisualViewport(800), {scale: 1});
        render(
          <BottomSheet
            isOpen
            onOpenChange={() => {}}
            label="Add a comment"
            height="tall">
            <input aria-label="Comment" />
            {picker}
          </BottomSheet>,
        );
        const body = getBody();
        const content = body.firstElementChild as HTMLElement;
        const input = screen.getByRole('textbox', {name: 'Comment'});
        let scrollTop = 0;
        // The scroll range the room adds: its height, less `roomRangeShort`.
        const scrollHeight = () =>
          800 + Math.max(0, keyboardInsetOf(body) - roomRangeShort);
        const maxScroll = () => scrollHeight() - 700;
        Object.defineProperties(body, {
          clientHeight: {configurable: true, get: () => 700},
          scrollHeight: {configurable: true, get: scrollHeight},
          scrollTop: {
            configurable: true,
            get: () => Math.min(scrollTop, maxScroll()),
            set: (value: number) => {
              scrollTop = Math.max(0, Math.min(value, maxScroll()));
            },
          },
        });
        const scrollBy = vi.fn((options: ScrollToOptions) => {
          if (instantScrollBy) {
            body.scrollTop += options.top ?? 0;
          }
        });
        Object.defineProperty(body, 'scrollBy', {
          configurable: true,
          value: scrollBy,
        });
        vi.spyOn(body, 'getBoundingClientRect').mockReturnValue(
          rect({top: 100, bottom: 800}),
        );
        vi.spyOn(input, 'getBoundingClientRect').mockImplementation(() =>
          rect({top: 660 - body.scrollTop, bottom: 700 - body.scrollTop}),
        );
        const report = (height: number) => {
          viewport.height = height;
          act(() => {
            viewport.dispatchEvent(new Event('resize'));
          });
        };
        return {body, content, input, report, scrollBy};
      }

      const afterTheSlide = async () =>
        act(async () => {
          await new Promise(resolve => setTimeout(resolve, 400));
        });

      it('lands the body at once at the keyboard\u2019s report, and the content\u2019s ride ends with no translate left', async () => {
        const {body, content, input, report, scrollBy} = renderChromeSheet();
        act(() => input.focus());
        report(500);
        // In the report's own event, the room is 300 px of keyboard over the
        // body plus the 48 px clearance. The body scrolls at once, so the
        // field rests 48 px above the keyboard. No smooth scroll trails
        // Gboard's slide.
        expect(keyboardInsetOf(body)).toBe(348);
        expect(body.scrollTop).toBe(248);
        expect(scrollBy).not.toHaveBeenCalled();
        await afterTheSlide();
        // The ride ends at the layout: no translate is left.
        expect(content.style.translate).toBe('');
        expect(body.scrollTop).toBe(248);
      });

      it('keeps the room through the keyboard\u2019s hide while the content rides down to the scroll from before the keyboard, then drops both at rest', async () => {
        const {body, content, input, report} = renderChromeSheet({
          instantScrollBy: true,
        });
        act(() => input.focus());
        report(500);
        await afterTheSlide();
        expect(body.scrollTop).toBe(248);

        // Back: Chrome reports the keyboard gone, and the field keeps focus.
        // The guide dates the hide back by the lag measured on blurs.
        report(800);
        // The room stays, so the body keeps its scroll. The content rides
        // down 248 px, back to the scroll from before the keyboard.
        expect(keyboardInsetOf(body)).toBe(348);
        expect(body.scrollTop).toBe(248);
        expect(content.style.translate).toBe('0px 248px');

        await afterTheSlide();
        // At rest, in one commit, the room drops, the body's scroll goes back
        // to 0, and the translate clears.
        expect(keyboardInsetOf(body)).toBe(0);
        expect(body.scrollTop).toBe(0);
        expect(content.style.translate).toBe('');
      });

      it.each([
        [
          'a select',
          <select key="s" aria-label="Picker">
            <option>One</option>
          </select>,
        ],
        ['a date input', <input key="d" type="date" aria-label="Picker" />],
      ] as const)(
        'rides the content down and keeps the room through the hide when focus moves to %s, whose picker Chrome opens over the page',
        async (_, picker) => {
          const {body, content, input, report} = renderChromeSheet({
            instantScrollBy: true,
            picker,
          });
          // The picker sits above the field, in view while the keyboard is up.
          const pickerControl = screen.getByLabelText('Picker');
          vi.spyOn(pickerControl, 'getBoundingClientRect').mockImplementation(
            () =>
              rect({top: 600 - body.scrollTop, bottom: 640 - body.scrollTop}),
          );
          act(() => input.focus());
          report(500);
          await afterTheSlide();
          expect(body.scrollTop).toBe(248);
          // Gboard slides down for the picker: Chrome reports the keyboard
          // gone, and no keyboard comes back.
          act(() => pickerControl.focus());
          report(800);
          expect(keyboardInsetOf(body)).toBe(348);
          expect(content.style.translate).toBe('0px 248px');
          await afterTheSlide();
          expect(keyboardInsetOf(body)).toBe(0);
          expect(body.scrollTop).toBe(0);
          expect(content.style.translate).toBe('');
        },
      );

      it('rides by the scroll the room\u2019s drop takes back where the room adds less range than its height, as in Chrome 124', async () => {
        // Chrome 124 added 344 px of scroll range for a 360 px room: here 16
        // px less than the room's 348. The body starts at the end of its
        // range, 100 px, so the clear puts its scroll back there.
        const {body, content, input, report} = renderChromeSheet({
          instantScrollBy: true,
          roomRangeShort: 16,
        });
        body.scrollTop = 100;
        act(() => input.focus());
        report(500);
        await afterTheSlide();
        expect(body.scrollTop).toBe(248);
        report(800);
        // The drop takes back 148 px, to the end of the range without the
        // room, not the 164 px the room's height would say.
        expect(content.style.translate).toBe('0px 148px');
        await afterTheSlide();
        expect(body.scrollTop).toBe(100);
        expect(content.style.translate).toBe('');
      });

      it('attaches nothing of the ride under a fine pointer: the room drops at Chrome\u2019s hide report', () => {
        const guide = getKeyboardLayoutGuide(window);
        const subscribe = vi.spyOn(guide, 'subscribe');
        const {body, content, input, report} = renderChromeSheet({
          instantScrollBy: true,
          pointer: 'fine',
        });
        act(() => input.focus());
        report(500);
        expect(keyboardInsetOf(body)).toBe(348);
        report(800);
        expect(keyboardInsetOf(body)).toBe(0);
        expect(content.style.translate).toBe('');
        // Nothing subscribed the keyboard layout guide.
        expect(subscribe).not.toHaveBeenCalled();
        subscribe.mockRestore();
      });

      describe('on a slow phone, whose reports of the hide come after Gboard\u2019s slide', () => {
        // One clock for event times and the guide's own reads, as in a
        // browser, so the guide's check after the slide runs on time.
        let restoreNow: (() => void) | null = null;
        beforeEach(() => {
          const now = vi
            .spyOn(window.performance, 'now')
            .mockImplementation(() => Date.now());
          restoreNow = () => now.mockRestore();
        });
        afterEach(() => {
          restoreNow?.();
          restoreNow = null;
        });
        const wait = async (ms: number) =>
          act(async () => {
            await new Promise(resolve => setTimeout(resolve, ms));
          });
        // Where the content is drawn at rest: its translate, less the body's
        // scroll.
        const drawnTopOf = (body: HTMLElement, content: HTMLElement) => {
          const [, y = '0px'] = content.style.translate.split(' ');
          return Number.parseFloat(y) - body.scrollTop;
        };

        it('keeps the content where the slide leaves it until the keyboard\u2019s report of its hide, then clears the room with nothing drawn moving', async () => {
          const {body, content, input, report} = renderChromeSheet({
            instantScrollBy: true,
          });
          act(() => input.focus());
          report(500);
          await afterTheSlide();
          expect(drawnTopOf(body, content)).toBe(-248);

          // Done: the field loses focus to nothing, and Gboard slides down. The
          // page is busy, as on a phone at a quarter of the speed. Chrome's
          // reports reach it 603 ms after the blur, with the keyboard partway down, and 1119 ms after it, with the keyboard gone.
          act(() => input.blur());
          // The slide has ended and Chrome has reported nothing yet. The
          // content stays where the scroll from before the keyboard draws it,
          // and the room and the scroll stay.
          await wait(250);
          expect(drawnTopOf(body, content)).toBe(0);
          expect(keyboardInsetOf(body)).toBe(348);
          expect(body.scrollTop).toBe(248);
          // The keyboard partway down moves nothing.
          await wait(353);
          report(543);
          expect(drawnTopOf(body, content)).toBe(0);
          // The keyboard gone: in one commit the room drops, the scroll goes
          // back and the translate clears, so nothing drawn moves.
          await wait(516);
          report(800);
          expect(keyboardInsetOf(body)).toBe(0);
          expect(body.scrollTop).toBe(0);
          expect(content.style.translate).toBe('');
          expect(drawnTopOf(body, content)).toBe(0);
          await wait(400);
          expect(drawnTopOf(body, content)).toBe(0);
          expect(content.style.translate).toBe('');
        });

        it('rides the content back up with the keyboard when the field takes focus again before Chrome reports the hide', async () => {
          const {body, content, input, report} = renderChromeSheet({
            instantScrollBy: true,
          });
          act(() => input.focus());
          report(500);
          await afterTheSlide();

          act(() => input.blur());
          // After Gboard's slide, before any report, the field takes focus
          // again. The keyboard comes back, so the content rides back up with
          // it and stays there.
          await wait(250);
          act(() => input.focus());
          await wait(500);
          expect(drawnTopOf(body, content)).toBe(-248);
          expect(keyboardInsetOf(body)).toBe(348);
          expect(body.scrollTop).toBe(248);
          expect(content.style.translate).toBe('');
          // Chrome's report that the keyboard is up again moves nothing.
          report(500);
          expect(drawnTopOf(body, content)).toBe(-248);
        });

        it('rides the content back up once the check after the slide reads the keyboard still up, when focus moves into a frame whose field keeps it', async () => {
          const {body, content, input, report} = renderChromeSheet({
            instantScrollBy: true,
            picker: <iframe key="f" title="Editor" sandbox="" />,
          });
          const frame = screen.getByTitle('Editor');
          act(() => input.focus());
          report(500);
          await afterTheSlide();
          expect(drawnTopOf(body, content)).toBe(-248);

          // The field inside the frame keeps the keyboard up, and Chrome
          // reports nothing. The guide cannot see that field, so the check
          // 150 ms after the slide believes the viewport.
          act(() => frame.focus());
          expect(document.activeElement).toBe(frame);
          await wait(250);
          expect(drawnTopOf(body, content)).toBe(0);
          await wait(550);
          expect(drawnTopOf(body, content)).toBe(-248);
          expect(keyboardInsetOf(body)).toBe(348);
          expect(content.style.translate).toBe('');
        });
      });
    });

    it('subscribes no keyboard layout guide where the keyboard moves on Safari\u2019s schedule, whose transitions the sheet never rides (spec:AST-099 FR8)', () => {
      // iOS Safari and Firefox for Android have no VirtualKeyboard API, so the
      // guide has no profile there. The sheet subscribes no guide, and its
      // room follows the keyboard's reports.
      mockWindowHeight(800);
      const viewport = mockVisualViewport(800);
      mockIOSWebKit();
      const guide = getKeyboardLayoutGuide(window);
      const subscribe = vi.spyOn(guide, 'subscribe');
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
        rect({top: 660, bottom: 700}),
      );
      act(() => input.focus());
      viewport.height = 500;
      void act(() => viewport.dispatchEvent(new Event('resize')));
      // The room follows the keyboard's report (FR3)...
      expect(keyboardInsetOf(body)).toBe(348);
      // ...and nothing subscribed the guide, so no frame watch runs.
      expect(subscribe).not.toHaveBeenCalled();
      subscribe.mockRestore();
    });

    it('keeps the keyboard room when the page is pinch-zoomed past 2x with the keyboard up', () => {
      // WebKit reports innerWidth and innerHeight in the zoomed visual
      // viewport's px. At 2x, innerHeight alone reads no keyboard, and the
      // sheet would give the room back with the keyboard up.
      mockIOSWebKit();
      mockWindowHeight(800);
      vi.stubGlobal('innerWidth', 1024);
      const viewport = Object.assign(mockVisualViewport(500), {
        width: 1024,
        scale: 1,
      });
      try {
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
          rect({top: 300, bottom: 340}),
        );
        input.focus();
        expect(keyboardInsetOf(body)).toBe(348);

        vi.stubGlobal('innerHeight', 400);
        vi.stubGlobal('innerWidth', 512);
        Object.assign(viewport, {height: 250, scale: 2, width: 512});
        void act(() => viewport.dispatchEvent(new Event('resize')));
        expect(keyboardInsetOf(body)).toBe(348);
      } finally {
        vi.unstubAllGlobals();
      }
    });

    it('makes no keyboard room beside a classic scrollbar with no keyboard', () => {
      // A desktop page with a 17 px vertical scrollbar: innerWidth counts it,
      // the document's client width and the visual viewport do not.
      mockPrimaryPointer('fine');
      mockWindowHeight(800);
      vi.stubGlobal('innerWidth', 1280);
      Object.assign(mockVisualViewport(800), {width: 1263, scale: 1});
      Object.defineProperty(document.documentElement, 'clientWidth', {
        configurable: true,
        value: 1263,
      });
      try {
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
          rect({top: 700, bottom: 740}),
        );
        input.focus();
        expect(keyboardInsetOf(body)).toBe(0);
      } finally {
        Reflect.deleteProperty(document.documentElement, 'clientWidth');
        vi.unstubAllGlobals();
      }
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

    describe('the reveal at the keyboard\u2019s report (spec:AST-099 FR4)', () => {
      // A Tall sheet with its last field low, as in the Mobile keyboard story,
      // on a touch screen. The on-screen keyboard's own pan comes with a touch
      // screen.
      function renderLowField() {
        mockPrimaryPointer('coarse');
        mockWindowHeight(800);
        const viewport = Object.assign(mockVisualViewport(800), {scale: 1});
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
        // A smooth scroll is still under way when the next event comes; an
        // instant one has landed.
        const scrollBy = vi.fn((options: ScrollToOptions) => {
          if (options.behavior !== 'smooth') {
            body.scrollTop += options.top ?? 0;
          }
        });
        Object.defineProperty(body, 'scrollBy', {
          configurable: true,
          value: scrollBy,
        });
        vi.spyOn(body, 'getBoundingClientRect').mockReturnValue(
          rect({top: 100, bottom: 800}),
        );
        vi.spyOn(input, 'getBoundingClientRect').mockImplementation(() =>
          rect({top: 660 - body.scrollTop, bottom: 700 - body.scrollTop}),
        );
        const scrollIntoView = vi.fn();
        const dialog = body.closest('dialog')!;
        Object.defineProperty(dialog, 'scrollIntoView', {
          configurable: true,
          value: scrollIntoView,
        });
        const report = (height: number) => {
          viewport.height = height;
          void act(() => viewport.dispatchEvent(new Event('resize')));
        };
        // The browser's own pan: the visual viewport moves down within the
        // layout viewport, with no touch and no document scroll.
        const pan = (offsetTop: number) => {
          viewport.offsetTop = offsetTop;
          void act(() => viewport.dispatchEvent(new Event('scroll')));
        };
        return {body, input, scrollBy, scrollIntoView, report, pan};
      }

      it('reveals the field in the report\u2019s own frame', () => {
        const {body, input, report} = renderLowField();
        // No frame comes: only what the report's own event does shows.
        vi.stubGlobal(
          'requestAnimationFrame',
          vi.fn(() => 1),
        );
        input.focus();
        report(500);
        expect(keyboardInsetOf(body)).toBe(348);
      });

      it('keeps the smooth reveal where the browser does not pan to the field', () => {
        const {input, scrollBy, scrollIntoView, report} = renderLowField();
        input.focus();
        report(500);
        expect(scrollBy).toHaveBeenLastCalledWith({
          top: 248,
          behavior: 'smooth',
        });
        expect(scrollIntoView).not.toHaveBeenCalled();
      });

      it('puts back the browser\u2019s own pan to the field and reveals at once from then on', () => {
        const {body, input, scrollBy, scrollIntoView, report, pan} =
          renderLowField();
        input.focus();
        report(500);
        pan(256);
        expect(scrollIntoView).toHaveBeenCalledWith({
          block: 'start',
          inline: 'nearest',
          behavior: 'instant',
        });
        expect(scrollBy).toHaveBeenLastCalledWith({
          top: 248,
          behavior: 'instant',
        });

        // The next keyboard lands the field in the report's frame, at once.
        report(800);
        pan(0);
        body.scrollTop = 0;
        scrollBy.mockClear();
        report(500);
        expect(scrollBy).toHaveBeenLastCalledWith({
          top: 248,
          behavior: 'instant',
        });
      });

      it('puts the pan back without a second scroll while the smooth reveal is still on its way', () => {
        const {body, input, scrollBy, scrollIntoView, report, pan} =
          renderLowField();
        // The body can scroll far enough; the smooth reveal is under way.
        Object.defineProperty(body, 'scrollHeight', {
          configurable: true,
          value: 2000,
        });
        Object.defineProperty(body, 'clientHeight', {
          configurable: true,
          value: 700,
        });
        input.focus();
        report(500);
        expect(scrollBy).toHaveBeenLastCalledWith({
          top: 248,
          behavior: 'smooth',
        });
        scrollBy.mockClear();
        pan(256);
        // Firefox keeps adding a smooth scrollBy's distance after an instant
        // scroll, so a second scroll here would overshoot.
        expect(scrollBy).not.toHaveBeenCalled();
        expect(scrollIntoView).toHaveBeenCalledWith({
          block: 'start',
          inline: 'nearest',
          behavior: 'instant',
        });
        // The put-back moves the visual viewport up again; the reveal that
        // follows leaves the smooth one to land the field.
        pan(0);
        expect(scrollBy).not.toHaveBeenCalled();
      });

      it('keeps the browser\u2019s reveal when the sheet cannot bring the field above the keyboard', () => {
        const {input, scrollBy, scrollIntoView, report, pan} = renderLowField();
        // The body cannot scroll further: the field stays under the keyboard.
        scrollBy.mockImplementation(() => {});
        input.focus();
        report(500);
        pan(256);
        expect(scrollIntoView).not.toHaveBeenCalled();
      });

      it('leaves a pan the reader makes', () => {
        const {input, scrollBy, scrollIntoView, report, pan} = renderLowField();
        input.focus();
        report(500);
        fireEvent.touchStart(document.body);
        pan(256);
        expect(scrollIntoView).not.toHaveBeenCalled();
        expect(scrollBy).not.toHaveBeenCalledWith(
          expect.objectContaining({behavior: 'instant'}),
        );
      });

      it('leaves a document scroll, which is not the browser revealing the field', () => {
        const {input, scrollIntoView, report, pan} = renderLowField();
        input.focus();
        report(500);
        vi.stubGlobal('scrollY', 120);
        pan(120);
        expect(scrollIntoView).not.toHaveBeenCalled();
      });
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

      expect(keyboardInsetOf(body)).toBe(0);
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

      expect(keyboardInsetOf(body)).toBe(0);
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
        expect(keyboardInsetOf(body)).toBe(0);
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

        expect(keyboardInsetOf(body)).toBe(348);
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
        observer?.callback(
          [{target: input} as unknown as ResizeObserverEntry],
          observer as unknown as ResizeObserver,
        );
      });

      expect(body.scrollTop).toBe(448);
    });

    describe('in iOS Safari, which reports the keyboard once it is gone (spec:AST-099 FR3)', () => {
      // A Tall sheet in iOS Safari: a visual viewport, no keyboard geometry
      // API, and a coarse pointer. Its body, from top 100 to bottom 800, holds
      // 800 px of content and the room after it. A reveal's scroll lands at
      // once.
      function renderIOSSheet({
        pointer = 'coarse',
        reducedMotion = false,
        picker,
      }: {
        pointer?: 'coarse' | 'fine';
        reducedMotion?: boolean;
        picker?: ReactNode;
      } = {}) {
        mockIOSWebKit();
        if (reducedMotion) {
          mockReducedMotionOnTouch();
        } else {
          mockPrimaryPointer(pointer);
        }
        mockWindowHeight(800);
        const viewport = mockVisualViewport(800);
        render(
          <BottomSheet
            isOpen
            onOpenChange={() => {}}
            label="Add a comment"
            height="tall">
            <input aria-label="Comment" />
            {picker}
          </BottomSheet>,
        );
        const body = getBody();
        const content = body.firstElementChild as HTMLElement;
        const input = screen.getByRole('textbox', {name: 'Comment'});
        let scrollTop = 0;
        const scrollHeight = () => 800 + keyboardInsetOf(body);
        const maxScroll = () => scrollHeight() - 700;
        Object.defineProperties(body, {
          clientHeight: {configurable: true, get: () => 700},
          scrollHeight: {configurable: true, get: scrollHeight},
          scrollTop: {
            configurable: true,
            get: () => Math.min(scrollTop, maxScroll()),
            set: (value: number) => {
              scrollTop = Math.max(0, Math.min(value, maxScroll()));
            },
          },
        });
        Object.defineProperty(body, 'scrollBy', {
          configurable: true,
          value: (options: ScrollToOptions) => {
            body.scrollTop += options.top ?? 0;
          },
        });
        vi.spyOn(body, 'getBoundingClientRect').mockReturnValue(
          rect({top: 100, bottom: 800}),
        );
        vi.spyOn(input, 'getBoundingClientRect').mockImplementation(() =>
          rect({top: 660 - body.scrollTop, bottom: 700 - body.scrollTop}),
        );
        const report = (height: number) => {
          viewport.height = height;
          act(() => {
            viewport.dispatchEvent(new Event('resize'));
          });
        };
        // Where the content is drawn at `time`: its layout's place, less the
        // body's scroll, moved by its translate.
        const drawnTop = (time?: number) =>
          animatorFor(content).get('y', time) - body.scrollTop;
        return {body, content, input, report, drawnTop};
      }

      const nextFrame = async () =>
        act(async () => {
          await new Promise(resolve => requestAnimationFrame(resolve));
        });
      const afterTheHide = async () =>
        act(async () => {
          await new Promise(resolve => setTimeout(resolve, 450));
        });

      it('rides the content down on the keyboard\u2019s spring from the blur, and the report then moves nothing', async () => {
        const {body, content, input, report, drawnTop} = renderIOSSheet();
        act(() => input.focus());
        report(500);
        expect(body.scrollTop).toBe(248);
        expect(keyboardInsetOf(body)).toBe(348);
        expect(drawnTop()).toBe(-248);

        // Done: the field loses focus to nothing, and the keyboard goes down.
        const blurAt = performance.now();
        act(() => input.blur());
        await nextFrame();
        // Sampled every 16 ms through the keyboard's slide, the content moves
        // down a little each frame. It lands where the scroll from before the
        // keyboard draws it. No frame jumps.
        const samples = Array.from({length: 32}, (_, frame) =>
          drawnTop(blurAt + frame * 16),
        );
        for (let frame = 1; frame < samples.length; frame += 1) {
          const step = (samples[frame] ?? 0) - (samples[frame - 1] ?? 0);
          expect(step).toBeGreaterThanOrEqual(-0.01);
          expect(step).toBeLessThan(40);
        }
        expect(samples.at(-1)).toBeCloseTo(0, 0);
        // The room and the scroll stay until the keyboard is gone.
        expect(keyboardInsetOf(body)).toBe(348);
        expect(body.scrollTop).toBe(248);

        // iOS reports the keyboard gone about half a second after the blur.
        // In one commit the room drops, the scroll goes back and the
        // translate clears, so nothing drawn moves.
        await afterTheHide();
        const before = drawnTop();
        report(800);
        expect(keyboardInsetOf(body)).toBe(0);
        expect(body.scrollTop).toBe(0);
        expect(content.style.translate).toBe('');
        expect(drawnTop() - before).toBeCloseTo(0, 0);
      });

      it('rides nothing under a fine pointer: the content stays put until the report clears the room', async () => {
        const {body, input, report, drawnTop} = renderIOSSheet({
          pointer: 'fine',
        });
        act(() => input.focus());
        report(500);
        const settled = drawnTop();
        act(() => input.blur());
        await nextFrame();
        expect(drawnTop(performance.now() + 450)).toBe(settled);
        report(800);
        expect(keyboardInsetOf(body)).toBe(0);
      });

      it('dips the content out and back in at its resting place under Reduce Motion, and the report then moves nothing (design:reduced-motion DR2)', async () => {
        const {body, content, input, report, drawnTop} = renderIOSSheet({
          reducedMotion: true,
        });
        act(() => input.focus());
        report(500);
        act(() => input.blur());
        await nextFrame();
        // The cross-fade lands the content on a timer, so the samples are
        // read as the frames pass.
        const animator = animatorFor(content);
        const offsets: number[] = [];
        const opacities: number[] = [];
        for (let frame = 0; frame < 28; frame += 1) {
          offsets.push(animator.get('y'));
          opacities.push(animator.get('opacity'));
          await act(async () => {
            await new Promise(resolve => setTimeout(resolve, 16));
          });
        }
        // Nothing travels. Each sample is where the content was or where it
        // rests, and it fades out and back in around the landing.
        expect(
          offsets.every(y => Math.abs(y) < 0.5 || Math.abs(y - 248) < 0.5),
        ).toBe(true);
        expect(offsets.at(-1)).toBeCloseTo(248, 0);
        expect(Math.min(...opacities)).toBeLessThan(0.5);
        expect(opacities.at(-1)).toBeCloseTo(1, 2);

        await afterTheHide();
        const before = drawnTop();
        report(800);
        expect(keyboardInsetOf(body)).toBe(0);
        expect(drawnTop() - before).toBeCloseTo(0, 0);
      });

      it('starts no ride when focus moves from a field to a select, whose picker iOS puts where the keyboard was', async () => {
        const {body, input, report, drawnTop} = renderIOSSheet({
          picker: (
            <select aria-label="Picker">
              <option>One</option>
            </select>
          ),
        });
        act(() => input.focus());
        report(500);
        const settled = drawnTop();
        act(() => screen.getByLabelText('Picker').focus());
        await nextFrame();
        expect(drawnTop(performance.now() + 450)).toBe(settled);
        expect(keyboardInsetOf(body)).toBe(348);
        expect(body.scrollTop).toBe(248);
      });

      // A field behind a holder: one inside an open shadow root, or in a frame.
      // Focus on it leaves `document.activeElement` on the holder. The sheet
      // reads into the open root, and a frame can hold a field it cannot read.
      const hiddenFields = [
        ['an open shadow host', 'shadow host'],
        ['a frame', 'frame'],
      ] as const;
      function renderWithHiddenField(kind: 'shadow host' | 'frame') {
        const sheet = renderIOSSheet({
          picker:
            kind === 'frame' ? (
              <iframe title="Editor" sandbox="" />
            ) : (
              <div title="Editor" />
            ),
        });
        const holder = screen.getByTitle('Editor');
        const field: HTMLElement =
          kind === 'frame'
            ? holder
            : holder
                .attachShadow({mode: 'open'})
                .appendChild(document.createElement('input'));
        const focusHiddenField = () => {
          act(() => field.focus());
          expect(document.activeElement).toBe(holder);
        };
        return {...sheet, focusHiddenField};
      }

      it('rides the content down when focus moves from a field to a plain button inside an open shadow host, as a blur does', async () => {
        const {body, input, report, drawnTop} = renderIOSSheet({
          picker: <div title="Editor" />,
        });
        const host = screen.getByTitle('Editor');
        const button = host
          .attachShadow({mode: 'open'})
          .appendChild(document.createElement('button'));
        act(() => input.focus());
        report(500);
        act(() => button.focus());
        expect(document.activeElement).toBe(host);
        await nextFrame();
        expect(drawnTop(performance.now() + 450)).toBeCloseTo(0, 0);
        expect(keyboardInsetOf(body)).toBe(348);
        expect(body.scrollTop).toBe(248);
      });

      it('rides the content down from the blur once focus settles on a plain button inside an open shadow host', async () => {
        const {body, input, report, drawnTop} = renderIOSSheet({
          picker: <div title="Editor" />,
        });
        const host = screen.getByTitle('Editor');
        const button = host
          .attachShadow({mode: 'open'})
          .appendChild(document.createElement('button'));
        act(() => input.focus());
        report(500);
        // The browser runs the blur's frame after focus settles on the button.
        const frames: FrameRequestCallback[] = [];
        vi.mocked(requestAnimationFrame).mockImplementation(callback => {
          frames.push(callback);
          return frames.length;
        });
        act(() => button.focus());
        expect(document.activeElement).toBe(host);
        vi.mocked(requestAnimationFrame).mockImplementation(callback => {
          callback(0);
          return 1;
        });
        act(() => frames.splice(0).forEach(frame => frame(0)));
        await nextFrame();
        expect(drawnTop(performance.now() + 450)).toBeCloseTo(0, 0);
        expect(keyboardInsetOf(body)).toBe(348);
        expect(body.scrollTop).toBe(248);
      });

      it.each(hiddenFields)(
        'starts no ride when focus moves from a field into %s, whose own field can keep the keyboard up',
        async (_, kind) => {
          const {body, input, report, drawnTop, focusHiddenField} =
            renderWithHiddenField(kind);
          act(() => input.focus());
          report(500);
          const settled = drawnTop();
          focusHiddenField();
          await nextFrame();
          expect(drawnTop(performance.now() + 450)).toBe(settled);
          expect(keyboardInsetOf(body)).toBe(348);
          expect(body.scrollTop).toBe(248);
        },
      );

      it('rides the content back up when a field takes focus before the keyboard is gone', async () => {
        const {body, input, report, drawnTop} = renderIOSSheet();
        act(() => input.focus());
        report(500);
        act(() => input.blur());
        await nextFrame();
        // Focus comes back to the field mid-slide, so the keyboard stays.
        act(() => input.focus());
        await nextFrame();
        expect(drawnTop(performance.now() + 450)).toBeCloseTo(-248, 0);
        expect(keyboardInsetOf(body)).toBe(348);
        expect(body.scrollTop).toBe(248);
      });

      it.each(hiddenFields)(
        'rides the content back up when focus moves into %s before the keyboard is gone',
        async (_, kind) => {
          const {body, input, report, drawnTop, focusHiddenField} =
            renderWithHiddenField(kind);
          act(() => input.focus());
          report(500);
          act(() => input.blur());
          await nextFrame();
          // Focus moves to a field inside the holder mid-slide, so the
          // keyboard stays.
          focusHiddenField();
          await nextFrame();
          expect(drawnTop(performance.now() + 450)).toBeCloseTo(-248, 0);
          expect(keyboardInsetOf(body)).toBe(348);
          expect(body.scrollTop).toBe(248);
        },
      );

      it('glides the content to its new place when the keyboard goes while its field keeps focus, as a downward dismissal leaves it', () => {
        const {body, input, report, drawnTop} = renderIOSSheet();
        act(() => input.focus());
        report(500);
        expect(drawnTop()).toBe(-248);
        // The clock holds still through the report, so the glide starts at
        // `reportAt` however slowly the test runs.
        const reportAt = performance.now();
        const clock = vi
          .spyOn(window.performance, 'now')
          .mockReturnValue(reportAt);
        try {
          report(800);
        } finally {
          clock.mockRestore();
        }
        expect(keyboardInsetOf(body)).toBe(0);
        expect(body.scrollTop).toBe(0);
        // Drawn where it was at the report, then down on the keyboard's spring:
        // two frames in, it has hardly moved.
        expect(drawnTop(reportAt + 32)).toBeLessThan(-200);
        expect(drawnTop(reportAt + 450)).toBeCloseTo(0, 0);
      });
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
      expect(keyboardInsetOf(body)).toBe(348);

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
      expect(keyboardInsetOf(body)).toBe(348);
      expect(body.scrollTop).toBe(248);

      viewport.height = 800;
      void act(() => viewport.dispatchEvent(new Event('resize')));
      expect(keyboardInsetOf(body)).toBe(0);
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
      expect(keyboardInsetOf(body)).toBe(348);

      input.blur();

      expect(keyboardInsetOf(body)).toBe(348);

      viewport.height = 800;
      void act(() => viewport.dispatchEvent(new Event('resize')));
      expect(keyboardInsetOf(body)).toBe(0);
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
      expect(keyboardInsetOf(body)).toBe(348);

      rerender(content(false));

      expect(document.activeElement).not.toBe(input);
      expect(keyboardInsetOf(body)).toBe(348);

      viewport.height = 800;
      void act(() => viewport.dispatchEvent(new Event('resize')));
      expect(keyboardInsetOf(body)).toBe(0);
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
      expect(keyboardInsetOf(body)).toBe(348);

      rerender(content('confirmation'));

      expect(document.activeElement).not.toBe(input);
      expect(keyboardInsetOf(body)).toBe(348);

      viewport.height = 800;
      void act(() => viewport.dispatchEvent(new Event('resize')));
      expect(keyboardInsetOf(body)).toBe(0);
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

    it('puts back only the page\u2019s own scroll, never an element\u2019s scroll that reaches the window', () => {
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
      Object.defineProperty(window, 'scrollY', {
        configurable: true,
        value: 337,
      });
      try {
        fireEvent.scroll(body);
        expect(scrollTo).not.toHaveBeenCalled();
        fireEvent.scroll(window);
        expect(scrollTo).toHaveBeenCalledWith(0, 0);
      } finally {
        Object.defineProperty(window, 'scrollY', {
          configurable: true,
          value: 0,
        });
      }
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
      expect(keyboardInsetOf(body)).toBe(348);
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
      mockWindowHeight(800);
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
      const inset = keyboardInsetOf(body);
      expect(inset).toBe(layoutBottom - (500 - 48));

      // The browser pans the page up to reveal a field: the same 500px of
      // visible page, now offset so its bottom edge coincides with the layout
      // viewport bottom — with the keyboard still on screen. Read the bottom
      // and that is indistinguishable from the keyboard closing.
      viewport.offsetTop = window.innerHeight - 500;
      input.blur();

      // The keyboard did not change size, so neither does the scroll range.
      expect(keyboardInsetOf(body)).toBe(inset);
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
      const inset = keyboardInsetOf(body);
      expect(inset).toBe(layoutBottom - (500 - 48));

      viewport.offsetTop = layoutBottom - 500;
      void act(() => viewport.dispatchEvent(new Event('resize')));
      expect(keyboardInsetOf(body)).toBe(inset);

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
        // The return reveals nothing: the opener was on screen when the sheet
        // opened and the page has not moved since.
        expect(focus.mock.calls).toEqual([
          [{preventScroll: true, focusVisible: false}],
        ]);
      });

      it('leaves the ring to the browser after a keyboard close', () => {
        const opener = openThenClose('keyboard');
        const focus = vi.spyOn(opener, 'focus');
        finishSheetExit();

        expect(opener).toHaveFocus();
        expect(focus.mock.calls).toEqual([[{preventScroll: true}]]);
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
        expect(focus.mock.calls.at(-1)).toEqual([
          {preventScroll: true, focusVisible: false},
        ]);
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
        expect(focus.mock.calls).toEqual([
          [{preventScroll: true, focusVisible: false}],
        ]);
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

  describe('data-autofocus eligibility on open (AR4)', () => {
    function openWith(content: ReactNode, hasScrim = true) {
      render(
        <BottomSheet
          isOpen
          onOpenChange={() => {}}
          label="Filters"
          hasScrim={hasScrim}>
          {content}
        </BottomSheet>,
      );
    }
    const own = () => screen.getByRole('textbox', {name: 'Own'});

    it('focuses the field over a control placed before it, modal or not', () => {
      // Land on the first control, as Firefox's native focusing steps do, so
      // the test shows that the native landing does not count as placed.
      const landOnFirstControl = function (this: HTMLElement) {
        this.setAttribute('open', '');
        this.querySelector<HTMLElement>('button')?.focus();
      };
      HTMLDialogElement.prototype.showModal = vi.fn(landOnFirstControl);
      HTMLElement.prototype.showPopover = vi.fn(landOnFirstControl);
      for (const hasScrim of [true, false]) {
        openWith(
          <>
            <button type="button">First action</button>
            <input data-autofocus aria-label="Own" />
          </>,
          hasScrim,
        );
        expect(document.activeElement).toBe(own());
        cleanup();
      }
    });

    it('skips a field that belongs to a sheet nested in the content', () => {
      openWith(
        <>
          <dialog>
            <input data-autofocus aria-label="Nested" />
          </dialog>
          <input data-autofocus aria-label="Own" />
        </>,
      );
      expect(document.activeElement).toBe(own());
    });

    it('skips an inert field', () => {
      openWith(
        <>
          <div inert>
            <input data-autofocus aria-label="Inert" />
          </div>
          <input data-autofocus aria-label="Own" />
        </>,
      );
      expect(document.activeElement).toBe(own());
    });

    it('skips a field that is not rendered', () => {
      // jsdom has no layout, so the visibility check reads `hidden` here.
      const original = Object.getOwnPropertyDescriptor(
        HTMLElement.prototype,
        'checkVisibility',
      );
      Object.defineProperty(HTMLElement.prototype, 'checkVisibility', {
        configurable: true,
        value(this: HTMLElement) {
          return this.closest('[hidden]') == null;
        },
      });
      try {
        openWith(
          <>
            <input data-autofocus aria-label="Hidden" hidden />
            <input data-autofocus aria-label="Own" />
          </>,
        );
        expect(document.activeElement).toBe(own());
      } finally {
        if (original) {
          Object.defineProperty(
            HTMLElement.prototype,
            'checkVisibility',
            original,
          );
        } else {
          delete (HTMLElement.prototype as {checkVisibility?: unknown})
            .checkVisibility;
        }
      }
    });

    it('moves on from a candidate that refuses focus', () => {
      openWith(
        <>
          <div data-autofocus>Not focusable</div>
          <input data-autofocus aria-label="Own" />
        </>,
      );
      expect(document.activeElement).toBe(own());
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

    function stubReducedMotion(coarse: boolean) {
      vi.stubGlobal(
        'matchMedia',
        vi.fn((query: string) => ({
          matches:
            query === '(prefers-reduced-motion: reduce)' ||
            (coarse &&
              query ===
                '(prefers-reduced-motion: reduce) and (pointer: coarse)'),
          media: query,
          onchange: null,
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          addListener: vi.fn(),
          removeListener: vi.fn(),
          dispatchEvent: vi.fn(),
        })),
      );
    }

    function Controlled() {
      const [isOpen, setIsOpen] = useState(true);
      return (
        <BottomSheet isOpen={isOpen} onOpenChange={setIsOpen} label="Filters">
          <button type="button" onClick={() => setIsOpen(false)}>
            Close
          </button>
        </BottomSheet>
      );
    }

    it("a touch swipe dismissal under reduced motion fades out in place on a fine pointer (design:reduced-motion DR2, a touch drag's release)", () => {
      stubReducedMotion(false);
      const observers = mockResizeObserverInstances();
      render(<Controlled />);
      const dialog = screen.getByRole('dialog');
      layOutSheet(observers, getSheet());
      drag(getHandle(), [{y: 0}, {y: 40}, {y: 120}], 'touch');
      // Exiting: a transform end does not close the dialog, the fade does.
      fireEvent.transitionEnd(getSheet(), {propertyName: 'transform'});
      expect(dialog).toHaveAttribute('open');
      fireEvent.transitionEnd(getSheet(), {propertyName: 'opacity'});
      expect(dialog).not.toHaveAttribute('open');
    });

    it('a touch swipe dismissal does not outlive the sheet: reopened and closed from a control, it leaves at once again', () => {
      stubReducedMotion(false);
      function Reopenable() {
        const [isOpen, setIsOpen] = useState(true);
        return (
          <>
            <button type="button" onClick={() => setIsOpen(true)}>
              Open
            </button>
            <BottomSheet
              isOpen={isOpen}
              onOpenChange={setIsOpen}
              label="Filters">
              <button type="button" onClick={() => setIsOpen(false)}>
                Close
              </button>
            </BottomSheet>
          </>
        );
      }
      const observers = mockResizeObserverInstances();
      render(<Reopenable />);
      const dialog = screen.getByRole('dialog');
      layOutSheet(observers, getSheet());
      drag(getHandle(), [{y: 0}, {y: 40}, {y: 120}], 'touch');
      fireEvent.transitionEnd(getSheet(), {propertyName: 'opacity'});
      expect(dialog).not.toHaveAttribute('open');
      fireEvent.click(screen.getByRole('button', {name: 'Open'}));
      expect(dialog).toHaveAttribute('open');
      fireEvent.click(screen.getByRole('button', {name: 'Close'}));
      // A control dismissal: its collapsed transform end closes the dialog.
      fireEvent.transitionEnd(getSheet(), {propertyName: 'transform'});
      expect(dialog).not.toHaveAttribute('open');
    });

    it('a refused touch swipe spends its request: a guarded onOpenChange keeps the sheet open, and the next close from a control leaves at once', () => {
      stubReducedMotion(false);
      function Guarded() {
        const [isOpen, setIsOpen] = useState(true);
        const [isGuarded, setIsGuarded] = useState(true);
        return (
          <BottomSheet
            isOpen={isOpen}
            // The documented replacement for the switcher's onCancel: ignore
            // implicit closes while the step must stay open.
            onOpenChange={next => {
              if (!next && isGuarded) {
                return;
              }
              setIsOpen(next);
            }}
            label="Filters">
            <button type="button" onClick={() => setIsGuarded(false)}>
              Unlock
            </button>
            <button type="button" onClick={() => setIsOpen(false)}>
              Close
            </button>
          </BottomSheet>
        );
      }
      render(<Guarded />);
      const dialog = screen.getByRole('dialog');
      drag(getHandle(), [{y: 0}, {y: 40}, {y: 120}], 'touch');
      // Refused: the sheet stays open.
      expect(dialog).toHaveAttribute('open');
      fireEvent.click(screen.getByRole('button', {name: 'Unlock'}));
      fireEvent.click(screen.getByRole('button', {name: 'Close'}));
      // A control close: its collapsed transform end closes the dialog; the
      // spent swipe request does not turn it into a cross-fade.
      fireEvent.transitionEnd(getSheet(), {propertyName: 'transform'});
      expect(dialog).not.toHaveAttribute('open');
    });

    it('a mouse drag dismissal under reduced motion on a fine pointer leaves at once (DR3): a mouse or pen drag is not a touch drag', () => {
      stubReducedMotion(false);
      render(<Controlled />);
      const dialog = screen.getByRole('dialog');
      drag(getHandle(), [{y: 0}, {y: 40}, {y: 120}], 'mouse');
      fireEvent.transitionEnd(getSheet(), {propertyName: 'transform'});
      expect(dialog).not.toHaveAttribute('open');
    });

    it('a dismissal from a control under reduced motion on a fine pointer leaves at once (DR3): its (collapsed) transform end closes the dialog', () => {
      stubReducedMotion(false);
      render(<Controlled />);
      const dialog = screen.getByRole('dialog');
      fireEvent.click(screen.getByRole('button', {name: 'Close'}));
      fireEvent.transitionEnd(getSheet(), {propertyName: 'transform'});
      expect(dialog).not.toHaveAttribute('open');
    });

    it('a dismissal from a control under reduced motion on a coarse pointer fades out (DR2)', () => {
      stubReducedMotion(true);
      render(<Controlled />);
      const dialog = screen.getByRole('dialog');
      fireEvent.click(screen.getByRole('button', {name: 'Close'}));
      fireEvent.transitionEnd(getSheet(), {propertyName: 'transform'});
      expect(dialog).toHaveAttribute('open');
      fireEvent.transitionEnd(getSheet(), {propertyName: 'opacity'});
      expect(dialog).not.toHaveAttribute('open');
    });
  });

  describe('scrim property isolation', () => {
    // A drag writes the scrim's opacity on the dialog for each move, and only
    // the dialog's backdrop reads it. An inherited custom property restyles
    // every element under the one it changes on. jsdom reports the declared
    // `initial`. A browser computes no value, which the interaction proof
    // BottomSheetDragRestyle covers.
    it("declares the dialog's scrim properties `initial` on the sheet panel", () => {
      render(
        <BottomSheet isOpen onOpenChange={() => {}} label="Filters">
          Content
        </BottomSheet>,
      );
      const dialog = screen.getByRole('dialog', {hidden: true});
      dialog.style.setProperty('--_sheet-scrim-opacity', '0.5');
      dialog.style.setProperty('--_sheet-scrim-duration', '120ms');
      const computed = window.getComputedStyle(getSheet());
      expect(computed.getPropertyValue('--_sheet-scrim-opacity')).toBe(
        'initial',
      );
      expect(computed.getPropertyValue('--_sheet-scrim-duration')).toBe(
        'initial',
      );
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

// Tab from the last tabbable control wraps to the first and Shift+Tab from the
// first wraps to the last, so focus never leaves the modal for the browser's
// own UI.
function expectTabWrapsInside(modal: HTMLElement) {
  const tabbables = getFocusableElements(modal);
  expect(tabbables.length).toBeGreaterThan(0);
  const first = tabbables[0];
  const last = tabbables[tabbables.length - 1];

  last.focus();
  expect(last).toHaveFocus();
  expect(fireEvent.keyDown(last, {key: 'Tab'})).toBe(false);
  expect(first).toHaveFocus();

  expect(fireEvent.keyDown(first, {key: 'Tab', shiftKey: true})).toBe(false);
  expect(last).toHaveFocus();
}

describe('BottomSheet focus region (Dialog DEC-2)', () => {
  it('wraps Tab and Shift+Tab inside an open modal sheet', () => {
    render(
      <BottomSheet isOpen onOpenChange={() => {}} label="Filters">
        <button type="button">First</button>
        <button type="button">Last</button>
      </BottomSheet>,
    );
    expectTabWrapsInside(screen.getByRole('dialog'));
  });

  it('leaves Tab alone in a non-modal sheet', () => {
    render(
      <BottomSheet
        isOpen
        hasScrim={false}
        onOpenChange={() => {}}
        label="Filters">
        <button type="button">Only</button>
      </BottomSheet>,
    );
    const only = screen.getByRole('button', {name: 'Only'});
    only.focus();
    expect(fireEvent.keyDown(only, {key: 'Tab'})).toBe(true);
  });
});

// A same-name native radio group is one Tab stop: its checked radio, or its
// first when none is checked. Medium is checked and is neither first nor last.
function SizeRadios({name}: {name: string}) {
  return (
    <fieldset>
      <legend>Size</legend>
      <input type="radio" name={name} value="s" aria-label="Small" />
      <input
        type="radio"
        name={name}
        value="m"
        aria-label="Medium"
        defaultChecked
      />
      <input type="radio" name={name} value="l" aria-label="Large" />
    </fieldset>
  );
}

function expectRadioGroupEndsTheCycle() {
  const medium = screen.getByRole('radio', {name: 'Medium', hidden: true});
  const first = screen.getByRole('button', {name: 'First', hidden: true});
  medium.focus();
  expect(fireEvent.keyDown(medium, {key: 'Tab'})).toBe(false);
  expect(first).toHaveFocus();
  expect(fireEvent.keyDown(first, {key: 'Tab', shiftKey: true})).toBe(false);
  expect(medium).toHaveFocus();
}

function expectRadioGroupStartsTheCycle() {
  const medium = screen.getByRole('radio', {name: 'Medium', hidden: true});
  const last = screen.getByRole('button', {name: 'Last', hidden: true});
  medium.focus();
  expect(fireEvent.keyDown(medium, {key: 'Tab', shiftKey: true})).toBe(false);
  expect(last).toHaveFocus();
  expect(fireEvent.keyDown(last, {key: 'Tab'})).toBe(false);
  expect(medium).toHaveFocus();
}

describe('BottomSheet focus region: a radio group is one Tab stop', () => {
  it('wraps Tab from the checked radio of a group that ends the sheet', () => {
    render(
      <BottomSheet isOpen onOpenChange={() => {}} label="Filters">
        <button type="button">First</button>
        <SizeRadios name="size" />
      </BottomSheet>,
    );
    expectRadioGroupEndsTheCycle();
  });

  it('wraps Shift+Tab from the checked radio of a group that starts the sheet', () => {
    render(
      <BottomSheet isOpen onOpenChange={() => {}} label="Filters">
        <SizeRadios name="size" />
        <button type="button">Last</button>
      </BottomSheet>,
    );
    expectRadioGroupStartsTheCycle();
  });
});

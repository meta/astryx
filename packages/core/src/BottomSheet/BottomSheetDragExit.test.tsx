// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file BottomSheetDragExit.test.tsx
 * @input BottomSheet, with the shared animator replaced by a recorder
 * @output Unit tests for the exit a drag's close plays. It starts the close
 *   spring from where the finger left the sheet, and a reopen takes it back.
 *   The scrim fades for as long as that close plays, decided before the
 *   scrim starts to clear. That holds on a standalone sheet and on a
 *   switcher flow
 * @position The jsdom side of the drag exit; the Chromium release spec reads
 *   the curve the browser plays.
 */

import {act, fireEvent, render, screen} from '@testing-library/react';
import {useState} from 'react';
import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import {SETTLE_THRESHOLD} from '../motion/animator';
import type * as AnimatorModule from '../motion/animator';
import {solveSpring, toSpring} from '../motion/spring';
import {springs} from '../motion/uikit/springs';
import {BottomSheet} from './BottomSheet';
import {BottomSheetSwitcher} from './BottomSheetSwitcher';
import {resetBottomSheetStackForTests} from './bottomSheetStack';

interface RecordedExit {
  values: Record<string, number>;
  options: {velocity?: Record<string, number>};
  finish: () => void;
  retarget: ReturnType<typeof vi.fn>;
}

const exits: RecordedExit[] = [];

// The sheet's open height reaches it through a resize observer. A touch
// release lands by that geometry, so each test lays the sheet out.
const observers: {callback: ResizeObserverCallback; observed: Set<Element>}[] =
  [];
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

/** Lays the sheet out 400 px tall, as the browser's resize observer would. */
function layOutSheet(label = 'Sheet') {
  const sheet = document.querySelector<HTMLElement>(
    `dialog[aria-label="${label}"] .astryx-bottom-sheet`,
  );
  const observer = observers.find(
    instance => sheet != null && instance.observed.has(sheet),
  );
  const entry: Partial<ResizeObserverEntry> = {
    borderBoxSize: [{blockSize: 400, inlineSize: 100}],
    contentRect: {height: 400} as DOMRectReadOnly,
  };
  act(() => {
    observer?.callback(
      [entry as ResizeObserverEntry],
      observer as unknown as ResizeObserver,
    );
  });
}

vi.mock('../motion/animator', async importOriginal => {
  const actual = await importOriginal<typeof AnimatorModule>();
  return {
    ...actual,
    animatorFor: () => ({
      animate: (
        values: Record<string, number>,
        options: RecordedExit['options'],
      ) => {
        let finish = () => {};
        const finished = new Promise<boolean>(resolve => {
          finish = () => resolve(true);
        });
        const exit = {
          values,
          options,
          finish,
          retarget: vi.fn(),
          finished,
          started: Promise.resolve(0),
        };
        exits.push(exit);
        return exit;
      },
      set: vi.fn(),
    }),
  };
});

beforeEach(() => {
  exits.length = 0;
  observers.length = 0;
  vi.stubGlobal('ResizeObserver', ResizeObserverMock);
  resetBottomSheetStackForTests();
  HTMLDialogElement.prototype.showModal = vi.fn(function (
    this: HTMLDialogElement,
  ) {
    this.setAttribute('open', '');
  });
  HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
    this.removeAttribute('open');
  });
  if (!Element.prototype.setPointerCapture) {
    Element.prototype.setPointerCapture = vi.fn();
    Element.prototype.releasePointerCapture = vi.fn();
  }
  // The exit plays only where Web Animations exist.
  Element.prototype.animate = vi.fn();
  window.scrollTo = vi.fn();
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
});

afterEach(() => {
  Reflect.deleteProperty(Element.prototype, 'animate');
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function Host() {
  const [isOpen, setIsOpen] = useState(true);
  return (
    <>
      <button type="button" onClick={() => setIsOpen(true)}>
        Reopen
      </button>
      <BottomSheet isOpen={isOpen} onOpenChange={setIsOpen} label="Sheet">
        Content
      </BottomSheet>
    </>
  );
}

function getHandle(label = 'Sheet'): HTMLElement {
  const handle = document
    .querySelector(`dialog[aria-label="${label}"] .astryx-bottom-sheet`)
    ?.querySelector<HTMLElement>('[aria-hidden="true"]');
  if (handle == null) {
    throw new Error('grab handle not found');
  }
  return handle;
}

// Pointer events on one clock, 16 ms apart, so a drag's release velocity
// follows its events' own timestamps.
let pointerTime = 0;

function firePointer(
  target: Element,
  type: 'pointerdown' | 'pointermove' | 'pointerup',
  init: {pointerId: number; clientY: number; pointerType?: string},
) {
  pointerTime += 16;
  const event = new Event(type, {bubbles: true, cancelable: true});
  Object.defineProperties(event, {
    button: {value: 0},
    clientY: {value: init.clientY},
    isPrimary: {value: true},
    pointerId: {value: init.pointerId},
    timeStamp: {value: pointerTime},
  });
  if (init.pointerType != null) {
    Object.defineProperty(event, 'pointerType', {value: init.pointerType});
  }
  fireEvent(target, event);
}

/** A fast downward touch drag on the handle: a flick, which closes the sheet. */
function flickDown(label = 'Sheet') {
  const handle = getHandle(label);
  firePointer(handle, 'pointerdown', {
    pointerId: 1,
    pointerType: 'touch',
    clientY: 0,
  });
  firePointer(handle, 'pointermove', {pointerId: 1, clientY: 40});
  firePointer(handle, 'pointermove', {pointerId: 1, clientY: 120});
  firePointer(handle, 'pointerup', {pointerId: 1, clientY: 120});
}

it('plays the close spring when a drag closes the sheet', () => {
  render(<Host />);
  layOutSheet();
  flickDown();
  expect(exits).toHaveLength(1);
  expect(exits[0].values.y).toBeGreaterThan(0);
});

it('takes the sheet back to rest when it reopens during a drag exit', () => {
  render(<Host />);
  layOutSheet();
  flickDown();
  expect(exits).toHaveLength(1);
  act(() => {
    fireEvent.click(screen.getByRole('button', {name: 'Reopen'}));
  });
  expect(exits[0].retarget).toHaveBeenCalledWith({y: 0});
});

it('leaves a finished exit where it ended', async () => {
  render(<Host />);
  layOutSheet();
  flickDown();
  await act(async () => {
    exits[0].finish();
  });
  expect(exits[0].retarget).not.toHaveBeenCalled();
});

/** The inline fade duration on the sheet's dialog, '' when none. */
function scrimFade(label = 'Sheet'): string {
  const dialog = document.querySelector<HTMLDialogElement>(
    `dialog[aria-label="${label}"]`,
  );
  return dialog?.style.getPropertyValue('--_sheet-scrim-duration') ?? '';
}

it('fades the scrim for as long as the close plays when a drag closes the sheet', () => {
  render(<Host />);
  layOutSheet();
  flickDown();
  const [exit] = exits;
  // The move the animator was handed, timed as the animator times it. No
  // theme sets a tempo here.
  const close = solveSpring(toSpring(springs.sheetDismissSwipe), {
    from: 0,
    to: exit.values.y,
    velocity: exit.options.velocity?.y,
  });
  expect(scrimFade()).toBe(`${close.settleTime(SETTLE_THRESHOLD.y) * 1000}ms`);
});

/** Records each inline style property write, as `name: value`. */
function recordStyleWrites(): string[] {
  const writes: string[] = [];
  const setProperty = CSSStyleDeclaration.prototype.setProperty;
  vi.spyOn(CSSStyleDeclaration.prototype, 'setProperty').mockImplementation(
    function (
      this: CSSStyleDeclaration,
      name: string,
      value: string | null,
      priority?: string,
    ) {
      writes.push(`${name}: ${value}`);
      setProperty.call(this, name, value, priority);
    },
  );
  return writes;
}

/** Expects the scrim's fade to be written before the scrim starts to clear. */
function expectFadeBeforeClear(writes: string[]) {
  // A fade written after the clear would not reach the running transition.
  const fade = writes.findIndex(write =>
    write.startsWith('--_sheet-scrim-duration: '),
  );
  const clear = writes.indexOf('--_sheet-scrim-opacity: 0');
  expect(fade).toBeGreaterThanOrEqual(0);
  expect(clear).toBeGreaterThan(fade);
}

it("decides the scrim's fade before the scrim starts to clear", () => {
  const writes = recordStyleWrites();
  render(<Host />);
  layOutSheet();
  flickDown();
  expectFadeBeforeClear(writes);
});

function Flow() {
  const [activeSheet, setActiveSheet] = useState<string | null>('steps');
  return (
    <BottomSheetSwitcher
      activeSheet={activeSheet}
      onActiveSheetChange={setActiveSheet}>
      <BottomSheet sheetId="steps" label="Steps">
        Content
      </BottomSheet>
    </BottomSheetSwitcher>
  );
}

it("fades a switcher flow's scrim for as long as the close plays when a drag closes it", () => {
  const writes = recordStyleWrites();
  render(<Flow />);
  layOutSheet('Steps');
  flickDown('Steps');
  expect(exits).toHaveLength(1);
  const [exit] = exits;
  const close = solveSpring(toSpring(springs.sheetDismissSwipe), {
    from: 0,
    to: exit.values.y,
    velocity: exit.options.velocity?.y,
  });
  expect(scrimFade('Steps')).toBe(
    `${close.settleTime(SETTLE_THRESHOLD.y) * 1000}ms`,
  );
  expectFadeBeforeClear(writes);
});

it("clears the scrim's fade duration when the drag exit ends", async () => {
  render(<Host />);
  layOutSheet();
  flickDown();
  expect(scrimFade()).not.toBe('');
  await act(async () => {
    exits[0].finish();
  });
  expect(scrimFade()).toBe('');
});

it("clears the scrim's fade duration when the sheet reopens during a drag exit", () => {
  render(<Host />);
  layOutSheet();
  flickDown();
  act(() => {
    fireEvent.click(screen.getByRole('button', {name: 'Reopen'}));
  });
  expect(scrimFade()).toBe('');
});

it("leaves the scrim's fade alone when a mouse drag closes the sheet", () => {
  render(<Host />);
  layOutSheet();
  const handle = getHandle();
  firePointer(handle, 'pointerdown', {
    pointerId: 2,
    pointerType: 'mouse',
    clientY: 0,
  });
  firePointer(handle, 'pointermove', {pointerId: 2, clientY: 200});
  firePointer(handle, 'pointermove', {pointerId: 2, clientY: 390});
  firePointer(handle, 'pointerup', {pointerId: 2, clientY: 390});
  expect(exits).toHaveLength(0);
  expect(scrimFade()).toBe('');
});

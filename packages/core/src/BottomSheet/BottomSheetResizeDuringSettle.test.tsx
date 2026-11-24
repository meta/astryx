// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file BottomSheetResizeDuringSettle.test.tsx
 * @input BottomSheetPanel on a touch device, and a window resize (782 to
 *   806 px) that arrives while a release or a cancelled drag settles
 * @output Tests that the settle lands on its detent as the new window
 *   resolves it, with no later jump
 * @position Testing; validates the resize re-anchor in useSheetGestures.ts
 */

import {act, fireEvent, render} from '@testing-library/react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {BottomSheetPanel, type BottomSheetPanelState} from './BottomSheetPanel';

const panelTransitionStyle = {
  transitionProperty: 'transform, opacity',
  transitionDuration: '410ms',
  transitionDelay: '0ms',
};
const SNAP_POINTS: ReadonlyArray<number> = [0.14, 0.5, 0.92];

// The Tall budget is 92dvh plus the reserve below the screen; a touch device
// reserves max(48, ceil(0.4 * innerHeight)).
const reserveFor = (viewport: number) =>
  Math.max(48, Math.ceil(viewport * 0.4));
const borderBoxFor = (viewport: number) =>
  0.92 * viewport + reserveFor(viewport);
// The half-height detent's layout height: the border box less its travel.
const halfDetentLayoutHeightFor = (viewport: number) =>
  borderBoxFor(viewport) - (0.92 * viewport - 0.5 * viewport);

let frames: FrameRequestCallback[] = [];

beforeEach(() => {
  frames = [];
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches:
        query === '(any-pointer: coarse)' || query === '(pointer: coarse)',
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  );
  vi.stubGlobal(
    'requestAnimationFrame',
    vi.fn((callback: FrameRequestCallback) => {
      frames.push(callback);
      return frames.length;
    }),
  );
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  vi.stubGlobal('innerHeight', 782);
  if (!Element.prototype.setPointerCapture) {
    Element.prototype.setPointerCapture = vi.fn();
    Element.prototype.releasePointerCapture = vi.fn();
  }
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function flushFrames() {
  act(() => {
    for (let round = 0; round < 6 && frames.length > 0; round++) {
      frames.splice(0).forEach(frame => frame(0));
    }
  });
}

function rect(height: number): DOMRect {
  return {
    x: 0,
    y: 0,
    top: 0,
    right: 400,
    bottom: height,
    left: 0,
    width: 400,
    height,
    toJSON: () => ({}),
  };
}

interface ObserverRecord {
  callback: ResizeObserverCallback;
  observed: Set<Element>;
}

function mockResizeObservers(): ObserverRecord[] {
  const observers: ObserverRecord[] = [];
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

// Reports the sheet's border box as the browser's resize observer would.
function layOut(
  observers: ObserverRecord[],
  sheet: HTMLElement,
  height: number,
) {
  const observer = observers.find(instance => instance.observed.has(sheet));
  act(() => {
    observer?.callback(
      [
        {
          borderBoxSize: [{blockSize: height, inlineSize: 400}],
          contentRect: rect(height),
        } as unknown as ResizeObserverEntry,
      ],
      observer as unknown as ResizeObserver,
    );
  });
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

function Panel({
  state,
  onMotionComplete,
}: {
  state: BottomSheetPanelState;
  onMotionComplete?: (motion: string) => void;
}) {
  return (
    <BottomSheetPanel
      label="Composer"
      state={state}
      height="tall"
      snapPoints={SNAP_POINTS}
      style={panelTransitionStyle}
      onDismiss={() => {}}
      onScrimOpacity={() => {}}
      onMotionComplete={onMotionComplete}>
      Composer content
    </BottomSheetPanel>
  );
}

function getSheet(): HTMLElement {
  const sheet = document.querySelector<HTMLElement>('.astryx-bottom-sheet');
  if (sheet == null) {
    throw new Error('sheet not found');
  }
  return sheet;
}

function getHandle(): HTMLElement {
  const handle = getSheet().querySelector<HTMLElement>('[aria-hidden="true"]');
  if (handle == null) {
    throw new Error('handle not found');
  }
  return handle;
}

// The reserve the element carries right now: React writes it on render, so a
// resize listener that runs before the re-render still sees the old one.
const reserveOn = (sheet: HTMLElement) =>
  Number.parseFloat(sheet.style.getPropertyValue('--_sheet-reserve')) || 48;
// The sheet's box: its inline height while one is pinned, else the CSS height
// (92dvh of the current window plus the reserve the element carries).
function measureBox(sheet: HTMLElement) {
  return vi
    .spyOn(sheet, 'getBoundingClientRect')
    .mockImplementation(() =>
      rect(
        sheet.style.height
          ? Number.parseFloat(sheet.style.height)
          : 0.92 * window.innerHeight + reserveOn(sheet),
      ),
    );
}

function snapshot(sheet: HTMLElement) {
  return {
    height: sheet.style.height,
    transform: sheet.style.transform,
    transition: sheet.style.transition,
    reserve: sheet.style.getPropertyValue('--_sheet-reserve'),
    // What shows above the screen's edge: the pinned box less the reserve.
    visible: sheet.style.height
      ? Number(
          (Number.parseFloat(sheet.style.height) - reserveOn(sheet)).toFixed(2),
        )
      : null,
  };
}

function resizeTo(viewport: number) {
  vi.stubGlobal('innerHeight', viewport);
  act(() => {
    window.dispatchEvent(new Event('resize'));
  });
}

// Drags the handle 250 px down slowly and releases: the nearest stop is the
// half-height detent (328.44 px of travel at 782), so the release settles
// there with animation.
function releaseTowardHalfDetent() {
  const handle = getHandle();
  fireTimedPointer(handle, 'pointerdown', {time: 0, y: 0});
  fireTimedPointer(handle, 'pointermove', {time: 1000, y: 250});
  fireTimedPointer(handle, 'pointerup', {time: 2000, y: 250});
}

// Lands the sheet where a release or a cancel sent it: the transform's
// transition ends, then the transition-free reconcile frame runs.
function landSettle(sheet: HTMLElement) {
  fireEvent.transitionEnd(sheet, {propertyName: 'transform'});
  flushFrames();
}

function layoutHeight(sheet: HTMLElement) {
  return Number.parseFloat(sheet.style.height);
}

describe('BottomSheet: a window resize while the sheet settles', () => {
  it('lands a release on its detent as the new window resolves it', () => {
    const observers = mockResizeObservers();
    render(<Panel state={{kind: 'open', entering: false}} />);
    const sheet = getSheet();
    measureBox(sheet);
    layOut(observers, sheet, borderBoxFor(782));

    releaseTowardHalfDetent();
    resizeTo(806);
    landSettle(sheet);

    expect(layoutHeight(sheet)).toBeCloseTo(halfDetentLayoutHeightFor(806), 1);
  });

  it('lands a release on its detent when the window shrinks mid-settle', () => {
    vi.stubGlobal('innerHeight', 806);
    const observers = mockResizeObservers();
    render(<Panel state={{kind: 'open', entering: false}} />);
    const sheet = getSheet();
    measureBox(sheet);
    layOut(observers, sheet, borderBoxFor(806));

    releaseTowardHalfDetent();
    resizeTo(782);
    landSettle(sheet);

    expect(layoutHeight(sheet)).toBeCloseTo(halfDetentLayoutHeightFor(782), 1);
    expect(snapshot(sheet).visible).toBeCloseTo(0.5 * 782, 1);
  });

  it('leaves nothing for a later resize to correct', () => {
    const observers = mockResizeObservers();
    render(<Panel state={{kind: 'open', entering: false}} />);
    const sheet = getSheet();
    measureBox(sheet);
    layOut(observers, sheet, borderBoxFor(782));

    releaseTowardHalfDetent();
    resizeTo(806);
    landSettle(sheet);
    const landed = snapshot(sheet);
    resizeTo(806);

    expect(snapshot(sheet)).toEqual(landed);
  });

  it('lands a cancelled drag on its detent as the new window resolves it', () => {
    const observers = mockResizeObservers();
    render(<Panel state={{kind: 'open', entering: false}} />);
    const sheet = getSheet();
    measureBox(sheet);
    layOut(observers, sheet, borderBoxFor(782));
    releaseTowardHalfDetent();
    landSettle(sheet);

    const handle = getHandle();
    fireTimedPointer(handle, 'pointerdown', {time: 3000, y: 300});
    fireTimedPointer(handle, 'pointermove', {time: 3500, y: 360});
    act(() => {
      window.dispatchEvent(new Event('blur'));
    });
    resizeTo(806);
    landSettle(sheet);

    expect(layoutHeight(sheet)).toBeCloseTo(halfDetentLayoutHeightFor(806), 1);
  });

  it('keeps the sheet on the bottom edge when the window loses half its height mid-settle', () => {
    const observers = mockResizeObservers();
    render(<Panel state={{kind: 'open', entering: false}} />);
    const sheet = getSheet();
    measureBox(sheet);
    layOut(observers, sheet, borderBoxFor(782));
    releaseTowardHalfDetent();
    landSettle(sheet);

    // A short pull from the half detent, cancelled: it settles back there.
    const handle = getHandle();
    fireTimedPointer(handle, 'pointerdown', {time: 3000, y: 300});
    fireTimedPointer(handle, 'pointermove', {time: 3500, y: 360});
    act(() => {
      window.dispatchEvent(new Event('blur'));
    });
    resizeTo(327);

    const translation =
      Number.parseFloat(
        /translateY\((-?[\d.]+)px\)/.exec(sheet.style.transform)?.[1] ?? '0',
      ) || 0;
    expect(translation).toBeGreaterThanOrEqual(-reserveOn(sheet));
    landSettle(sheet);
    expect(layoutHeight(sheet)).toBeCloseTo(halfDetentLayoutHeightFor(327), 1);
    expect(snapshot(sheet).visible).toBeCloseTo(0.5 * 327, 1);
  });

  it('re-anchors a resting sheet at once', () => {
    const observers = mockResizeObservers();
    render(<Panel state={{kind: 'open', entering: false}} />);
    const sheet = getSheet();
    measureBox(sheet);
    layOut(observers, sheet, borderBoxFor(782));
    releaseTowardHalfDetent();
    landSettle(sheet);
    expect(layoutHeight(sheet)).toBeCloseTo(halfDetentLayoutHeightFor(782), 1);

    resizeTo(806);

    expect(layoutHeight(sheet)).toBeCloseTo(halfDetentLayoutHeightFor(806), 1);
    expect(snapshot(sheet).visible).toBeCloseTo(0.5 * 806, 1);
  });
});

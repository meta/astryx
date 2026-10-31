// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file PressTracker.test.ts
 * @input A PressTracker fed through a GestureArena by synthetic touches
 * @output UIControl semantics: events, the expanded tracking bounds, the
 *   highlight timing inside and outside scrollers, cancellation
 * @position Unit tests of packages/core/src/gestures/PressTracker.ts
 */

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {UIKIT_GESTURES} from '../../motion/uikit/gestures';
import {PanGestureRecognizer} from '../PanGestureRecognizer';
import {
  PRESS_PROFILES,
  createPressTracker,
  type ControlEvent,
} from '../PressTracker';
import {TapGestureRecognizer} from '../TapGestureRecognizer';
import {createHarness, scrollProbe} from './harness';

const BOUNDS = {left: 100, top: 100, right: 200, bottom: 140};
const EXPANSION = UIKIT_GESTURES.control.trackingExpansion.value;
const DELAY = UIKIT_GESTURES.press.contentTouchDelay.value;
const FLASH = UIKIT_GESTURES.press.quickTapFlash.value;

function setup() {
  const events: ControlEvent[] = [];
  const highlights: boolean[] = [];
  const tracker = createPressTracker({
    getBounds: () => BOUNDS,
    onControlEvent: event => events.push(event),
    onHighlightChange: value => highlights.push(value),
  });
  return {events, highlights, tracker, h: createHarness()};
}

describe('PressTracker', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('highlights in the same frame outside a scroller and acts on touch up inside', () => {
    const {events, highlights, tracker, h} = setup();
    h.finger(1).down(150, 120, 0, {recognizers: [], consumer: tracker});
    expect(highlights).toEqual([true]);
    h.finger(1).move(152, 121, 16);
    h.finger(1).up(80);
    expect(events).toEqual(['touchDown', 'touchDragInside', 'touchUpInside']);
    expect(highlights).toEqual([true, false]);
  });

  it('brakes only a finger: a mouse or pen press right after a finger-driven scroll still presses (spec:AST-094 FR11)', () => {
    for (const pointerType of ['mouse', 'pen'] as const) {
      const events: ControlEvent[] = [];
      const tracker = createPressTracker({
        getBounds: () => BOUNDS,
        onControlEvent: event => events.push(event),
        // A finger set a scroll moving a moment ago.
        isBraking: () => true,
      });
      const h = createHarness();
      h.finger(1).down(150, 120, 0, {
        recognizers: [],
        consumer: tracker,
        pointerType,
      });
      h.finger(1).up(80);
      expect(events).toEqual(['touchDown', 'touchUpInside']);
    }
    // A finger that brakes the scroll presses nothing.
    const events: ControlEvent[] = [];
    const tracker = createPressTracker({
      getBounds: () => BOUNDS,
      onControlEvent: event => events.push(event),
      isBraking: () => true,
    });
    const h = createHarness();
    h.finger(1).down(150, 120, 0, {recognizers: [], consumer: tracker});
    h.finger(1).up(80);
    expect(events).toEqual([]);
  });

  it('keeps tracking inside the expanded bounds and exits past them', () => {
    const {events, highlights, tracker, h} = setup();
    const finger = h.finger(1).down(150, 120, 0, {
      recognizers: [],
      consumer: tracker,
    });
    finger.move(200 + EXPANSION, 120, 16);
    expect(tracker.isTouchInside).toBe(true);
    finger.move(200 + EXPANSION + 1, 120, 32);
    expect(tracker.isTouchInside).toBe(false);
    finger.move(150, 120, 48);
    finger.up(64, 200 + EXPANSION + 10, 120);
    expect(events).toEqual([
      'touchDown',
      'touchDragInside',
      'touchDragExit',
      'touchDragOutside',
      'touchDragEnter',
      'touchDragInside',
      'touchUpOutside',
    ]);
    expect(highlights).toEqual([true, false, true, false]);
  });

  it('waits the content-touch delay inside a scroller, and flashes a quicker tap', () => {
    const {highlights, tracker, h} = setup();
    const probe = scrollProbe(() => true, true);
    h.finger(1).down(150, 120, 0, {
      recognizers: [],
      consumer: tracker,
      scroll: probe,
    });
    expect(highlights).toEqual([]);
    vi.advanceTimersByTime(DELAY - 1);
    expect(highlights).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(highlights).toEqual([true]);
    h.finger(1).up(400);
    expect(highlights).toEqual([true, false]);

    const quick = setup();
    quick.h.finger(1).down(150, 120, 0, {
      recognizers: [],
      consumer: quick.tracker,
      scroll: probe,
    });
    quick.h.finger(1).up(60);
    expect(quick.highlights).toEqual([true]);
    vi.advanceTimersByTime(FLASH);
    expect(quick.highlights).toEqual([true, false]);
  });

  it('never paints a pending press whose finger travelled (a flick)', () => {
    const {highlights, tracker, h} = setup();
    const probe = scrollProbe(() => true, true);
    h.finger(1).down(150, 120, 0, {
      recognizers: [],
      consumer: tracker,
      scroll: probe,
    });
    h.finger(1).move(150, 140, 20);
    vi.advanceTimersByTime(DELAY * 2);
    expect(highlights).toEqual([]);
  });

  it('is cancelled, with no release, when a recognizer takes the touch', () => {
    const {events, highlights, tracker, h} = setup();
    const pan = new PanGestureRecognizer({name: 'pan'});
    h.finger(1).down(150, 120, 0, {recognizers: [pan], consumer: tracker});
    h.finger(1).move(175, 120, 16);
    expect(events).toEqual(['touchDown', 'touchCancel']);
    expect(highlights).toEqual([true, false]);
  });

  it('is cancelled when the browser takes the touch to scroll', () => {
    const {events, tracker, h} = setup();
    h.finger(1).down(150, 120, 0, {recognizers: [], consumer: tracker});
    h.finger(1).takenByBrowser(30);
    expect(events).toEqual(['touchDown', 'touchCancel']);
    expect(tracker.isTracking).toBe(false);
  });

  it('tracks one finger at a time', () => {
    const {events, tracker, h} = setup();
    h.finger(1).down(150, 120, 0, {recognizers: [], consumer: tracker});
    h.finger(2).down(160, 120, 10, {recognizers: [], consumer: tracker});
    h.finger(2).up(20);
    h.finger(1).up(30);
    expect(events).toEqual(['touchDown', 'touchUpInside']);
  });
});

describe('PressTracker cell profile', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  function cell() {
    const events: ControlEvent[] = [];
    const highlights: boolean[] = [];
    const tracker = createPressTracker({
      getBounds: () => BOUNDS,
      ...PRESS_PROFILES.cell,
      onControlEvent: event => events.push(event),
      onHighlightChange: value => highlights.push(value),
    });
    return {events, highlights, tracker, h: createHarness()};
  }

  it('highlights at once outside a scroller: the delay applies only inside one (AST-094 FR11)', () => {
    const {highlights, tracker, h} = cell();
    h.finger(1).down(150, 120, 0, {recognizers: [], consumer: tracker});
    expect(highlights).toEqual([true]);
    vi.advanceTimersByTime(DELAY);
    expect(highlights).toEqual([true]);
    h.finger(1).up(DELAY + 40);
    expect(highlights).toEqual([true, false]);
  });

  it('waits the content-touch delay inside a scroller', () => {
    const {highlights, tracker, h} = cell();
    h.finger(1).down(150, 120, 0, {
      recognizers: [],
      consumer: tracker,
      scroll: scrollProbe(() => true, true),
    });
    expect(highlights).toEqual([]);
    vi.advanceTimersByTime(DELAY);
    expect(highlights).toEqual([true]);
    h.finger(1).up(DELAY + 40);
    expect(highlights).toEqual([true, false]);
  });

  it('is cancelled for good once the finger travels past the pan hysteresis', () => {
    const {events, highlights, tracker, h} = cell();
    const finger = h.finger(1).down(150, 120, 0, {
      recognizers: [],
      consumer: tracker,
    });
    vi.advanceTimersByTime(DELAY);
    const limit = UIKIT_GESTURES.pan.hysteresis.value;
    finger.move(150, 120 + limit, DELAY + 16);
    expect(tracker.isTracking).toBe(true);
    finger.move(150, 120 + limit + 1, DELAY + 32);
    expect(tracker.isTracking).toBe(false);
    // Back inside: no re-highlight, and the lift does nothing.
    finger.move(150, 120, DELAY + 48);
    finger.up(DELAY + 64);
    expect(events).toEqual(['touchDown', 'touchDragInside', 'touchCancel']);
    expect(highlights).toEqual([true, false]);
  });

  it('shows a quicker tap at the lift straight into the release, with no flash', () => {
    const {events, highlights, tracker, h} = cell();
    h.finger(1).down(150, 120, 0, {recognizers: [], consumer: tracker});
    h.finger(1).up(60);
    expect(events).toEqual(['touchDown', 'touchUpInside']);
    expect(highlights).toEqual([true, false]);
  });

  it('keeps the control profile on today defaults, with the button release clock', () => {
    expect(PRESS_PROFILES.control.highlightDelay).toBe('inScrollers');
    expect(PRESS_PROFILES.control.quickTapFlash).toBe(FLASH);
    expect(PRESS_PROFILES.cell.cancelTravel).toBe(
      UIKIT_GESTURES.pan.hysteresis.value,
    );
  });
});

describe('PressTracker in the arena', () => {
  it("lets a control veto an ancestor's single tap (UIControl's rule)", () => {
    const h = createHarness();
    const button = createPressTracker({getBounds: () => null, view: 'button'});
    const tap = new TapGestureRecognizer({name: 'tap'});
    tap.view = 'row';
    const double = new TapGestureRecognizer({
      name: 'double',
      numberOfTapsRequired: 2,
    });
    double.view = 'row';
    h.finger(1).down(0, 0, 0, {recognizers: [tap, double], consumer: button});
    expect(h.finger(1).up(50)).toBe('defer');
    expect(h.log[0]).toBe('tap:failed@50');
    expect(double.state).toBe('possible');
  });
});

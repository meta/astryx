// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file useSheetGestures.test.ts
 * @input Uses vitest, @testing-library/react renderHook, useSheetGestures
 * @output Unit tests for useSheetGestures behavior
 * @position Testing; validates useSheetGestures.ts implementation
 *
 * SYNC: When useSheetGestures.ts changes, update tests to match new behavior
 */

import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';
import {act, renderHook} from '@testing-library/react';
import {useState} from 'react';
import {END_HOLD_MS} from '../motion/animator';
/** The properties a played animation changes over its keyframes. */
function changedProperties(animation: {keyframes: Keyframe[]}): string[] {
  const first = (animation.keyframes[0] ?? {}) as Record<string, unknown>;
  const changed = new Set<string>();
  for (const frame of animation.keyframes) {
    for (const [key, value] of Object.entries(frame)) {
      if (key !== 'offset' && key !== 'easing' && key !== 'composite') {
        if (String(value) !== String(first[key])) {
          changed.add(key);
        }
      }
    }
  }
  return [...changed];
}

/** When a played animation stops changing, in ms after its start. */
function settledMs(animation: {
  keyframes: Keyframe[];
  options: KeyframeAnimationOptions;
}): number {
  const frames = animation.keyframes as Record<string, unknown>[];
  const last = frames[frames.length - 1];
  const same = (a: Record<string, unknown>, b: Record<string, unknown>) =>
    Object.keys({...a, ...b}).every(
      key =>
        key === 'offset' ||
        key === 'easing' ||
        key === 'composite' ||
        String(a[key]) === String(b[key]),
    );
  let i = frames.length - 1;
  while (i > 0 && same(frames[i - 1], last)) {
    i -= 1;
  }
  const offset =
    typeof frames[i].offset === 'number'
      ? (frames[i].offset as number)
      : i / Math.max(1, frames.length - 1);
  return offset * (animation.options.duration as number);
}

import {solveSpring, toSpring} from '../motion/spring';
import {sheet, springs} from '../motion/uikit';
import {
  isInsideNestedLayer,
  useSheetGestures,
  type UseSheetGesturesOptions,
} from './useSheetGestures';

const SHEET_HEIGHT = 400;

// A fake pointer event object good enough for the handlers, which only read
// pointerId, clientY, timeStamp, preventDefault, and currentTarget's capture +
// measure APIs.
function pointerEvent(
  clientY: number,
  timeStamp: number,
  target: HTMLElement,
  pointerId = 1,
  button = 0,
  isPrimary = true,
) {
  return {
    pointerId,
    button,
    isPrimary,
    clientY,
    timeStamp,
    currentTarget: target,
    preventDefault: vi.fn(),
  } as unknown as React.PointerEvent;
}

function makeTarget(): HTMLElement {
  const el = document.createElement('div');
  el.setPointerCapture = vi.fn();
  el.releasePointerCapture = vi.fn();
  el.getBoundingClientRect = () => ({height: SHEET_HEIGHT}) as DOMRect;
  return el;
}

beforeEach(() => {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }),
  );
  // The release springs run on the motion foundation's animator, whose clock
  // is performance.now() and whose curves end on a timer: fake both, so a
  // test decides when a spring has landed.
  vi.useFakeTimers({
    toFake: [
      'performance',
      'setTimeout',
      'clearTimeout',
      'requestAnimationFrame',
      'cancelAnimationFrame',
    ],
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/**
 * A finger: a coarse primary pointer, here in WebKit on iOS. Every touch
 * device takes UIKit's rule and springs (one touch model, AST-094); a mouse
 * keeps today's (releaseMotion.ts, sheetRelease.ts).
 */
/**
 * A coarse primary pointer, where the sheet's touch listeners exist
 * (spec:AST-094 FR24); every other query stays unmatched.
 */
function stubCoarsePointer() {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: query.includes('pointer: coarse'),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
}

function stubIosIdiom({reducedMotion = false}: {reducedMotion?: boolean} = {}) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches:
        query.includes('pointer: coarse') ||
        (reducedMotion && query.includes('prefers-reduced-motion')),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
  vi.stubGlobal('CSS', {
    supports: (condition: string) =>
      condition.includes('-webkit-touch-callout'),
    escape: (value: string) => value,
  });
}

/** Lets every running spring reach its end (the animator's clock and timers). */
function land() {
  act(() => {
    vi.advanceTimersByTime(2000);
  });
}

/** The sheet's travel channel (`translate`), in px down. */
function travel(el: HTMLElement): number {
  const [, y = '0px'] = el.style.translate.split(' ');
  return Number.parseFloat(y);
}

/** A keyframe's vertical travel, px (its `translate`). */
function translateYOf(frame: Keyframe): number {
  return Number.parseFloat(String(frame.translate).split(' ')[1]);
}

/**
 * The keyframes a recorded animation plays up to `untilMs` after its start,
 * as (ms, value). The animator compiles a curve into keyframes on a 30 Hz
 * grid, splitting each chord until it is within a quarter of a pixel of the
 * curve: every keyframe lies on the curve, and a point between two is the
 * browser's interpolation, so a curve is checked at its keyframes.
 */
function keyframesUntil(
  animation: {keyframes: Keyframe[]; options: KeyframeAnimationOptions},
  read: (frame: Keyframe) => number,
  untilMs: number,
): {t: number; value: number}[] {
  const duration = animation.options.duration as number;
  const frames = animation.keyframes
    .map(frame => ({
      t: (frame.offset as number) * duration,
      value: read(frame),
    }))
    .filter(frame => frame.t <= untilMs);
  // The grid puts a keyframe in every 30 Hz interval.
  expect(frames.length).toBeGreaterThanOrEqual(
    Math.floor(untilMs / (1000 / 30)),
  );
  return frames;
}

/**
 * A finger moving from `from` to `to` (px) between `t0` and `t1` (ms) on
 * pointer events every `step` ms (60 Hz by default): the estimator reads
 * gaps longer than its assume-stopped window as a finger at rest, so a
 * throw is a stream, not two samples.
 */
function stream(
  hook: Hook,
  target: HTMLElement,
  {
    from,
    to,
    t0,
    t1,
    step = 1000 / 60,
  }: {
    from: number;
    to: number;
    t0: number;
    t1: number;
    step?: number;
  },
) {
  const count = Math.max(1, Math.round((t1 - t0) / step));
  for (let i = 1; i <= count; i++) {
    move(
      hook,
      from + ((to - from) * i) / count,
      t0 + ((t1 - t0) * i) / count,
      target,
    );
  }
}

function setup(options: Partial<UseSheetGesturesOptions> = {}) {
  const onDismiss = vi.fn();
  const hook = renderHook(
    (props: UseSheetGesturesOptions) => useSheetGestures(props),
    {
      initialProps: {
        isOpen: true,
        onDismiss,
        ...options,
      },
    },
  );
  return {hook, onDismiss};
}

type Hook = {
  result: {current: ReturnType<typeof useSheetGestures>};
};

// The live drag position: written per input sample, not rendered.
function liveOffset(hook: Hook): number {
  return hook.result.current.activeOffsetRef.current;
}

function down(hook: Hook, y: number, t: number, target: HTMLElement) {
  // Register the sheet element the way the component does on mount, so the
  // hook can measure its height (it no longer queries the DOM for it).
  act(() => hook.result.current.sheetRef(target));
  act(() =>
    hook.result.current.handleProps.onPointerDown(pointerEvent(y, t, target)),
  );
}
// The same press and move from a finger (pointerType "touch").
function fingerEvent(clientY: number, timeStamp: number, target: HTMLElement) {
  return {
    ...pointerEvent(clientY, timeStamp, target),
    pointerType: 'touch',
  } as unknown as React.PointerEvent;
}
function move(hook: Hook, y: number, t: number, target: HTMLElement) {
  act(() =>
    hook.result.current.handleProps.onPointerMove(pointerEvent(y, t, target)),
  );
}
/**
 * The finger comes to rest at `y`: two still moves after it gets there.
 * UIKit's velocity filter (0.2 × the newest event's speed + 0.8 × the one
 * before) only reads zero after two of them, and never decays on its own: a
 * finger that stops sending events keeps its last speed.
 */
function restAt(hook: Hook, y: number, t: number, target: HTMLElement) {
  move(hook, y, t, target);
  move(hook, y, t + 50, target);
  move(hook, y, t + 100, target);
}

function up(hook: Hook, y: number, t: number, target: HTMLElement) {
  act(() =>
    hook.result.current.handleProps.onPointerUp(pointerEvent(y, t, target)),
  );
  // The release spring lands before the test goes on, as a finger that lifts
  // and comes back later would find it.
  land();
}

describe('isInsideNestedLayer', () => {
  it("is true for a target inside a <dialog> rendered within the body, and false for the body's own content", () => {
    const body = document.createElement('div');
    const own = document.createElement('button');
    body.append(own);
    const nested = document.createElement('dialog');
    const nestedHandle = document.createElement('div');
    nested.append(nestedHandle);
    body.append(nested);
    expect(isInsideNestedLayer(own, body)).toBe(false);
    expect(isInsideNestedLayer(body, body)).toBe(false);
    expect(isInsideNestedLayer(nestedHandle, body)).toBe(true);
    expect(isInsideNestedLayer(nested, body)).toBe(true);
    // A dialog above the body (the sheet's own) does not count.
    const ownDialog = document.createElement('dialog');
    ownDialog.append(body);
    expect(isInsideNestedLayer(own, body)).toBe(false);
    expect(isInsideNestedLayer(null, body)).toBe(false);
  });
});

describe('useSheetGestures', () => {
  it('dismisses on a fast downward flick (swipe-to-close)', () => {
    const {hook, onDismiss} = setup({snapHeights: () => [200]});
    const t = makeTarget();
    down(hook, 0, 0, t);
    // 60px in 20ms = 3px/ms, and 60px > the flick distance floor (two
    // moves: the release filter needs two moved samples, spec:AST-100 FR2).
    move(hook, 30, 10, t);
    move(hook, 60, 20, t);
    up(hook, 60, 22, t);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('settles instead of dismissing on a downward flick when canDismiss is false', () => {
    const onSnap = vi.fn();
    const onScrimOpacity = vi.fn();
    const {hook, onDismiss} = setup({
      canDismiss: false,
      snapHeights: () => [200],
      onSnap,
      onScrimOpacity,
    });
    const t = makeTarget();
    down(hook, 0, 0, t);
    move(hook, 30, 10, t);
    move(hook, 60, 20, t);
    up(hook, 60, 22, t);

    expect(onDismiss).not.toHaveBeenCalled();
    expect(hook.result.current.settledOffset).toBe(200);
    expect(onSnap).toHaveBeenLastCalledWith(200);
    // The 200px stop is half the sheet — a working surface, not a peek — so
    // the backdrop stays full there.
    expect(onScrimOpacity).toHaveBeenLastCalledWith(1);
  });

  it('expands to the tallest detent on a fast upward flick', () => {
    const onSnap = vi.fn();
    const {hook, onDismiss} = setup({snapHeights: () => [200], onSnap});
    const t = makeTarget();
    // Start rested at a lower detent by first snapping there via a slow drag.
    down(hook, 0, 0, t);
    move(hook, 200, 400, t); // slow drag down toward the 200px detent
    up(hook, 200, 800, t);
    onSnap.mockClear();
    // Now flick up fast: 60px in 20ms = 3px/ms, over the distance floor.
    down(hook, 200, 1000, t);
    move(hook, 170, 1010, t);
    move(hook, 140, 1020, t);
    up(hook, 140, 1022, t);
    expect(onDismiss).not.toHaveBeenCalled();
    expect(onSnap).toHaveBeenLastCalledWith(SHEET_HEIGHT); // full height
    expect(hook.result.current.settledOffset).toBe(0);
  });

  describe("release projection under a finger (UIKit's rule)", () => {
    beforeEach(() => stubIosIdiom());

    // A release is judged where the sheet would be after
    // sheet.release.projectionSeconds at the finger's velocity, not where the
    // finger left it; the dismissed position (gone below the screen) counts
    // as one of the positions (sheetRelease.ts). Here: detents at 0 and 200,
    // gone at 400.
    it('dismisses a throw released short of halfway to gone', () => {
      const {hook, onDismiss} = setup({snapHeights: () => [200]});
      const t = makeTarget();
      down(hook, 0, 0, t);
      // 1600 px/s: the finger stops at 160, but the release projects to
      // 160 + 1600 × 0.1 = 320, nearer gone (400) than the detent (200).
      stream(hook, t, {from: 0, to: 160, t0: 0, t1: 100});
      up(hook, 160, 102, t);
      expect(onDismiss).toHaveBeenCalledTimes(1);
    });

    it('lands a throw on the next detent once it projects past halfway', () => {
      const onSnap = vi.fn();
      const {hook, onDismiss} = setup({snapHeights: () => [200], onSnap});
      const t = makeTarget();
      down(hook, 0, 0, t);
      // 600 px/s from 60: projected 60 + 68 = 128, past halfway to 200.
      stream(hook, t, {from: 0, to: 60, t0: 0, t1: 100});
      up(hook, 60, 102, t);
      expect(onDismiss).not.toHaveBeenCalled();
      expect(hook.result.current.settledOffset).toBe(200);
      expect(onSnap).toHaveBeenLastCalledWith(200);
    });

    it('returns a gentle throw that does not project past halfway', () => {
      const {hook} = setup({snapHeights: () => [200]});
      const t = makeTarget();
      down(hook, 0, 0, t);
      // 300 px/s from 60: projected 94, still nearer the open detent.
      stream(hook, t, {from: 0, to: 60, t0: 0, t1: 200});
      up(hook, 60, 202, t);
      expect(hook.result.current.settledOffset).toBe(0);
    });

    it('reads a throw that begins after a hold at its own speed, not the average since touch-down', () => {
      const {hook} = setup({snapHeights: () => [200]});
      const t = makeTarget();
      down(hook, 0, 0, t);
      move(hook, 0, 250, t); // a still hold on the handle
      // then 1200 px/s: projected 60 + 137 = 197 → the 200 detent. The
      // average since touch-down (200 px/s) would have projected 83 → open.
      stream(hook, t, {from: 0, to: 60, t0: 250, t1: 300});
      up(hook, 60, 302, t);
      expect(hook.result.current.settledOffset).toBe(200);
    });

    it('reads the velocity from the timestamps the events carry, not from when they are handled', () => {
      // The same throw, handled late and all at once: the release still
      // projects at the speed the finger moved.
      const {hook, onDismiss} = setup({snapHeights: () => [200]});
      const t = makeTarget();
      down(hook, 0, 0, t);
      vi.advanceTimersByTime(500); // a busy main thread, then the batch
      stream(hook, t, {from: 0, to: 150, t0: 0, t1: 100});
      up(hook, 150, 102, t);
      expect(onDismiss).toHaveBeenCalledTimes(1);
    });

    it('keeps the throw through a still finger lifted within 40 ms, as UIKit does', () => {
      // A still finger sends no events to lower the speed: UIKit reports
      // the last moving velocity at the lift (spec:AST-100 FR2).
      const {hook, onDismiss} = setup({snapHeights: () => [200]});
      const t = makeTarget();
      down(hook, 0, 0, t);
      stream(hook, t, {from: 0, to: 60, t0: 0, t1: 20, step: 10}); // 3000 px/s ...
      up(hook, 60, 55, t); // ... then 35 ms still, then the lift
      // Projected 60 + 3000 × 0.1 = 360, nearest gone (400).
      expect(onDismiss).toHaveBeenCalledTimes(1);
    });

    it('cancels a release moving back toward where the drag began, whatever the travel so far (spec:AST-094 FR37)', () => {
      const {hook, onDismiss} = setup({snapHeights: () => [200]});
      const t = makeTarget();
      // From the tallest detent down past the midpoint to 150 px ...
      down(hook, 0, 0, t);
      stream(hook, t, {from: 0, to: 150, t0: 0, t1: 300});
      // ... then back up at 50 px/s and let go at 146 px, nearest the 200 px
      // detent: the drag cancels to where it began.
      move(hook, 148, 340, t);
      move(hook, 146, 380, t);
      up(hook, 146, 382, t);
      expect(onDismiss).not.toHaveBeenCalled();
      expect(hook.result.current.settledOffset).toBe(0);
    });

    it('releases no throw from a finger held still for longer than 40 ms before the lift', () => {
      // UIKit would keep the last motion through a silent rest; the release
      // filter reads 0 after its stillness interval, as Android's does, so a
      // finger that stopped never flicks (spec:AST-100 FR2).
      const {hook, onDismiss} = setup({snapHeights: () => [200]});
      const t = makeTarget();
      down(hook, 0, 0, t);
      stream(hook, t, {from: 0, to: 60, t0: 0, t1: 20}); // 3000 px/s ...
      up(hook, 60, 400, t); // ... then 380 ms still, then the lift
      expect(onDismiss).not.toHaveBeenCalled();
      expect(hook.result.current.settledOffset).toBe(0);
    });

    it('releases no throw from a finger that came to rest before lifting', () => {
      const {hook, onDismiss} = setup({snapHeights: () => [200]});
      const t = makeTarget();
      down(hook, 0, 0, t);
      stream(hook, t, {from: 0, to: 60, t0: 0, t1: 20});
      restAt(hook, 60, 100, t);
      up(hook, 60, 400, t);
      expect(onDismiss).not.toHaveBeenCalled();
      expect(hook.result.current.settledOffset).toBe(0);
    });

    it('settles a throw that would project past halfway to gone at the shortest detent when canDismiss is false', () => {
      const {hook, onDismiss} = setup({
        canDismiss: false,
        snapHeights: () => [200],
      });
      const t = makeTarget();
      down(hook, 0, 0, t);
      stream(hook, t, {from: 0, to: 150, t0: 0, t1: 100});
      up(hook, 150, 102, t);
      expect(onDismiss).not.toHaveBeenCalled();
      expect(hook.result.current.settledOffset).toBe(200);
    });
  });

  describe("release projection under a mouse (today's rule)", () => {
    // Under a mouse, a release is judged where the
    // sheet would coast to at the finger's speed (0.998 per ms), in the
    // drag's direction, as today.
    it('dismisses on a medium throw released short of the dismiss line', () => {
      const {hook, onDismiss} = setup({snapHeights: () => [200]});
      const t = makeTarget();
      down(hook, 0, 0, t);
      // 150px in 150ms = 1px/ms. The finger stops at 150, well short of the
      // 280px line; a surface moving at that speed coasts far past it.
      move(hook, 50, 50, t);
      move(hook, 100, 100, t);
      move(hook, 150, 150, t);
      up(hook, 150, 152, t);
      expect(onDismiss).toHaveBeenCalledTimes(1);
    });

    it('lands a gentle throw on the next detent, not back where it started', () => {
      const onSnap = vi.fn();
      const {hook, onDismiss} = setup({snapHeights: () => [200], onSnap});
      const t = makeTarget();
      down(hook, 0, 0, t);
      // 60px in 200ms = 0.3px/ms: too slow to be a flick, too short to reach
      // the 200px detent by position. The coast carries it there.
      move(hook, 30, 100, t);
      move(hook, 60, 200, t);
      up(hook, 60, 202, t);
      expect(onDismiss).not.toHaveBeenCalled();
      expect(hook.result.current.settledOffset).toBe(200);
      expect(onSnap).toHaveBeenLastCalledWith(200);
    });

    it('reads the release speed over the last stretch, so one slow sample does not cancel a throw', () => {
      const {hook, onDismiss} = setup({snapHeights: () => [200]});
      const t = makeTarget();
      down(hook, 0, 0, t);
      move(hook, 60, 20, t); // 3px/ms
      move(hook, 62, 90, t); // the lift's own last, slow sample
      up(hook, 62, 92, t);
      expect(onDismiss).toHaveBeenCalledTimes(1);
    });

    it('reads a throw that begins after a hold at its own speed, not the average since touch-down', () => {
      const {hook, onDismiss} = setup({snapHeights: () => [200]});
      const t = makeTarget();
      down(hook, 0, 0, t);
      move(hook, 0, 250, t); // a still hold on the handle
      move(hook, 20, 270, t); // then 60px in 50ms, the last 40 in 30
      move(hook, 40, 285, t);
      move(hook, 60, 300, t);
      up(hook, 60, 302, t);
      expect(onDismiss).toHaveBeenCalledTimes(1);
    });

    it('reads a single move after a hold over the hold, as for every pointer (spec:AST-100 FR4)', () => {
      const {hook, onDismiss} = setup({snapHeights: () => [200]});
      const t = makeTarget();
      down(hook, 0, 0, t);
      move(hook, 60, 300, t); // one sample, 300ms after touch-down
      up(hook, 60, 302, t);
      // The release filter reads no velocity from a single move
      // (spec:AST-100 FR2), under a mouse as under a finger: the sheet settles
      // where it is nearest.
      expect(onDismiss).not.toHaveBeenCalled();
      expect(hook.result.current.settledOffset).toBe(0);
    });

    it('throws nothing from a mouse held still for over 40 ms before the lift (spec:AST-100 FR2)', () => {
      const {hook, onDismiss} = setup({snapHeights: () => [200]});
      const t = makeTarget();
      down(hook, 0, 0, t);
      stream(hook, t, {from: 0, to: 60, t0: 0, t1: 40}); // 1500 px/s ...
      up(hook, 60, 95, t); // ... 55 ms still, then the lift
      // The speed over the last 100 ms used to keep the throw; the release
      // velocity every pointer reads is 0 after a still pointer.
      expect(onDismiss).not.toHaveBeenCalled();
      expect(hook.result.current.settledOffset).toBe(0);
    });

    it('releases no throw from a finger that rested before lifting', () => {
      const {hook, onDismiss} = setup({snapHeights: () => [200]});
      const t = makeTarget();
      down(hook, 0, 0, t);
      move(hook, 60, 20, t); // 3px/ms ...
      up(hook, 60, 400, t); // ... then 380ms of rest, then the lift
      expect(onDismiss).not.toHaveBeenCalled();
      expect(hook.result.current.settledOffset).toBe(0);
    });

    it('settles a throw that would coast past the line at the shortest detent when canDismiss is false', () => {
      const {hook, onDismiss} = setup({
        canDismiss: false,
        snapHeights: () => [200],
      });
      const t = makeTarget();
      down(hook, 0, 0, t);
      move(hook, 50, 50, t);
      move(hook, 100, 100, t);
      up(hook, 100, 102, t);
      expect(onDismiss).not.toHaveBeenCalled();
      expect(hook.result.current.settledOffset).toBe(200);
    });
  });

  it('does not flick-dismiss on a fast but short nudge', () => {
    const {hook, onDismiss} = setup({snapHeights: () => [200]});
    const t = makeTarget();
    // Fast (20px/10ms = 2px/ms) but only 20px of travel — under the distance
    // floor, so nothing is projected and it settles rather than dismissing.
    down(hook, 0, 0, t);
    move(hook, 20, 10, t);
    up(hook, 20, 12, t);
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('projects a fast short nudge onto the next detent under a finger', () => {
    stubIosIdiom();
    const {hook, onDismiss} = setup({snapHeights: () => [200]});
    const t = makeTarget();
    // Fast (2000 px/s) but only 20px of travel: projected 20 + 228 = 248,
    // which lands on the 200 detent; gone (400) is further.
    down(hook, 0, 0, t);
    move(hook, 10, 5, t);
    move(hook, 20, 10, t);
    up(hook, 20, 12, t);
    expect(onDismiss).not.toHaveBeenCalled();
    expect(hook.result.current.settledOffset).toBe(200);
  });

  it('settles to the nearest detent on a slow drag', () => {
    const onSnap = vi.fn();
    const {hook, onDismiss} = setup({snapHeights: () => [200], onSnap});
    const t = makeTarget();
    // Detents: full=400 (offset 0) and 200 (offset 200). Drag slowly to ~180
    // offset -> nearest is the 200px detent (offset 200).
    down(hook, 0, 0, t);
    move(hook, 90, 300, t);
    move(hook, 180, 700, t);
    up(hook, 180, 1100, t);
    expect(onDismiss).not.toHaveBeenCalled();
    expect(onSnap).toHaveBeenLastCalledWith(200);
    expect(hook.result.current.settledOffset).toBe(200);
  });

  it('excludes the offscreen block-end reserve from visible detent heights', () => {
    const onSnap = vi.fn();
    const {hook} = setup({
      snapHeights: () => [200],
      offscreenBlockEndInset: 48,
      onSnap,
    });
    const t = makeTarget();

    // The 400px border box has 352px visible. A 200px visible detent therefore
    // rests at offset 152, not 200; the 48px reserve remains below the viewport.
    down(hook, 0, 0, t);
    move(hook, 150, 700, t);
    up(hook, 150, 1100, t);

    expect(hook.result.current.settledOffset).toBe(152);
    expect(onSnap).toHaveBeenLastCalledWith(200);
  });

  it('keeps the full layout height at the peek detent', () => {
    // Three detents on the 400px sheet: full (0), mid 240 (offset 160), and
    // the 80px peek (offset 320).
    const {hook} = setup({snapHeights: () => [80, 240]});
    const t = makeTarget();

    // Settle at the mid detent: the scrolling area takes that travel as
    // layout height.
    down(hook, 0, 0, t);
    move(hook, 150, 700, t);
    up(hook, 150, 1100, t);
    expect(hook.result.current.settledOffset).toBe(160);
    expect(hook.result.current.settledLayoutOffset).toBe(160);

    // Settle at the peek: a glance state keeps the sheet's full layout height
    // and slides it below the viewport, so no layout travel is reported.
    down(hook, 150, 2000, t);
    move(hook, 310, 2700, t);
    up(hook, 310, 3100, t);
    expect(hook.result.current.settledOffset).toBe(320);
    expect(hook.result.current.settledLayoutOffset).toBe(0);
  });

  it('re-anchors to the same stop when the snap heights change at rest', () => {
    const onDismiss = vi.fn();
    const hook = renderHook(
      (props: UseSheetGesturesOptions) => useSheetGestures(props),
      {
        initialProps: {
          isOpen: true,
          onDismiss,
          snapHeights: () => [200],
        },
      },
    );
    const t = makeTarget();

    // Settle on the one collapsed stop: 400 - 200 = 200px of travel.
    down(hook, 0, 0, t);
    move(hook, 180, 700, t);
    up(hook, 180, 1100, t);
    act(() => hook.result.current.completeScrollAreaSettle());
    expect(hook.result.current.settledOffset).toBe(200);

    // A new resolver is a new set of stops. The sheet is resting on the one it
    // names, so it follows: a 150px stop is 250px of travel. The resolver is
    // read during render, not from a passive effect — the re-anchor runs in a
    // layout effect, which would otherwise still see the previous one.
    hook.rerender({
      isOpen: true,
      onDismiss,
      snapHeights: () => [150],
    });

    expect(hook.result.current.settledOffset).toBe(250);
    expect(hook.result.current.settledLayoutOffset).toBe(250);
  });

  it('resizes the scrolling area at a collapsed stop that is a working height', () => {
    // A 200px stop on the 400px sheet is half of it: the scrolling area takes
    // that travel as layout height rather than sliding the sheet away.
    const {hook} = setup({snapHeights: () => [200]});
    const t = makeTarget();
    down(hook, 0, 0, t);
    move(hook, 180, 700, t);
    up(hook, 180, 1100, t);
    expect(hook.result.current.settledOffset).toBe(200);
    expect(hook.result.current.settledLayoutOffset).toBe(200);
  });

  it('treats the only collapsed stop as a peek when it is a sliver', () => {
    // 60px of a 400px sheet is inside the quarter that makes a peek, so the
    // sheet keeps its full layout height and slides below the viewport.
    const {hook} = setup({snapHeights: () => [60]});
    const t = makeTarget();
    down(hook, 0, 0, t);
    move(hook, 320, 700, t);
    restAt(hook, 320, 800, t);
    up(hook, 320, 1100, t);
    expect(hook.result.current.settledOffset).toBe(340);
    expect(hook.result.current.settledLayoutOffset).toBe(0);
  });

  it('uses the visible shortest detent height for the dismiss overshoot', () => {
    const {hook, onDismiss} = setup({
      snapHeights: () => [200],
      offscreenBlockEndInset: 48,
    });
    const t = makeTarget();

    // Visible full height is 352px, so the 200px stop is offset 152. Its 40%
    // dismiss overshoot ends at 232px; the hidden reserve must not extend it.
    down(hook, 0, 0, t);
    move(hook, 235, 1000, t);
    up(hook, 235, 2000, t);

    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('uses the visible shortest detent height for the halfway line under a finger', () => {
    stubIosIdiom();
    const {hook, onDismiss} = setup({
      snapHeights: () => [200],
      offscreenBlockEndInset: 48,
    });
    const t = makeTarget();

    // Visible full height is 352px, so the 200px stop is offset 152 and the
    // sheet is gone at 352. Released at rest, it dismisses past halfway
    // between them (252px); the hidden reserve must not move that line.
    down(hook, 0, 0, t);
    move(hook, 250, 1000, t);
    restAt(hook, 250, 1100, t);
    up(hook, 250, 2000, t);
    expect(onDismiss).not.toHaveBeenCalled();

    down(hook, 152, 3000, t);
    move(hook, 254, 4000, t);
    restAt(hook, 254, 4100, t);
    up(hook, 254, 5000, t);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('a downward drag from a middle detent never snaps back up past it', () => {
    // Three detents on a 600px sheet: full (offset 0), mid 360 (offset 240),
    // short 160 (offset 440). Rest at the mid detent, then drag DOWN a modest
    // amount that's still closer to mid than to short. It must not snap back
    // UP to full — only to mid (stay) or further down.
    const onSnap = vi.fn();
    const {hook} = setup({snapHeights: () => [160, 360], onSnap});
    const t = makeTarget();
    t.getBoundingClientRect = () => ({height: 600}) as DOMRect;
    // Drag to the mid detent (offset 240).
    down(hook, 0, 0, t);
    move(hook, 120, 300, t);
    move(hook, 240, 700, t);
    up(hook, 240, 1100, t);
    expect(hook.result.current.settledOffset).toBe(240);
    onSnap.mockClear();
    // Small slow drag DOWN from mid: offset 240 -> ~300.
    down(hook, 300, 2000, t);
    move(hook, 340, 2200, t);
    move(hook, 360, 2600, t);
    up(hook, 360, 3000, t);
    // Must not have jumped back up to full (offset 0).
    expect(hook.result.current.settledOffset).not.toBe(0);
    expect(hook.result.current.settledOffset).toBeGreaterThanOrEqual(240);
  });

  it('dismisses when dragged well below the shortest detent', () => {
    const {hook, onDismiss} = setup({snapHeights: () => [200]});
    const t = makeTarget();
    // Shortest detent offset = 200 (height 200). Drag slowly past it by
    // >40% of 200 -> offset ~320 dismisses.
    down(hook, 0, 0, t);
    move(hook, 160, 400, t);
    move(hook, 330, 900, t);
    up(hook, 330, 1400, t);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('rebounds to the shortest detent when canDismiss is false', () => {
    const onScrimOpacity = vi.fn();
    const {hook, onDismiss} = setup({
      canDismiss: false,
      snapHeights: () => [200],
      onScrimOpacity,
    });
    const t = makeTarget();
    down(hook, 0, 0, t);
    move(hook, 160, 400, t);
    move(hook, 330, 900, t);
    up(hook, 330, 1400, t);

    expect(onDismiss).not.toHaveBeenCalled();
    expect(hook.result.current.settledOffset).toBe(200);
    // Rebounding restores the scrim the 200px stop rests under — full, since
    // half a sheet is a working surface rather than a glance.
    expect(onScrimOpacity).toHaveBeenLastCalledWith(1);
  });

  it('fades the scrim from full toward the peek floor as it collapses onto the peek detent', () => {
    const onScrimOpacity = vi.fn();
    // Sheet 400, stops at 300 and a 60px sliver -> offsets [0, 100, 340]. The
    // fade spans the mid detent (offset 100) to the peek (offset 340): full
    // at/above 100, thinned to the peek floor (0.3) at/below 340.
    const {hook} = setup({snapHeights: () => [60, 300], onScrimOpacity});
    const t = makeTarget();
    down(hook, 0, 0, t);
    move(hook, 60, 200, t); // offset 60, above the mid detent -> full
    move(hook, 220, 600, t); // offset 220, halfway -> between 1 and 0.3 (~0.65)
    move(hook, 360, 1000, t); // offset 360, past the peek -> peek floor
    const values = onScrimOpacity.mock.calls.map(c => Number(c[0]));
    expect(values[0]).toBe(1);
    expect(values[1]).toBeGreaterThan(0.55);
    expect(values[1]).toBeLessThan(0.75);
    expect(values[values.length - 1]).toBeCloseTo(0.3);
  });

  it('thins the scrim to the peek floor when settled at the peek detent (still modal)', () => {
    const onScrimOpacity = vi.fn();
    const {hook} = setup({snapHeights: () => [60, 300], onScrimOpacity});
    const t = makeTarget();
    // Slow drag down to the peek detent (offset 340).
    down(hook, 0, 0, t);
    move(hook, 170, 400, t);
    move(hook, 340, 900, t);
    restAt(hook, 340, 1000, t);
    up(hook, 340, 1400, t);
    expect(hook.result.current.settledOffset).toBe(340);
    // Last reported opacity (on settle) is the peek floor, not fully hidden —
    // the sheet is still modal, so the backdrop keeps a minimum dim.
    const values = onScrimOpacity.mock.calls.map(c => Number(c[0]));
    expect(values[values.length - 1]).toBeCloseTo(0.3);
  });

  it('magnetically settles the live drag onto a nearby detent', () => {
    // Detents for a 400px sheet with snaps 300 and 200 -> visible-height snaps
    // become offsets [0, 100, 200]. Approaching the middle detent (offset 100)
    // from just below (raw ~90) — inside MAGNET_RANGE and BELOW the shortest
    // detent so the between-detents magnet applies — should ease toward 100.
    const {hook} = setup({snapHeights: () => [200, 300]});
    const t = makeTarget();
    down(hook, 0, 0, t);
    move(hook, 90, 100, t); // raw offset 90, 10px from the 100 detent
    const off = liveOffset(hook);
    expect(off).toBeGreaterThan(90); // pulled up toward 100
    expect(off).toBeLessThanOrEqual(100);
  });

  it('translates the surface live during a drag', () => {
    const {hook} = setup({snapHeights: () => [200]});
    const t = makeTarget();
    down(hook, 0, 0, t);
    move(hook, 50, 100, t);
    expect(liveOffset(hook)).toBe(50);
    expect(hook.result.current.isDragging).toBe(true);
    // Written to the element's travel channel, not rendered: the move costs
    // one style write and no commit.
    expect(travel(t)).toBe(50);
  });

  it('renders nothing for a move that keeps the layout split', () => {
    let renders = 0;
    const onDismiss = vi.fn();
    const hook = renderHook(
      (props: UseSheetGesturesOptions) => {
        renders += 1;
        return useSheetGestures(props);
      },
      {initialProps: {isOpen: true, onDismiss, snapHeights: () => [200]}},
    );
    const t = makeTarget();
    down(hook, 0, 0, t);
    const rendersAtDown = renders;
    move(hook, 30, 50, t);
    move(hook, 60, 100, t);
    move(hook, 90, 150, t);
    expect(travel(t)).toBe(90);
    // One render announces that the sheet is traveling; the moves after it
    // render nothing.
    expect(renders - rendersAtDown).toBeLessThanOrEqual(1);
  });

  it('keeps the sheet under the finger until the host renders the height a drag above its base restores', async () => {
    const {hook} = setup({snapHeights: () => [200]});
    const t = makeTarget();
    // Rest at the 200px working detent: the sheet gives 200px up as layout,
    // and the host's transform holds the rest of the detent (0 here).
    down(hook, 0, 0, t);
    move(hook, 200, 400, t);
    up(hook, 200, 800, t);
    expect(hook.result.current.settledLayoutOffset).toBe(200);
    // A move 50px above the base, handled before React renders the restored
    // height: the travel is written against the height still on screen
    // (200px less layout), so the sheet is drawn where the finger is ...
    down(hook, 200, 1000, t);
    hook.result.current.handleProps.onPointerMove(pointerEvent(150, 1100, t));
    expect(liveOffset(hook)).toBe(150);
    expect(travel(t)).toBe(150 - 200);
    // ... and the commit that restores the full height moves the travel
    // with it, before anything paints.
    await act(async () => {});
    expect(travel(t)).toBe(150);
  });

  it('restores the full layout height when a drag crosses above its base', () => {
    const onSnap = vi.fn();
    const {hook} = setup({snapHeights: () => [200], onSnap});
    const t = makeTarget();
    // Rest at the 200px working detent: the sheet gives 200px up as layout.
    down(hook, 0, 0, t);
    move(hook, 200, 400, t);
    up(hook, 200, 800, t);
    expect(hook.result.current.settledLayoutOffset).toBe(200);
    // Drag back up above the base: the layout split changes, and that one
    // render carries the offset the host pairs with the new height.
    down(hook, 200, 1000, t);
    move(hook, 150, 1100, t);
    expect(liveOffset(hook)).toBe(150);
    // The full height is back (layout 0), so the travel carries all 150px.
    expect(travel(t)).toBe(150);
  });

  it('returns to the settled detent when a context menu interrupts a drag', () => {
    const onScrimOpacity = vi.fn();
    const {hook, onDismiss} = setup({
      snapHeights: () => [200, 300],
      onScrimOpacity,
    });
    const target = makeTarget();
    down(hook, 0, 0, target);
    move(hook, 300, 1000, target);

    const preventDefault = vi.fn();
    act(() =>
      hook.result.current.handleProps.onContextMenu({
        currentTarget: target,
        preventDefault,
      } as unknown as React.MouseEvent),
    );

    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(hook.result.current.isDragging).toBe(false);
    expect(hook.result.current.contentProps.style.transform).toBeUndefined();
    expect(onScrimOpacity).toHaveBeenLastCalledWith(1);
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('returns to the settled detent when pointer capture is lost', () => {
    const {hook, onDismiss} = setup({snapHeights: () => [200]});
    const target = makeTarget();
    down(hook, 0, 0, target);
    move(hook, 300, 1000, target);

    act(() =>
      hook.result.current.handleProps.onLostPointerCapture(
        pointerEvent(300, 1000, target),
      ),
    );

    expect(hook.result.current.isDragging).toBe(false);
    expect(hook.result.current.contentProps.style.transform).toBeUndefined();
    expect(onDismiss).not.toHaveBeenCalled();
  });

  describe('pinch', () => {
    // A second finger is a pinch, and pinch-zoom belongs to the browser.
    it('declares pinch-zoom on the sliding surface and the handle', () => {
      const {hook} = setup();
      expect(hook.result.current.contentProps.style.touchAction).toBe(
        'pinch-zoom',
      );
      expect(hook.result.current.handleProps.style.touchAction).toBe(
        'pinch-zoom',
      );
    });

    it('returns to the settled detent when a second finger lands on the handle', () => {
      const {hook, onDismiss} = setup({snapHeights: () => [200]});
      const target = makeTarget();
      down(hook, 0, 0, target);
      move(hook, 120, 200, target);
      expect(hook.result.current.isDragging).toBe(true);

      act(() =>
        hook.result.current.handleProps.onPointerDown(
          pointerEvent(160, 220, target, 2, 0, false),
        ),
      );

      expect(hook.result.current.isDragging).toBe(false);
      expect(hook.result.current.contentProps.style.transform).toBeUndefined();
      // The first finger's later release is not a drag either.
      up(hook, 300, 400, target);
      expect(onDismiss).not.toHaveBeenCalled();
    });

    it('returns to the detent when the browser cancels a handle drag to take a pinch', () => {
      const onSnap = vi.fn();
      const {hook, onDismiss} = setup({snapHeights: () => [200], onSnap});
      const target = makeTarget();
      down(hook, 0, 0, target);
      // Fast enough that settling from here would throw the sheet away.
      move(hook, 60, 20, target);
      act(() =>
        hook.result.current.handleProps.onPointerCancel(
          pointerEvent(60, 22, target),
        ),
      );
      expect(hook.result.current.isDragging).toBe(false);
      expect(hook.result.current.contentProps.style.transform).toBeUndefined();
      expect(onDismiss).not.toHaveBeenCalled();
      expect(onSnap).not.toHaveBeenCalled();
    });

    it('returns a handle drag to its detent when a second finger lands off the sheet', () => {
      const {hook, onDismiss} = setup({snapHeights: () => [200]});
      const target = makeTarget();
      down(hook, 0, 0, target);
      move(hook, 40, 100, target);
      expect(hook.result.current.isDragging).toBe(true);
      act(() =>
        hook.result.current.handleProps.onTouchMove({
          currentTarget: target,
          touches: [
            {identifier: 1, clientY: 40},
            {identifier: 2, clientY: -60},
          ],
        } as unknown as React.TouchEvent),
      );
      expect(hook.result.current.isDragging).toBe(false);
      expect(hook.result.current.contentProps.style.transform).toBeUndefined();
      expect(onDismiss).not.toHaveBeenCalled();
    });

    it('drops an armed body pull when a second pointer lands on the body', () => {
      const {hook} = setup({snapHeights: () => [200]});
      const body = makeTarget();
      act(() => hook.result.current.sheetRef(body));
      act(() =>
        hook.result.current.bodyProps.onPointerDown(pointerEvent(0, 0, body)),
      );
      act(() =>
        hook.result.current.bodyProps.onPointerDown(
          pointerEvent(80, 10, body, 2, 0, false),
        ),
      );
      act(() =>
        hook.result.current.bodyProps.onPointerMove(
          pointerEvent(60, 100, body),
        ),
      );
      expect(hook.result.current.isDragging).toBe(false);
    });
  });

  it('does not start a drag from a secondary pointer button', () => {
    const {hook} = setup();
    const target = makeTarget();
    act(() => hook.result.current.sheetRef(target));

    act(() =>
      hook.result.current.handleProps.onPointerDown(
        pointerEvent(0, 0, target, 1, 2),
      ),
    );

    expect(hook.result.current.isDragging).toBe(false);
  });

  it('rubber-bands an upward drag past the fully-open position', () => {
    const {hook} = setup({snapHeights: () => [200]});
    const t = makeTarget();
    down(hook, 100, 0, t);
    move(hook, 20, 100, t); // drag up 80px past the top of a rested-at-top sheet
    // Overscroll is allowed but damped: a resisted fraction of the raw -80,
    // and negative (above the top), not the raw distance and not clamped to 0.
    const off = liveOffset(hook);
    expect(off).toBeLessThan(0);
    expect(off).toBeGreaterThan(-80); // resisted, so smaller in magnitude
  });

  it('dismisses a single-height sheet on a slow drag past the floor', () => {
    const {hook, onDismiss} = setup(); // no snapHeights
    const t = makeTarget();
    // Only detent is the full 400px height (offset 0). A slow drag past 40%
    // of it (>160px) with no detent to catch it dismisses.
    down(hook, 0, 0, t);
    move(hook, 120, 400, t);
    move(hook, 240, 900, t);
    up(hook, 240, 1400, t);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  describe('body overscroll', () => {
    // A scrollable body element nested inside the sheet, with a settable
    // scrollTop so we can simulate "at the top" vs "scrolled".
    function makeBody(scrollTop: number) {
      const body = document.createElement('div');
      Object.defineProperty(body, 'scrollTop', {
        value: scrollTop,
        writable: true,
      });
      body.setPointerCapture = vi.fn();
      body.releasePointerCapture = vi.fn();
      body.getBoundingClientRect = () => ({height: SHEET_HEIGHT}) as DOMRect;
      return body;
    }
    function bodyDown(hook: Hook, y: number, t: number, el: HTMLElement) {
      // Register a sheet element so the hook can measure height (it reads the
      // tracked node, not the DOM). The body stands in with the right height.
      act(() => hook.result.current.sheetRef(el));
      act(() =>
        hook.result.current.bodyProps.onPointerDown(pointerEvent(y, t, el)),
      );
    }
    function bodyMove(hook: Hook, y: number, t: number, el: HTMLElement) {
      act(() =>
        hook.result.current.bodyProps.onPointerMove(pointerEvent(y, t, el)),
      );
    }

    it('promotes a top-overscroll pull-down into a sheet drag', () => {
      const {hook} = setup({snapHeights: () => [200]});
      const body = makeBody(0); // at the top
      bodyDown(hook, 0, 0, body);
      bodyMove(hook, 40, 100, body); // pull down while at the top
      expect(hook.result.current.isDragging).toBe(true);
      expect(liveOffset(hook)).toBe(40);
    });

    /**
     * A finger is never still. Tapping a control inside the sheet drifts a
     * pixel or two, and with no slop that drift promoted to a sheet drag —
     * which wrote `transition: none` onto the panel across the release, so the
     * close the tap triggered cut instead of animating. That is the "the sheet
     * closes with no animation" report: only on a tap, and only on a tap
     * inside the sheet (the scrim never arms a drag).
     */
    it('treats a few pixels of finger drift as a tap, not a drag', () => {
      const {hook} = setup({snapHeights: () => [200]});
      const body = makeBody(0); // at the top, where a pull-down would promote
      bodyDown(hook, 0, 0, body);
      bodyMove(hook, 3, 40, body); // the drift of a finger tapping a button
      expect(hook.result.current.isDragging).toBe(false);
      // and nothing suppressed the panel's transition, so a close that lands
      // now still animates
      expect(hook.result.current.contentProps.style.transition).toBeUndefined();
    });

    it('still promotes once the pull passes the tap slop', () => {
      const {hook} = setup({snapHeights: () => [200]});
      const body = makeBody(0);
      bodyDown(hook, 0, 0, body);
      bodyMove(hook, 9, 40, body); // just past the 8px slop
      expect(hook.result.current.isDragging).toBe(true);
    });

    it('does not hijack scrolling when the body is scrolled down', () => {
      const {hook} = setup({snapHeights: () => [200]});
      const body = makeBody(120); // scrolled, not at the top
      bodyDown(hook, 0, 0, body);
      bodyMove(hook, 40, 100, body);
      expect(hook.result.current.isDragging).toBe(false);
    });

    it('does not start a drag on an upward move from the top', () => {
      const {hook} = setup({snapHeights: () => [200]});
      const body = makeBody(0);
      bodyDown(hook, 100, 0, body);
      bodyMove(hook, 60, 100, body); // moving up = scrolling intent
      expect(hook.result.current.isDragging).toBe(false);
    });
  });

  describe('body touch handoff', () => {
    // Touch listeners exist only where the primary pointer is coarse.
    beforeEach(() => stubCoarsePointer());

    // Attach a real DOM node via the body ref, then dispatch touch events. The
    // hook's non-passive touchmove listener is how the handoff works on touch
    // devices (pointer events get cancelled once native panning starts).
    function makeScroller(opts: {
      scrollTop: number;
      clientHeight: number;
      scrollHeight: number;
    }) {
      const sheet = makeTarget();
      const el = document.createElement('div');
      Object.defineProperty(el, 'scrollTop', {
        value: opts.scrollTop,
        writable: true,
      });
      Object.defineProperty(el, 'clientHeight', {value: opts.clientHeight});
      Object.defineProperty(el, 'scrollHeight', {value: opts.scrollHeight});
      el.getBoundingClientRect = () => ({height: SHEET_HEIGHT}) as DOMRect;
      sheet.appendChild(el);
      document.body.appendChild(sheet);
      return el;
    }
    function touch(el: HTMLElement, type: string, y: number, id = 1) {
      const ev = new Event(type, {bubbles: true, cancelable: true});
      // jsdom lacks TouchEvent; attach the fields the handler reads.
      Object.defineProperty(ev, 'changedTouches', {
        value: [{identifier: id, clientY: y}],
      });
      Object.defineProperty(ev, 'touches', {
        value:
          type === 'touchend' || type === 'touchcancel'
            ? []
            : [{identifier: id, clientY: y}],
      });
      Object.defineProperty(ev, 'currentTarget', {value: el});
      el.dispatchEvent(ev);
      return ev;
    }

    it('promotes a top pull-down (touch) into a sheet drag', () => {
      const {hook} = setup({snapHeights: () => [200]});
      const el = makeScroller({
        scrollTop: 0,
        clientHeight: 200,
        scrollHeight: 800,
      });
      act(() => hook.result.current.sheetRef(el));
      act(() => hook.result.current.bodyProps.ref(el));
      act(() => {
        touch(el, 'touchstart', 0);
        touch(el, 'touchmove', 50);
      });
      expect(hook.result.current.isDragging).toBe(true);
    });

    it('promotes a top pull-down from a finger where the primary pointer is fine (a touchscreen laptop), as on a phone', () => {
      // A touchscreen laptop: a mouse is the primary pointer, and a finger on
      // the screen sends touches, which the browser would scroll the content
      // with. The body's touch listeners serve that finger as they serve a
      // phone's: under a fine pointer a component may listen on its own
      // element (spec:AST-094 FR24).
      vi.stubGlobal(
        'matchMedia',
        vi.fn((query: string) => ({
          matches: query.includes('any-pointer: coarse'),
          media: query,
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
        })),
      );
      const {hook} = setup({snapHeights: () => [200]});
      const el = makeScroller({
        scrollTop: 0,
        clientHeight: 200,
        scrollHeight: 800,
      });
      act(() => hook.result.current.sheetRef(el));
      act(() => hook.result.current.bodyProps.ref(el));
      let move: Event | undefined;
      act(() => {
        touch(el, 'touchstart', 0);
        move = touch(el, 'touchmove', 50);
      });
      expect(hook.result.current.isDragging).toBe(true);
      // The pull is the sheet's, not the content's scroll.
      expect(move?.defaultPrevented).toBe(true);
    });

    it('promotes a bottom pull-up (touch) into a sheet drag that travels', () => {
      const {hook} = setup({snapHeights: () => [200]});
      // scrolled to the bottom: scrollTop + clientHeight === scrollHeight
      const el = makeScroller({
        scrollTop: 600,
        clientHeight: 200,
        scrollHeight: 800,
      });
      act(() => hook.result.current.sheetRef(el));
      act(() => hook.result.current.bodyProps.ref(el));
      // Settle at the lower detent first, so expanding has somewhere to go.
      down(hook, 0, 0, el);
      move(hook, 180, 700, el);
      up(hook, 180, 1100, el);
      expect(hook.result.current.settledOffset).toBe(200);

      act(() => {
        touch(el, 'touchstart', 300);
        touch(el, 'touchmove', 250); // pull up
      });
      expect(hook.result.current.isDragging).toBe(true);
      // The handoff is only worth taking if the sheet follows the finger:
      // 50px of pull expands 50px toward the tallest detent.
      expect(liveOffset(hook)).toBe(150);
    });

    it('leaves a bottom pull-up with the scroller at the tallest detent', () => {
      // Regression: the sheet is already fully expanded, so an upward pull has
      // nowhere to expand to. Promoting it produced a rubber-band the release
      // threw straight back, and stole the gesture from the scroller.
      const {hook} = setup({snapHeights: () => [200]});
      const el = makeScroller({
        scrollTop: 600,
        clientHeight: 200,
        scrollHeight: 800,
      });
      act(() => hook.result.current.sheetRef(el));
      act(() => hook.result.current.bodyProps.ref(el));
      expect(hook.result.current.settledOffset).toBe(0);

      act(() => {
        touch(el, 'touchstart', 300);
        touch(el, 'touchmove', 250); // pull up
      });
      expect(hook.result.current.isDragging).toBe(false);
      expect(hook.result.current.dragOffset).toBe(0);
    });

    it('does not preventDefault a bottom pull-up at the tallest detent', () => {
      // The captured gesture was the worse half of the bug: once promoted,
      // every later touchmove was preventDefault()ed, so reversing downward to
      // scroll back collapsed the sheet instead of scrolling.
      const {hook} = setup({snapHeights: () => [200]});
      const el = makeScroller({
        scrollTop: 600,
        clientHeight: 200,
        scrollHeight: 800,
      });
      act(() => hook.result.current.sheetRef(el));
      act(() => hook.result.current.bodyProps.ref(el));

      let pullUp: Event | undefined;
      let reverseDown: Event | undefined;
      act(() => {
        touch(el, 'touchstart', 300);
        pullUp = touch(el, 'touchmove', 250);
        reverseDown = touch(el, 'touchmove', 400);
      });
      expect(pullUp?.defaultPrevented).toBe(false);
      expect(reverseDown?.defaultPrevented).toBe(false);
      expect(hook.result.current.isDragging).toBe(false);
    });

    it('finishes the active drag when another ended touch is listed first', () => {
      const {hook} = setup({snapHeights: () => [200]});
      const el = makeScroller({
        scrollTop: 0,
        clientHeight: 200,
        scrollHeight: 800,
      });
      act(() => hook.result.current.sheetRef(el));
      act(() => hook.result.current.bodyProps.ref(el));
      act(() => {
        touch(el, 'touchstart', 0, 2);
        touch(el, 'touchmove', 300, 2);

        const end = new Event('touchend', {
          bubbles: true,
          cancelable: true,
        });
        Object.defineProperty(end, 'changedTouches', {
          value: [
            {identifier: 1, clientY: 100},
            {identifier: 2, clientY: 300},
          ],
        });
        Object.defineProperty(end, 'touches', {value: []});
        el.dispatchEvent(end);
      });

      expect(hook.result.current.isDragging).toBe(false);
    });

    function secondFinger(el: HTMLElement, y: number, firstY: number) {
      const ev = new Event('touchstart', {bubbles: true, cancelable: true});
      Object.defineProperty(ev, 'changedTouches', {
        value: [{identifier: 2, clientY: y}],
      });
      Object.defineProperty(ev, 'touches', {
        value: [
          {identifier: 1, clientY: firstY},
          {identifier: 2, clientY: y},
        ],
      });
      Object.defineProperty(ev, 'currentTarget', {value: el});
      el.dispatchEvent(ev);
    }

    it('leaves a pinch at the top to the browser', () => {
      const {hook} = setup({snapHeights: () => [200]});
      const el = makeScroller({
        scrollTop: 0,
        clientHeight: 200,
        scrollHeight: 800,
      });
      act(() => hook.result.current.sheetRef(el));
      act(() => hook.result.current.bodyProps.ref(el));
      let pull: Event | undefined;
      act(() => {
        touch(el, 'touchstart', 100);
        secondFinger(el, 140, 100);
        // The spread carries the second finger down past the promotion slop.
        pull = touch(el, 'touchmove', 160, 2);
      });
      expect(pull?.defaultPrevented).toBe(false);
      expect(hook.result.current.isDragging).toBe(false);
    });

    it('returns a pull in flight to its detent when a second finger lands', () => {
      const {hook, onDismiss} = setup({snapHeights: () => [200]});
      const el = makeScroller({
        scrollTop: 0,
        clientHeight: 200,
        scrollHeight: 800,
      });
      act(() => hook.result.current.sheetRef(el));
      act(() => hook.result.current.bodyProps.ref(el));
      act(() => {
        touch(el, 'touchstart', 0);
        touch(el, 'touchmove', 50);
      });
      expect(hook.result.current.isDragging).toBe(true);

      let after: Event | undefined;
      act(() => {
        secondFinger(el, 120, 50);
        after = touch(el, 'touchmove', 90);
        touch(el, 'touchend', 90);
      });
      expect(after?.defaultPrevented).toBe(false);
      expect(hook.result.current.isDragging).toBe(false);
      expect(hook.result.current.contentProps.style.transform).toBeUndefined();
      expect(onDismiss).not.toHaveBeenCalled();
    });

    it('leaves a pinch to the browser when the body finger lands first and the second lands on the handle', () => {
      const {hook} = setup({snapHeights: () => [200]});
      const el = makeScroller({
        scrollTop: 0,
        clientHeight: 200,
        scrollHeight: 800,
      });
      const handle = makeTarget();
      act(() => hook.result.current.sheetRef(el));
      act(() => hook.result.current.bodyProps.ref(el));
      let pull: Event | undefined;
      act(() => {
        touch(el, 'touchstart', 100);
        hook.result.current.handleProps.onPointerDown(
          pointerEvent(20, 10, handle, 2, 0, false),
        );
        // The spread carries the body finger down past the promotion slop.
        pull = touch(el, 'touchmove', 160);
      });
      expect(pull?.defaultPrevented).toBe(false);
      expect(hook.result.current.isDragging).toBe(false);
    });

    it('leaves a pinch to the browser when the second finger lands off the body', () => {
      const {hook} = setup({snapHeights: () => [200]});
      const el = makeScroller({
        scrollTop: 0,
        clientHeight: 200,
        scrollHeight: 800,
      });
      act(() => hook.result.current.sheetRef(el));
      act(() => hook.result.current.bodyProps.ref(el));
      let pull: Event | undefined;
      act(() => {
        touch(el, 'touchstart', 100);
        // No listener here saw the second finger arrive; `touches` lists it.
        const ev = new Event('touchmove', {bubbles: true, cancelable: true});
        Object.defineProperty(ev, 'changedTouches', {
          value: [{identifier: 1, clientY: 160}],
        });
        Object.defineProperty(ev, 'touches', {
          value: [
            {identifier: 1, clientY: 160},
            {identifier: 2, clientY: 20},
          ],
        });
        Object.defineProperty(ev, 'currentTarget', {value: el});
        el.dispatchEvent(ev);
        pull = ev;
      });
      expect(pull?.defaultPrevented).toBe(false);
      expect(hook.result.current.isDragging).toBe(false);
    });

    it('leaves native scrolling alone in the middle of the content', () => {
      const {hook} = setup({snapHeights: () => [200]});
      const el = makeScroller({
        scrollTop: 300,
        clientHeight: 200,
        scrollHeight: 800,
      });
      act(() => hook.result.current.sheetRef(el));
      act(() => hook.result.current.bodyProps.ref(el));
      act(() => {
        touch(el, 'touchstart', 300);
        touch(el, 'touchmove', 250);
      });
      expect(hook.result.current.isDragging).toBe(false);
    });
  });

  describe('body touch handoff from a nested scroller', () => {
    // Touch listeners exist only where the primary pointer is coarse.
    beforeEach(() => stubCoarsePointer());

    // A host that scrolls content in a box of its own inside the body (a
    // pinned header and footer around a scrolling middle, a grid) never moves
    // the body's scrollTop. The edge that decides the handoff is the edge of
    // the box under the finger, not the body's.
    function makeNested(opts: {
      bodyScrollTop: number;
      bodyScrollHeight?: number;
      innerScrollTop: number;
      innerScrollHeight?: number;
    }) {
      const sheet = makeTarget();
      const body = document.createElement('div');
      Object.defineProperty(body, 'scrollTop', {
        value: opts.bodyScrollTop,
        writable: true,
      });
      Object.defineProperty(body, 'clientHeight', {value: 400});
      Object.defineProperty(body, 'scrollHeight', {
        value: opts.bodyScrollHeight ?? 400,
      });
      body.getBoundingClientRect = () => ({height: SHEET_HEIGHT}) as DOMRect;
      const inner = document.createElement('div');
      inner.style.overflowY = 'auto';
      Object.defineProperty(inner, 'scrollTop', {
        value: opts.innerScrollTop,
        writable: true,
      });
      Object.defineProperty(inner, 'clientHeight', {value: 200});
      Object.defineProperty(inner, 'scrollHeight', {
        value: opts.innerScrollHeight ?? 800,
      });
      const tile = document.createElement('button');
      inner.appendChild(tile);
      body.appendChild(inner);
      sheet.appendChild(body);
      document.body.appendChild(sheet);
      return {body, inner, tile};
    }
    function touchOn(
      target: HTMLElement,
      listener: HTMLElement,
      type: string,
      y: number,
      id = 1,
    ) {
      const ev = new Event(type, {bubbles: true, cancelable: true});
      Object.defineProperty(ev, 'changedTouches', {
        value: [{identifier: id, clientY: y}],
      });
      Object.defineProperty(ev, 'touches', {
        value:
          type === 'touchend' || type === 'touchcancel'
            ? []
            : [{identifier: id, clientY: y}],
      });
      Object.defineProperty(ev, 'currentTarget', {value: listener});
      target.dispatchEvent(ev);
      return ev;
    }

    it('leaves a pull-down to a nested scroller that is scrolled', () => {
      const {hook} = setup({snapHeights: () => [200]});
      const {body, tile} = makeNested({bodyScrollTop: 0, innerScrollTop: 120});
      act(() => hook.result.current.sheetRef(body));
      act(() => hook.result.current.bodyProps.ref(body));
      let pull: Event | undefined;
      act(() => {
        touchOn(tile, body, 'touchstart', 100);
        pull = touchOn(tile, body, 'touchmove', 160);
      });
      expect(pull?.defaultPrevented).toBe(false);
      expect(hook.result.current.isDragging).toBe(false);
    });

    it('promotes a pull-down from the top of a nested scroller', () => {
      const {hook} = setup({snapHeights: () => [200]});
      const {body, tile} = makeNested({bodyScrollTop: 0, innerScrollTop: 0});
      act(() => hook.result.current.sheetRef(body));
      act(() => hook.result.current.bodyProps.ref(body));
      let pull: Event | undefined;
      act(() => {
        touchOn(tile, body, 'touchstart', 100);
        pull = touchOn(tile, body, 'touchmove', 160);
      });
      expect(pull?.defaultPrevented).toBe(true);
      expect(hook.result.current.isDragging).toBe(true);
      expect(liveOffset(hook)).toBe(60);
      expect(travel(body)).toBe(60);
    });

    it('chains to a scrolled body before the sheet when the nested box is at its top', () => {
      const {hook} = setup({snapHeights: () => [200]});
      const {body, tile} = makeNested({
        bodyScrollTop: 80,
        bodyScrollHeight: 900,
        innerScrollTop: 0,
      });
      act(() => hook.result.current.sheetRef(body));
      act(() => hook.result.current.bodyProps.ref(body));
      let pull: Event | undefined;
      act(() => {
        touchOn(tile, body, 'touchstart', 100);
        pull = touchOn(tile, body, 'touchmove', 160);
      });
      // The browser scrolls the body back up; the sheet's turn has not come.
      expect(pull?.defaultPrevented).toBe(false);
      expect(hook.result.current.isDragging).toBe(false);
    });

    it('reads the body when the nested box has nothing to scroll', () => {
      const {hook} = setup({snapHeights: () => [200]});
      const {body, tile} = makeNested({
        bodyScrollTop: 0,
        innerScrollTop: 0,
        innerScrollHeight: 200,
      });
      act(() => hook.result.current.sheetRef(body));
      act(() => hook.result.current.bodyProps.ref(body));
      act(() => {
        touchOn(tile, body, 'touchstart', 100);
        touchOn(tile, body, 'touchmove', 160);
      });
      expect(hook.result.current.isDragging).toBe(true);
    });

    it('leaves a touch that starts inside a nested <dialog> to that layer', () => {
      // A sheet opened from this sheet's content renders its <dialog> inside
      // the body, so its touches bubble here. The same pull-down from the
      // body's own content promotes (see above); from the nested layer it
      // must not.
      const {hook} = setup({snapHeights: () => [200]});
      const {body} = makeNested({
        bodyScrollTop: 0,
        innerScrollTop: 0,
        innerScrollHeight: 200,
      });
      const nested = document.createElement('dialog');
      const nestedHandle = document.createElement('div');
      nested.appendChild(nestedHandle);
      body.appendChild(nested);
      act(() => hook.result.current.sheetRef(body));
      act(() => hook.result.current.bodyProps.ref(body));
      let start: Event | undefined;
      let pull: Event | undefined;
      act(() => {
        start = touchOn(nestedHandle, body, 'touchstart', 100);
        pull = touchOn(nestedHandle, body, 'touchmove', 160);
      });
      expect(start?.defaultPrevented).toBe(false);
      expect(pull?.defaultPrevented).toBe(false);
      expect(hook.result.current.isDragging).toBe(false);
      expect(liveOffset(hook)).toBe(0);
      expect(body.style.transform).toBe('');
    });

    it('leaves a pull-up to a nested scroller with content below', () => {
      const {hook} = setup({snapHeights: () => [200]});
      const {body, tile} = makeNested({bodyScrollTop: 0, innerScrollTop: 100});
      act(() => hook.result.current.sheetRef(body));
      act(() => hook.result.current.bodyProps.ref(body));
      // Rest at the lower detent, so an expanding handoff would have somewhere
      // to go if the body's edge were read.
      down(hook, 0, 0, body);
      move(hook, 180, 700, body);
      up(hook, 180, 1100, body);
      expect(hook.result.current.settledOffset).toBe(200);
      let pull: Event | undefined;
      act(() => {
        touchOn(tile, body, 'touchstart', 300);
        pull = touchOn(tile, body, 'touchmove', 250);
      });
      expect(pull?.defaultPrevented).toBe(false);
      expect(hook.result.current.isDragging).toBe(false);
    });

    it('arms the pointer path on the nested scroller too', () => {
      const {hook} = setup({snapHeights: () => [200]});
      const {body, tile} = makeNested({bodyScrollTop: 0, innerScrollTop: 120});
      act(() => hook.result.current.sheetRef(body));
      const over = (y: number, t: number) => {
        const ev = pointerEvent(y, t, body);
        Object.defineProperty(ev, 'target', {value: tile});
        return ev;
      };
      act(() => hook.result.current.bodyProps.onPointerDown(over(0, 0)));
      act(() => hook.result.current.bodyProps.onPointerMove(over(40, 100)));
      expect(hook.result.current.isDragging).toBe(false);
    });
  });

  describe('body touch handoff mid-gesture', () => {
    // Touch listeners exist only where the primary pointer is coarse.
    beforeEach(() => stubCoarsePointer());

    // The reported bug: the finger lands mid-content, swipes up, REACHES the
    // end of the content, and keeps pulling in the same continuous gesture.
    // Arming decided at touchstart can never see that, and by the time the
    // scroller is at its end the browser owns the gesture — every remaining
    // touchmove is non-cancelable, so preventDefault() is not available to
    // promote with. These cases pin the anchored, cancel-free handoff instead.
    function makeScroller(opts: {
      scrollTop: number;
      clientHeight: number;
      scrollHeight: number;
    }) {
      const sheet = makeTarget();
      const el = document.createElement('div');
      Object.defineProperty(el, 'scrollTop', {
        value: opts.scrollTop,
        writable: true,
      });
      Object.defineProperty(el, 'clientHeight', {value: opts.clientHeight});
      Object.defineProperty(el, 'scrollHeight', {value: opts.scrollHeight});
      el.getBoundingClientRect = () => ({height: SHEET_HEIGHT}) as DOMRect;
      sheet.appendChild(el);
      document.body.appendChild(sheet);
      return el;
    }
    function touch(el: HTMLElement, type: string, y: number, id = 1) {
      const ev = new Event(type, {bubbles: true, cancelable: true});
      Object.defineProperty(ev, 'changedTouches', {
        value: [{identifier: id, clientY: y}],
      });
      Object.defineProperty(ev, 'touches', {
        value:
          type === 'touchend' || type === 'touchcancel'
            ? []
            : [{identifier: id, clientY: y}],
      });
      Object.defineProperty(ev, 'currentTarget', {value: el});
      el.dispatchEvent(ev);
      return ev;
    }
    // A scroller with 600px of scrollable content, resting one detent down so
    // an upward pull has somewhere to expand to.
    function midDetentScroller(hook: Hook, scrollTop: number) {
      const el = makeScroller({
        scrollTop,
        clientHeight: 200,
        scrollHeight: 800,
      });
      act(() => hook.result.current.sheetRef(el));
      act(() => hook.result.current.bodyProps.ref(el));
      down(hook, 0, 0, el);
      move(hook, 180, 700, el);
      up(hook, 180, 1100, el);
      expect(hook.result.current.settledOffset).toBe(200);
      return el;
    }

    // iOS Safari raises PointerEvents for a finger under the SAME numeric id
    // it puts in `Touch.identifier`, so a drag the touch path starts is keyed
    // to a live pointer. WebKit takes that pointer's capture straight back,
    // and the `lostpointercapture` that follows used to cancel the drag one
    // event after it began — leaving the sheet inert for the rest of the pull
    // while the handle still worked. Every browser that keeps the two id
    // spaces apart hides this, which is why it only showed up on device.
    it('survives a lostpointercapture for the finger driving it', () => {
      const {hook} = setup({snapHeights: () => [200]});
      const el = midDetentScroller(hook, 600); // parked at the content end
      act(() => {
        touch(el, 'touchstart', 500, 7);
        touch(el, 'touchmove', 450, 7); // promotes at the armed bottom edge
      });
      expect(hook.result.current.isDragging).toBe(true);
      act(() => {
        hook.result.current.bodyProps.onLostPointerCapture(
          pointerEvent(450, 0, el, 7), // same id as the touch: iOS does this
        );
      });
      expect(hook.result.current.isDragging).toBe(true);
      act(() => {
        touch(el, 'touchmove', 400, 7);
      });
      // 100px of pull past the touchstart, from the 200px detent.
      expect(liveOffset(hook)).toBe(100);
    });

    // `pointercancel` for that same finger arrives the moment WebKit claims
    // the gesture. Ending the drag on it settles the sheet mid-pull.
    it('does not end the touch drag on a pointercancel for that finger', () => {
      const {hook} = setup({snapHeights: () => [200]});
      const el = midDetentScroller(hook, 600);
      act(() => {
        touch(el, 'touchstart', 500, 7);
        touch(el, 'touchmove', 450, 7);
      });
      act(() => {
        hook.result.current.bodyProps.onPointerCancel(
          pointerEvent(450, 0, el, 7),
        );
      });
      expect(hook.result.current.isDragging).toBe(true);
    });

    it('hands off when the content runs out under a moving finger', () => {
      const {hook} = setup({snapHeights: () => [200]});
      const el = midDetentScroller(hook, 300); // finger lands mid-content
      act(() => {
        touch(el, 'touchstart', 500);
        el.scrollTop = 450; // the swipe scrolls the content...
        touch(el, 'touchmove', 350);
        el.scrollTop = 600; // ...until it runs out at the bottom
        touch(el, 'touchmove', 200); // the content ended here
        touch(el, 'touchmove', 150); // 50px BEYOND the end
      });
      expect(hook.result.current.isDragging).toBe(true);
      // Anchored where the content ran out, so only the 50px past it moves the
      // sheet. Anchoring at touchstart would have thrown it 350px instead.
      expect(liveOffset(hook)).toBe(150);
    });

    it('does not preventDefault the mid-gesture handoff', () => {
      // By this point in the gesture the events are non-cancelable anyway, and
      // there is nothing to cancel: the scroller is clamped at its end.
      // Claiming the gesture would only strand the content under the finger.
      const {hook} = setup({snapHeights: () => [200]});
      const el = midDetentScroller(hook, 300);
      let atEnd: Event | undefined;
      let past: Event | undefined;
      let further: Event | undefined;
      act(() => {
        touch(el, 'touchstart', 500);
        el.scrollTop = 600;
        atEnd = touch(el, 'touchmove', 200);
        past = touch(el, 'touchmove', 150);
        further = touch(el, 'touchmove', 100);
      });
      expect(hook.result.current.isDragging).toBe(true);
      expect(atEnd?.defaultPrevented).toBe(false);
      expect(past?.defaultPrevented).toBe(false);
      expect(further?.defaultPrevented).toBe(false);
    });

    it('gives the gesture back when the finger returns to the content end', () => {
      const {hook} = setup({snapHeights: () => [200]});
      const el = midDetentScroller(hook, 300);
      act(() => {
        touch(el, 'touchstart', 500);
        el.scrollTop = 600;
        touch(el, 'touchmove', 200); // the content ended here
        touch(el, 'touchmove', 150);
      });
      expect(liveOffset(hook)).toBe(150);

      act(() => {
        touch(el, 'touchmove', 210); // back below the anchor
      });
      // The native scroll was never cancelled, so it resumes from here. Two
      // things moving at once is the failure mode; the sheet yields.
      expect(hook.result.current.isDragging).toBe(false);
      expect(hook.result.current.settledOffset).toBe(200);
      // The sheet springs back to its detent while the content scrolls.
      land();

      act(() => {
        el.scrollTop = 600; // scrolled back to the end
        touch(el, 'touchmove', 190); // and pulls past it again
        touch(el, 'touchmove', 140);
      });
      expect(hook.result.current.isDragging).toBe(true);
      expect(liveOffset(hook)).toBe(150);
    });

    it('does not hand off on reaching the end without travelling past it', () => {
      // Landing on the last pixel is not a pull, and the momentum tail after
      // the finger lifts fires no touchmove at all, so it can never promote.
      const {hook} = setup({snapHeights: () => [200]});
      const el = midDetentScroller(hook, 300);
      act(() => {
        touch(el, 'touchstart', 500);
        el.scrollTop = 600;
        touch(el, 'touchmove', 200);
        touch(el, 'touchmove', 199); // jitter, not a pull
        touch(el, 'touchend', 199);
        el.scrollTop = 600; // momentum carries on with no finger down
      });
      expect(hook.result.current.isDragging).toBe(false);
      expect(hook.result.current.settledOffset).toBe(200);
    });

    it('leaves the mid-gesture pull to the content at the tallest detent', () => {
      // Same #5161 rule as the touchstart-armed edge: with no taller detent
      // there is nothing to expand into, so the scroller keeps the gesture.
      const {hook} = setup({snapHeights: () => [200]});
      const el = makeScroller({
        scrollTop: 300,
        clientHeight: 200,
        scrollHeight: 800,
      });
      act(() => hook.result.current.sheetRef(el));
      act(() => hook.result.current.bodyProps.ref(el));
      expect(hook.result.current.settledOffset).toBe(0);

      let past: Event | undefined;
      act(() => {
        touch(el, 'touchstart', 500);
        el.scrollTop = 600;
        touch(el, 'touchmove', 200);
        past = touch(el, 'touchmove', 100);
      });
      expect(hook.result.current.isDragging).toBe(false);
      expect(hook.result.current.dragOffset).toBe(0);
      expect(past?.defaultPrevented).toBe(false);
    });

    it('does not hand off while the content can still scroll', () => {
      const {hook} = setup({snapHeights: () => [200]});
      const el = midDetentScroller(hook, 0);
      act(() => {
        touch(el, 'touchstart', 500);
        el.scrollTop = 200;
        touch(el, 'touchmove', 300);
        el.scrollTop = 400;
        touch(el, 'touchmove', 100); // 400px of pull, all of it scrolling
      });
      expect(hook.result.current.isDragging).toBe(false);
      expect(hook.result.current.settledOffset).toBe(200);
    });
  });

  describe('viewport resize', () => {
    // The panel pins the sheet's height in px at a resizing detent; everywhere
    // else the height comes from CSS (`92dvh`), which follows the viewport.
    // Model both, so a measurement taken while pinned reads the pin back —
    // that is the trap the hook has to work around.
    const SNAP_FRACTIONS = [0.14, 0.5, 0.92];
    const RESERVED_BELOW_FLOOR = 48;

    function viewportHarness(initialViewport: number) {
      let viewport = initialViewport;
      const el = document.createElement('div');
      el.setPointerCapture = vi.fn();
      el.releasePointerCapture = vi.fn();
      el.getBoundingClientRect = () =>
        ({
          height: el.style.height
            ? Number.parseFloat(el.style.height)
            : 0.92 * viewport + RESERVED_BELOW_FLOOR,
        }) as DOMRect;

      const onSnap = vi.fn();
      const {hook} = setup({
        offscreenBlockEndInset: RESERVED_BELOW_FLOOR,
        snapHeights: () => SNAP_FRACTIONS.map(f => f * viewport),
        onSnap,
      });
      act(() => hook.result.current.sheetRef(el));

      // What BottomSheetPanel renders at rest.
      const paint = () => {
        const {sheetHeight, settledLayoutOffset} = hook.result.current;
        el.style.height =
          settledLayoutOffset > 0
            ? `${sheetHeight - settledLayoutOffset}px`
            : '';
      };
      const dragTo = (offset: number) => {
        // Anchor anywhere; what matters is the delta from where it rests, so
        // this drags in whichever direction the target detent lies.
        const anchor = 1000;
        const delta = offset - hook.result.current.settledOffset;
        act(() =>
          hook.result.current.handleProps.onPointerDown(
            pointerEvent(anchor, 0, el),
          ),
        );
        // Slow: well under the flick threshold, so the release settles.
        act(() =>
          hook.result.current.handleProps.onPointerMove(
            pointerEvent(anchor + delta, 2000, el),
          ),
        );
        act(() =>
          hook.result.current.handleProps.onPointerUp(
            pointerEvent(anchor + delta, 2400, el),
          ),
        );
        // The panel resolves the settle when the transform transition ends.
        act(() => hook.result.current.completeScrollAreaSettle());
        paint();
      };
      const resizeTo = (next: number) => {
        viewport = next;
        act(() => {
          window.dispatchEvent(new Event('resize'));
        });
        paint();
      };
      // What the user sees: the border box, less the part reserved below the
      // viewport floor and the part translated past it.
      const visibleHeight = () =>
        hook.result.current.sheetHeight -
        RESERVED_BELOW_FLOOR -
        hook.result.current.settledOffset;

      return {hook, el, onSnap, dragTo, resizeTo, visibleHeight};
    }

    it('re-resolves the settled detent against the new viewport', () => {
      // 900px viewport: detents at 0 / 378 / 702, so the half-height stop
      // shows 450px of sheet.
      const {hook, dragTo, resizeTo, visibleHeight, onSnap} =
        viewportHarness(900);
      dragTo(378);
      expect(hook.result.current.settledOffset).toBe(378);
      expect(visibleHeight()).toBe(450);

      resizeTo(600);

      // Still the half-height stop, now half of 600 — not the 450px (75% of
      // the window) it was frozen at before.
      expect(visibleHeight()).toBe(300);
      expect(hook.result.current.settledOffset).toBe(252);
      expect(onSnap).toHaveBeenLastCalledWith(300);
    });

    it('keeps the peek detent on screen when the viewport shrinks', () => {
      const {hook, dragTo, resizeTo, visibleHeight} = viewportHarness(900);
      dragTo(702);
      expect(hook.result.current.settledOffset).toBe(702);
      // The peek keeps its full height and slides, so its offset is the whole
      // of its travel — and 702px of travel does not fit in a 600px window.
      expect(hook.result.current.settledLayoutOffset).toBe(0);

      resizeTo(600);

      expect(hook.result.current.settledOffset).toBe(468);
      expect(hook.result.current.settledOffset).toBeLessThan(
        hook.result.current.sheetHeight,
      );
      expect(visibleHeight()).toBe(84);
    });

    it('refreshes the fully open height the next drag measures against', () => {
      const {hook, dragTo, resizeTo} = viewportHarness(900);
      dragTo(378);
      expect(hook.result.current.sheetHeight).toBe(876);

      resizeTo(600);

      // Measured through the pinned height the panel had written for the old
      // viewport, so this is the natural budget and not the stale pin.
      expect(hook.result.current.sheetHeight).toBe(600);

      // Dragging back up lands on fully open rather than overshooting past it
      // toward where fully open used to be.
      dragTo(0);
      expect(hook.result.current.settledOffset).toBe(0);
      expect(hook.result.current.settledLayoutOffset).toBe(0);
    });

    it('leaves a drag in progress alone', () => {
      const {hook, el} = viewportHarness(900);
      act(() =>
        hook.result.current.handleProps.onPointerDown(pointerEvent(0, 0, el)),
      );
      act(() =>
        hook.result.current.handleProps.onPointerMove(
          pointerEvent(200, 2000, el),
        ),
      );

      act(() => {
        window.dispatchEvent(new Event('resize'));
      });

      expect(hook.result.current.isDragging).toBe(true);
      expect(hook.result.current.sheetHeight).toBe(876);
      expect(hook.result.current.settledOffset).toBe(0);
    });

    it('stops re-resolving once the sheet closes', () => {
      const {hook, dragTo, resizeTo} = viewportHarness(900);
      dragTo(378);
      act(() => hook.rerender({isOpen: false, onDismiss: vi.fn()}));

      resizeTo(600);

      expect(hook.result.current.sheetHeight).toBe(876);
    });
  });
});

describe('useSheetGestures: the release on the compositor', () => {
  // A finger: releases run on UIKit's springs
  // (releaseMotion.ts). A mouse keeps the theme's timing.
  function stubPointer({
    coarse,
    reducedMotion = false,
  }: {
    coarse: boolean;
    reducedMotion?: boolean;
  }) {
    if (coarse) {
      stubIosIdiom({reducedMotion});
      return;
    }
    vi.stubGlobal(
      'matchMedia',
      vi.fn((query: string) => ({
        matches:
          (coarse && query.includes('pointer: coarse')) ||
          (reducedMotion && query.includes('prefers-reduced-motion')),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    );
  }
  beforeEach(() => stubPointer({coarse: true}));

  interface Played {
    keyframes: Keyframe[];
    options: KeyframeAnimationOptions;
  }
  /** Records the Web Animations the animator plays on `el` (jsdom has none). */
  function recordAnimations(el: HTMLElement): Played[] {
    const played: Played[] = [];
    el.animate = vi.fn((keyframes, options) => {
      played.push({
        keyframes: keyframes as Keyframe[],
        options: options as KeyframeAnimationOptions,
      });
      return {cancel: vi.fn(), startTime: 0} as unknown as Animation;
    });
    return played;
  }
  /** The travel (px) a played animation has at `ms` after its start. */
  function travelAt(animation: Played, ms: number): number {
    const duration = animation.options.duration as number;
    const frames = animation.keyframes.map(frame => ({
      t: (frame.offset as number) * duration,
      y: Number.parseFloat(String(frame.translate).split(' ')[1]),
    }));
    for (let i = 1; i < frames.length; i++) {
      if (ms <= frames[i].t) {
        const a = frames[i - 1];
        const b = frames[i];
        return a.y + ((b.y - a.y) * (ms - a.t)) / (b.t - a.t);
      }
    }
    return frames[frames.length - 1].y;
  }

  it('springs to the detent on the slow-release spring, handed the finger velocity', () => {
    const {hook} = setup({snapHeights: () => [200]});
    const t = makeTarget();
    const played = recordAnimations(t);
    down(hook, 0, 0, t);
    // 600 px/s, released at 60: lands on the 200 detent (sheetRelease).
    stream(hook, t, {from: 0, to: 60, t0: 0, t1: 100});
    act(() =>
      hook.result.current.handleProps.onPointerUp(pointerEvent(60, 102, t)),
    );
    expect(played).toHaveLength(1);
    const curve = solveSpring(toSpring(springs.sheetDetent), {
      from: 60,
      to: 200,
      velocity: 600,
    });
    // On the closed-form spring, at every keyframe ...
    for (const {t: ms, value} of keyframesUntil(played[0], translateYOf, 400)) {
      expect(value).toBeCloseTo(curve.value(ms / 1000), 1);
    }
    // ... which is the spring handed the finger's 600 px/s (M3): one
    // started at rest would trail it by more than 5 px 16 ms in.
    const atRest = solveSpring(toSpring(springs.sheetDetent), {
      from: 60,
      to: 200,
      velocity: 0,
    });
    expect(travelAt(played[0], 16) - atRest.value(0.016)).toBeGreaterThan(5);
    // Composited: keyframes played linearly on one Web Animation, so the
    // main thread is not involved.
    expect(played[0].options).toMatchObject({easing: 'linear'});
    // The inline style holds what is on screen while the spring runs, and the
    // end is written when it retires.
    expect(travel(t)).toBe(60);
    expect(translateYOf(played[0].keyframes.at(-1) as Keyframe)).toBe(200);
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(travel(t)).toBe(200);
  });

  it('takes a fast release on the 80 % damped spring', () => {
    const {hook} = setup({snapHeights: () => [200]});
    const t = makeTarget();
    const played = recordAnimations(t);
    down(hook, 200, 0, t);
    // Rest at 0; a fast upward pull past the top settles back at 0 on the
    // fast spring (|v| ≥ sheet.release.fastSpeed).
    const speed = sheet.release.fastSpeed + 300;
    stream(hook, t, {from: 200, to: 200 - speed * 0.05, t0: 0, t1: 50});
    act(() =>
      hook.result.current.handleProps.onPointerUp(
        pointerEvent(200 - speed * 0.05, 51, t),
      ),
    );
    const from = travelAt(played.at(-1) as Played, 0);
    const curve = solveSpring(toSpring(springs.sheetReleaseFast), {
      from,
      to: 0,
      velocity: -speed,
    });
    for (const {t: ms, value} of keyframesUntil(
      played.at(-1) as Played,
      translateYOf,
      200,
    )) {
      expect(value).toBeCloseTo(curve.value(ms / 1000), 1);
    }
  });

  it('lets a finger catch the settling sheet where the curve has it, without a jump', () => {
    const {hook} = setup({snapHeights: () => [200]});
    const t = makeTarget();
    down(hook, 0, 0, t);
    stream(hook, t, {from: 0, to: 60, t0: 0, t1: 100});
    act(() =>
      hook.result.current.handleProps.onPointerUp(pointerEvent(60, 102, t)),
    );
    const curve = solveSpring(toSpring(springs.sheetDetent), {
      from: 60,
      to: 200,
      velocity: 600,
    });
    act(() => {
      vi.advanceTimersByTime(80);
    });
    const onScreen = curve.value(0.08);
    // The finger lands 80 ms into the settle and holds still.
    act(() =>
      hook.result.current.handleProps.onPointerDown(pointerEvent(500, 1000, t)),
    );
    expect(hook.result.current.isDragging).toBe(true);
    expect(liveOffset(hook)).toBeCloseTo(onScreen, 0);
    expect(travel(t)).toBeCloseTo(onScreen, 0);
    // And it drags from there.
    move(hook, 480, 1050, t);
    expect(liveOffset(hook)).toBeCloseTo(onScreen - 20, 0);
  });

  it('on iOS, turns text selection and the callout off on the whole sheet while a finger holds or drags it, and back on at the lift', () => {
    // iOS WebKit fires no selectstart for a long-press selection (iOS 26.2
    // simulator), so only user-select refuses one there, and only on the whole
    // sheet: on the element under the finger alone, the long press selected a
    // word beside it (4 of 4 takes).
    stubIosIdiom();
    const {hook} = setup({snapHeights: () => [200]});
    const t = makeTarget();
    t.style.setProperty('user-select', 'text');
    const touch = (y: number, time: number) =>
      ({
        ...pointerEvent(y, time, t),
        pointerType: 'touch',
      }) as unknown as React.PointerEvent;
    act(() => hook.result.current.sheetRef(t));
    act(() => hook.result.current.handleProps.onPointerDown(touch(0, 0)));
    expect(t.style.getPropertyValue('user-select')).toBe('none');
    for (const [y, time] of [
      [20, 33],
      [40, 66],
      [60, 100],
    ]) {
      act(() => hook.result.current.handleProps.onPointerMove(touch(y, time)));
    }
    act(() => hook.result.current.handleProps.onPointerUp(touch(60, 102)));
    expect(t.style.getPropertyValue('user-select')).toBe('text');
    act(() => {
      vi.advanceTimersByTime(80);
    });
    // A finger catches it mid-settle and holds still: off at the touch-down,
    // before a long press would select, ...
    act(() => hook.result.current.handleProps.onPointerDown(touch(500, 1000)));
    expect(hook.result.current.isDragging).toBe(true);
    expect(t.style.getPropertyValue('user-select')).toBe('none');
    // ... and the sheet's own value is back when it lets go.
    act(() => hook.result.current.handleProps.onPointerUp(touch(500, 1600)));
    expect(t.style.getPropertyValue('user-select')).toBe('text');
  });

  it('elsewhere, cancels the selection a finger holding or dragging the sheet would start, and changes no style', () => {
    stubCoarsePointer();
    vi.stubGlobal('CSS', {supports: () => false, escape: (v: string) => v});
    const {hook} = setup({snapHeights: () => [200]});
    const t = makeTarget();
    const row = document.createElement('span');
    t.appendChild(row);
    t.style.setProperty('user-select', 'text');
    const touch = (y: number, time: number) =>
      ({
        ...pointerEvent(y, time, t),
        target: row,
        pointerType: 'touch',
      }) as unknown as React.PointerEvent;
    // A long press on the row: Chromium fires `selectstart` there first.
    const longPressSelects = () => {
      const event = new Event('selectstart', {bubbles: true, cancelable: true});
      row.dispatchEvent(event);
      return !event.defaultPrevented;
    };
    act(() => hook.result.current.sheetRef(t));
    const style = t.getAttribute('style');
    act(() => hook.result.current.handleProps.onPointerDown(touch(0, 0)));
    expect(longPressSelects()).toBe(false);
    // No style changes: one would repaint the whole sheet at the touch-down
    // and again at the lift.
    expect(t.getAttribute('style')).toBe(style);
    expect(row.getAttribute('style')).toBeNull();
    for (const [y, time] of [
      [20, 33],
      [40, 66],
      [60, 100],
    ]) {
      act(() => hook.result.current.handleProps.onPointerMove(touch(y, time)));
    }
    act(() => hook.result.current.handleProps.onPointerUp(touch(60, 102)));
    expect(longPressSelects()).toBe(true);
    act(() => {
      vi.advanceTimersByTime(80);
    });
    // A finger catches it mid-settle and holds still: refused from the
    // touch-down, before a long press would select, until it lets go.
    act(() => hook.result.current.handleProps.onPointerDown(touch(500, 1000)));
    expect(hook.result.current.isDragging).toBe(true);
    expect(longPressSelects()).toBe(false);
    expect(t.style.getPropertyValue('user-select')).toBe('text');
    act(() => hook.result.current.handleProps.onPointerUp(touch(500, 1600)));
    expect(longPressSelects()).toBe(true);
  });

  it('carries a drag-dismissed sheet off screen on the release spring, for the host to wait on', async () => {
    // A host that closes when asked.
    const onDismiss = vi.fn();
    const snapHeights = () => [200];
    const hook = renderHook(() => {
      const [isOpen, setIsOpen] = useState(true);
      return useSheetGestures({
        isOpen,
        snapHeights,
        onDismiss: () => {
          onDismiss();
          setIsOpen(false);
        },
      });
    });
    const t = makeTarget();
    const played = recordAnimations(t);
    down(hook, 0, 0, t);
    stream(hook, t, {from: 0, to: 150, t0: 0, t1: 100}); // 1500 px/s
    act(() =>
      hook.result.current.handleProps.onPointerUp(pointerEvent(150, 102, t)),
    );
    expect(onDismiss).toHaveBeenCalledTimes(1);
    const exit = hook.result.current.gestureExitRef.current;
    expect(exit).not.toBeNull();
    // Rested at the open detent, so the resting transform is none.
    expect(exit?.transform).toBe('none');
    // The inline style holds what is on screen while the spring runs, and the
    // end is written when it retires: no frame shows where it is going. The
    // played curve ends gone, the sheet's whole 400px below where it rests
    // open.
    expect(travel(t)).toBe(150);
    expect(translateYOf(played[0].keyframes.at(-1) as Keyframe)).toBe(400);
    const curve = solveSpring(toSpring(springs.sheetDismissSwipe), {
      from: 150,
      to: 400,
      velocity: 1500,
    });
    expect(travelAt(played[0], 50)).toBeCloseTo(curve.value(0.05), 1);
    // The exit ends when the spring lands, and the end is written then.
    vi.advanceTimersByTime(2000);
    await expect(exit?.finished).resolves.toBe(true);
    expect(travel(t)).toBe(400);
  });

  it('settles a drag dismissal as unfinished when the sheet unmounts mid-exit', async () => {
    const snapHeights = () => [200];
    // A host that closes when asked, as the sheet's own host does.
    const hook = renderHook(() => {
      const [isOpen, setIsOpen] = useState(true);
      return useSheetGestures({
        isOpen,
        snapHeights,
        onDismiss: () => setIsOpen(false),
      });
    });
    const t = makeTarget();
    recordAnimations(t);
    down(hook, 0, 0, t);
    stream(hook, t, {from: 0, to: 150, t0: 0, t1: 100}); // 1500 px/s
    act(() =>
      hook.result.current.handleProps.onPointerUp(pointerEvent(150, 102, t)),
    );
    const exit = hook.result.current.gestureExitRef.current;
    expect(exit).not.toBeNull();
    // Unmounted before the spring lands: its timer must not finish it.
    hook.unmount();
    vi.advanceTimersByTime(2000);
    await expect(exit?.finished).resolves.toBe(false);
  });

  it('springs back to the detent when the host keeps a drag-dismissed sheet open', () => {
    // A controlled host that does not close: isOpen stays true.
    const {hook, onDismiss} = setup({snapHeights: () => [200]});
    const t = makeTarget();
    down(hook, 0, 0, t);
    stream(hook, t, {from: 0, to: 150, t0: 0, t1: 100});
    act(() =>
      hook.result.current.handleProps.onPointerUp(pointerEvent(150, 102, t)),
    );
    expect(onDismiss).toHaveBeenCalledTimes(1);
    // The commit after the request finds the sheet still open.
    expect(hook.result.current.gestureExitRef.current).toBeNull();
    expect(travel(t)).toBe(0);
    land();
    expect(travel(t)).toBe(0);
    expect(hook.result.current.settledOffset).toBe(0);
  });

  it('cross-fades a release under reduced motion: no spring, 200 ms or less (design:reduced-motion DR2)', () => {
    stubPointer({coarse: true, reducedMotion: true});
    const {hook} = setup({snapHeights: () => [200]});
    const t = makeTarget();
    const played = recordAnimations(t);
    down(hook, 0, 0, t);
    stream(hook, t, {from: 0, to: 60, t0: 0, t1: 100});
    act(() =>
      hook.result.current.handleProps.onPointerUp(pointerEvent(60, 102, t)),
    );
    expect(hook.result.current.settledOffset).toBe(200);
    // The sheet fades; nothing runs longer than the record's 200 ms.
    expect(played.some(a => changedProperties(a).includes('opacity'))).toBe(
      true,
    );
    for (const animation of played) {
      expect(settledMs(animation)).toBeLessThanOrEqual(200.5);
    }
  });

  it('fades a drag-dismissed sheet out in place under reduced motion', () => {
    stubPointer({coarse: true, reducedMotion: true});
    const snapHeights = () => [200];
    const hook = renderHook(() => {
      const [isOpen, setIsOpen] = useState(true);
      return useSheetGestures({
        isOpen,
        snapHeights,
        onDismiss: () => setIsOpen(false),
      });
    });
    const t = makeTarget();
    const played = recordAnimations(t);
    down(hook, 0, 0, t);
    stream(hook, t, {from: 0, to: 150, t0: 0, t1: 100});
    act(() =>
      hook.result.current.handleProps.onPointerUp(pointerEvent(150, 102, t)),
    );
    expect(hook.result.current.gestureExitRef.current).not.toBeNull();
    const fade = played.find(a => changedProperties(a).includes('opacity'));
    expect(fade).toBeDefined();
    // Fades out where it is, within 200 ms.
    expect(Number((fade as Played).keyframes[0].opacity)).toBeCloseTo(1, 2);
    expect(settledMs(fade as Played)).toBeLessThanOrEqual(200.5);
    for (const animation of played) {
      expect(settledMs(animation)).toBeLessThanOrEqual(200.5);
    }
  });

  it('keeps the theme timing under a mouse, without the velocity hand-off', () => {
    stubPointer({coarse: false});
    expect(matchMedia('(pointer: coarse)').matches).toBe(false);
    const {hook} = setup({snapHeights: () => [200]});
    const t = makeTarget();
    // What the panel's stylesheet gives the sheet's transform.
    t.style.transitionProperty = 'transform, opacity';
    t.style.transitionDuration = '410ms, 410ms';
    t.style.transitionTimingFunction =
      'cubic-bezier(0.24, 1, 0.4, 1), cubic-bezier(0.24, 1, 0.4, 1)';
    const played = recordAnimations(t);
    down(hook, 0, 0, t);
    // 200 px/s: today's rule projects 60 + 0.2 × 499 = 160, onto 200.
    stream(hook, t, {from: 0, to: 60, t0: 0, t1: 300});
    act(() =>
      hook.result.current.handleProps.onPointerUp(pointerEvent(60, 302, t)),
    );
    expect(played).toHaveLength(1);
    // 410 ms of curve, then the animator's end-state hold.
    expect((played[0].options.duration as number) - END_HOLD_MS).toBeCloseTo(
      410,
      0,
    );
    // The theme's easing from 60 to 200, whatever the finger's speed.
    const ease = (p: number) => {
      // cubic-bezier(0.24, 1, 0.4, 1), by bisection on x.
      const bez = (a: number, b: number, u: number) =>
        3 * a * u * (1 - u) ** 2 + 3 * b * u * u * (1 - u) + u ** 3;
      let lo = 0;
      let hi = 1;
      for (let i = 0; i < 60; i++) {
        const mid = (lo + hi) / 2;
        if (bez(0.24, 0.4, mid) < p) {
          lo = mid;
        } else {
          hi = mid;
        }
      }
      return bez(1, 1, (lo + hi) / 2);
    };
    for (const {t: ms, value} of keyframesUntil(played[0], translateYOf, 409)) {
      expect(value).toBeCloseTo(60 + 140 * ease(ms / 410), 1);
    }
    // The inline style holds what is on screen while the curve runs, and the
    // end is written when it retires.
    expect(travel(t)).toBe(60);
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(travel(t)).toBe(200);
  });

  /** A finger on Android: coarse, in an engine without `-webkit-touch-callout`. One touch model: it gets what a finger on iOS gets. */
  function stubAndroidFinger({reducedMotion = false} = {}) {
    vi.stubGlobal(
      'matchMedia',
      vi.fn((query: string) => ({
        matches:
          query.includes('pointer: coarse') ||
          (reducedMotion && query.includes('prefers-reduced-motion')),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    );
    vi.stubGlobal('CSS', {supports: () => false, escape: (v: string) => v});
  }

  it("takes UIKit's rule and spring under a finger on Android too (one touch model)", () => {
    stubAndroidFinger();
    const {hook, onDismiss} = setup({snapHeights: () => [200]});
    const t = makeTarget();
    t.style.transitionProperty = 'transform';
    t.style.transitionDuration = '410ms';
    t.style.transitionTimingFunction = 'cubic-bezier(0.24, 1, 0.4, 1)';
    const played = recordAnimations(t);
    down(hook, 0, 0, t);
    // 600 px/s over 100 px: UIKit's rule lands on 200 (100 + 0.1 × 600 =
    // 160), where today's would project past the dismiss line.
    stream(hook, t, {from: 0, to: 100, t0: 0, t1: 167});
    act(() =>
      hook.result.current.handleProps.onPointerUp(pointerEvent(100, 169, t)),
    );
    expect(onDismiss).not.toHaveBeenCalled();
    expect(hook.result.current.settledOffset).toBe(200);
    // On the slow-release spring, not the theme's 410 ms curve.
    expect(played).toHaveLength(1);
    const curve = solveSpring(toSpring(springs.sheetDetent), {
      from: 100,
      to: 200,
      velocity: 600,
    });
    expect(travelAt(played[0], 100)).toBeCloseTo(curve.value(0.1), 0);
  });

  it('cross-fades a touch release on Android under reduced motion, 200 ms or less (DR2)', () => {
    stubAndroidFinger({reducedMotion: true});
    const {hook} = setup({snapHeights: () => [200]});
    const t = makeTarget();
    t.style.transitionProperty = 'transform';
    t.style.transitionDuration = '410ms';
    t.style.transitionTimingFunction = 'ease';
    const played = recordAnimations(t);
    down(hook, 0, 0, t);
    // 500 px/s to 150 px: UIKit's rule lands on 200 (150 + 0.1 × 500).
    stream(hook, t, {from: 0, to: 150, t0: 0, t1: 300});
    act(() =>
      hook.result.current.handleProps.onPointerUp(pointerEvent(150, 302, t)),
    );
    expect(hook.result.current.settledOffset).toBe(200);
    expect(played.some(a => changedProperties(a).includes('opacity'))).toBe(
      true,
    );
    for (const animation of played) {
      expect(settledMs(animation)).toBeLessThanOrEqual(200.5);
    }
  });

  it('lands a mouse release at once under reduced motion (DR3)', () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn((query: string) => ({
        matches: query.includes('prefers-reduced-motion'),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    );
    expect(matchMedia('(pointer: coarse)').matches).toBe(false);
    const {hook} = setup({snapHeights: () => [200]});
    const t = makeTarget();
    t.style.transitionProperty = 'transform';
    t.style.transitionDuration = '410ms';
    t.style.transitionTimingFunction = 'ease';
    const played = recordAnimations(t);
    down(hook, 0, 0, t);
    stream(hook, t, {from: 0, to: 60, t0: 0, t1: 300});
    act(() =>
      hook.result.current.handleProps.onPointerUp(pointerEvent(60, 302, t)),
    );
    expect(hook.result.current.settledOffset).toBe(200);
    // Nothing animates: every played value holds still.
    for (const animation of played) {
      expect(changedProperties(animation)).toEqual([]);
    }
  });

  it('fades a finger release under reduced motion with a fine primary pointer too (DR2)', () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn((query: string) => ({
        matches: query.includes('prefers-reduced-motion'),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    );
    const {hook} = setup({snapHeights: () => [200]});
    // A finger on a touchscreen whose primary pointer is fine drags the
    // handle through its pointer events (the touch listeners stay off
    // there, spec:AST-094 FR24).
    const el = makeTarget();
    document.body.appendChild(el);
    act(() => hook.result.current.sheetRef(el));
    el.style.transitionProperty = 'transform';
    el.style.transitionDuration = '410ms';
    el.style.transitionTimingFunction = 'ease';
    const played = recordAnimations(el);
    // 150 px down, then still before the lift (on the page clock): it
    // settles on the 200 px detent.
    const t0 = performance.now();
    act(() =>
      hook.result.current.handleProps.onPointerDown(fingerEvent(0, t0, el)),
    );
    for (const [y, dt] of [
      [75, 100],
      [150, 200],
    ]) {
      act(() => {
        vi.advanceTimersByTime(100);
        hook.result.current.handleProps.onPointerMove(
          fingerEvent(y, t0 + dt, el),
        );
      });
    }
    expect(hook.result.current.isDragging).toBe(true);
    act(() => {
      vi.advanceTimersByTime(150);
      hook.result.current.handleProps.onPointerUp(
        fingerEvent(150, t0 + 350, el),
      );
    });
    expect(hook.result.current.settledOffset).toBe(200);
    // The release fades, though the primary pointer is fine: a finger
    // started it.
    expect(played.some(a => changedProperties(a).includes('opacity'))).toBe(
      true,
    );
    for (const animation of played) {
      expect(settledMs(animation)).toBeLessThanOrEqual(200.5);
    }
  });

  it("registers its body's own touch listeners under every primary pointer, and the catch's only where it is coarse (spec:AST-094 FR24)", () => {
    const touchTypes = (spy: {mock: {calls: unknown[][]}}): string[] =>
      spy.mock.calls
        .map((call: unknown[]) => String(call[0]))
        .filter((type: string) => type.startsWith('touch'));
    for (const coarse of [false, true]) {
      if (coarse) {
        stubCoarsePointer();
      } else {
        vi.stubGlobal(
          'matchMedia',
          vi.fn((query: string) => ({
            matches: false,
            media: query,
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
          })),
        );
      }
      const {hook} = setup({snapHeights: () => [200]});
      const dialog = document.createElement('dialog');
      document.body.append(dialog);
      const sheet = makeTarget();
      const body = document.createElement('div');
      sheet.append(body);
      dialog.append(sheet);
      const onBody = vi.spyOn(body, 'addEventListener');
      const onDialog = vi.spyOn(dialog, 'addEventListener');
      act(() => hook.result.current.sheetRef(sheet));
      act(() => hook.result.current.bodyProps.ref(body));
      // A touchscreen laptop's finger pulls the body as a phone's does: under
      // a fine pointer a component may listen on its own element.
      expect(touchTypes(onBody)).toContain('touchmove');
      if (coarse) {
        expect(touchTypes(onDialog)).toContain('touchstart');
      } else {
        expect(touchTypes(onDialog)).toEqual([]);
      }
      hook.unmount();
    }
  });

  it('leaves a drag-dismissed sheet to the host exit under a mouse, from where it was', () => {
    stubPointer({coarse: false});
    expect(matchMedia('(pointer: coarse)').matches).toBe(false);
    const {hook, onDismiss} = setup({snapHeights: () => [200]});
    const t = makeTarget();
    t.style.transitionProperty = 'transform';
    t.style.transitionDuration = '410ms';
    t.style.transitionTimingFunction = 'ease';
    down(hook, 0, 0, t);
    stream(hook, t, {from: 0, to: 150, t0: 0, t1: 100});
    act(() =>
      hook.result.current.handleProps.onPointerUp(pointerEvent(150, 102, t)),
    );
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(hook.result.current.gestureExitRef.current).toBeNull();
    // The travel is folded into the transform the host's exit runs from.
    expect(t.style.transform).toBe('translateY(150px)');
    expect(travel(t)).toBe(0);
  });

  it('reads touch velocity from the touch events, however late they are handled', () => {
    const {hook, onDismiss} = setup({snapHeights: () => [200]});
    const el = document.createElement('div');
    Object.defineProperties(el, {
      scrollTop: {value: 0, writable: true},
      clientHeight: {value: 200},
      scrollHeight: {value: 800},
    });
    el.getBoundingClientRect = () => ({height: SHEET_HEIGHT}) as DOMRect;
    act(() => hook.result.current.sheetRef(el));
    act(() => hook.result.current.bodyProps.ref(el));
    const touch = (type: string, y: number, timeStamp: number) => {
      const ev = new Event(type, {bubbles: true, cancelable: true});
      Object.defineProperty(ev, 'changedTouches', {
        value: [{identifier: 1, clientY: y}],
      });
      Object.defineProperty(ev, 'touches', {
        value: type === 'touchend' ? [] : [{identifier: 1, clientY: y}],
      });
      Object.defineProperty(ev, 'timeStamp', {value: timeStamp});
      el.dispatchEvent(ev);
    };
    // A pull down at 1500 px/s, every event delivered in one late batch.
    act(() => {
      touch('touchstart', 0, 0);
      for (let i = 1; i <= 6; i++) {
        touch('touchmove', i * 25, (i * 100) / 6);
      }
      touch('touchend', 150, 101);
    });
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});

describe('useSheetGestures: a finger on the drawn sheet during a release', () => {
  // WebKit (iOS Safari 26.2) hit-tests an element a compositor animation is
  // moving at its un-animated position: a touch on the moving sheet arrives
  // on whatever sat there when the release began (here, the dialog: the
  // scrim). The hook maps it through the sheet's drawn rect instead.
  beforeEach(() => stubIosIdiom());

  interface Played {
    keyframes: Keyframe[];
    options: KeyframeAnimationOptions;
    cancel: ReturnType<typeof vi.fn>;
  }
  function recordAnimations(el: HTMLElement): Played[] {
    const played: Played[] = [];
    el.animate = vi.fn((keyframes, options) => {
      const cancel = vi.fn();
      played.push({
        keyframes: keyframes as Keyframe[],
        options: options as KeyframeAnimationOptions,
        cancel,
      });
      return {cancel, startTime: 0} as unknown as Animation;
    });
    return played;
  }
  function travelAt(animation: Played, ms: number): number {
    const duration = animation.options.duration as number;
    const frames = animation.keyframes.map(frame => ({
      t: (frame.offset as number) * duration,
      v: Number.parseFloat(String(frame.translate).split(' ')[1]),
    }));
    for (let i = 1; i < frames.length; i++) {
      if (ms <= frames[i].t) {
        const a = frames[i - 1];
        const b = frames[i];
        return a.v + ((b.v - a.v) * (ms - a.t)) / (b.t - a.t);
      }
    }
    return frames[frames.length - 1].v;
  }
  function touchOnDialog(
    dialog: HTMLElement,
    type: string,
    y: number,
    id = 7,
  ): Event {
    const ev = new Event(type, {bubbles: true, cancelable: true});
    const point = {identifier: id, clientX: 100, clientY: y};
    Object.defineProperty(ev, 'changedTouches', {value: [point]});
    Object.defineProperty(ev, 'touches', {
      value: type === 'touchend' || type === 'touchcancel' ? [] : [point],
    });
    dialog.dispatchEvent(ev);
    return ev;
  }
  /** A 400px sheet whose layout box starts 300px down, in a modal dialog, released toward its 200px stop. */
  function releasing() {
    const {hook} = setup({
      snapHeights: () => [200],
      onScrimOpacity: vi.fn(),
    });
    const dialog = document.createElement('dialog');
    const target = makeTarget();
    for (const [key, value] of Object.entries({
      offsetTop: 300,
      offsetLeft: 0,
      offsetWidth: 400,
      offsetHeight: 400,
      offsetParent: null,
    })) {
      Object.defineProperty(target, key, {value, configurable: true});
    }
    dialog.appendChild(target);
    document.body.appendChild(dialog);
    const sheetAnimations = recordAnimations(target);
    recordAnimations(dialog);
    act(() => hook.result.current.sheetRef(target));
    down(hook, 0, 0, target);
    stream(hook, target, {from: 0, to: 290, t0: 0, t1: 600});
    restAt(hook, 290, 650, target);
    act(() =>
      hook.result.current.handleProps.onPointerUp(
        pointerEvent(290, 800, target),
      ),
    );
    const release = sheetAnimations.at(-1) as Played;
    act(() => {
      vi.advanceTimersByTime(60);
    });
    // Where the sheet is drawn 60 ms into its release.
    const y = travelAt(release, 60);
    return {hook, dialog, target, release, y, drawnTop: 300 + y};
  }

  it('catches the sheet at touch-down when the touch lands on the scrim inside the drawn sheet', () => {
    const {hook, dialog, release, y, drawnTop} = releasing();
    expect(hook.result.current.settledOffset).toBe(200);
    act(() => {
      touchOnDialog(dialog, 'touchstart', drawnTop + 20);
    });
    // Caught where it is drawn: the release is abandoned in place.
    expect(release.cancel).toHaveBeenCalled();
    expect(hook.result.current.activeOffsetRef.current).toBeCloseTo(y, 0);
    // The finger drives it from there.
    act(() => {
      touchOnDialog(dialog, 'touchmove', drawnTop + 40);
    });
    expect(hook.result.current.activeOffsetRef.current).toBeCloseTo(y + 20, 0);
    act(() => {
      touchOnDialog(dialog, 'touchend', drawnTop + 40);
    });
    // The tap's click on the stale target is not a scrim tap.
    const click = new MouseEvent('click', {bubbles: true, cancelable: true});
    const onClick = vi.fn();
    document.addEventListener('click', onClick);
    dialog.dispatchEvent(click);
    document.removeEventListener('click', onClick);
    expect(click.defaultPrevented).toBe(true);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('leaves a touch above the drawn sheet to the scrim', () => {
    const {hook, dialog, release, drawnTop} = releasing();
    act(() => {
      touchOnDialog(dialog, 'touchstart', drawnTop - 30);
      touchOnDialog(dialog, 'touchend', drawnTop - 30);
    });
    expect(release.cancel).not.toHaveBeenCalled();
    const click = new MouseEvent('click', {bubbles: true, cancelable: true});
    dialog.dispatchEvent(click);
    expect(click.defaultPrevented).toBe(false);
    expect(hook.result.current.settledOffset).toBe(200);
  });

  it('leaves touches alone when nothing travels', () => {
    const {hook} = setup({snapHeights: () => [200]});
    const dialog = document.createElement('dialog');
    const target = makeTarget();
    Object.defineProperty(target, 'offsetHeight', {value: 400});
    dialog.appendChild(target);
    document.body.appendChild(dialog);
    act(() => hook.result.current.sheetRef(target));
    act(() => {
      touchOnDialog(dialog, 'touchstart', 10);
      touchOnDialog(dialog, 'touchend', 10);
    });
    const click = new MouseEvent('click', {bubbles: true, cancelable: true});
    dialog.dispatchEvent(click);
    expect(click.defaultPrevented).toBe(false);
    expect(hook.result.current.activeOffsetRef.current).toBe(0);
  });
});

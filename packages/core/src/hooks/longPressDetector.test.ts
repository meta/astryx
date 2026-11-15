// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file longPressDetector.test.ts
 * @input vitest, createLongPressDetector
 * @output Tests the long-press detector with no React: a hand start, a touch
 *   press on the events' clock, a second finger, a late timer, a start handled
 *   late, the movement tolerance, disabled, the latest options, and a touch
 *   with no time. It also checks the claim a press makes as it fires.
 * @position Unit coverage for longPressDetector.ts; useLongPress.test.tsx
 *   covers the hook that wraps it
 */

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {watchPressClaims} from '../utils/pressClaim';
import {
  createLongPressDetector,
  type LongPressTouchEvent,
} from './longPressDetector';

// A window whose clock reads `at` now and moves with the fake timers.
function windowAt(at: number) {
  const offset = at - Date.now();
  return {performance: {now: () => Date.now() + offset}};
}

// A window whose clock reads only what the test sets: a busy page.
function busyWindow(at: number) {
  const view = {at, performance: {now: () => view.at}};
  return view;
}

function touch(
  view: unknown,
  timeStamp: number,
  points: {clientX: number; clientY: number}[] = [],
): LongPressTouchEvent {
  return {touches: points, timeStamp, view};
}

describe('createLongPressDetector', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('fires at the start point after the delay when started by hand, and not after a cancel', () => {
    const onLongPress = vi.fn();
    const detector = createLongPressDetector({onLongPress});
    detector.start({x: 3, y: 4});
    vi.advanceTimersByTime(499);
    expect(onLongPress).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onLongPress).toHaveBeenCalledWith({x: 3, y: 4});
    detector.start({x: 0, y: 0});
    detector.cancel();
    vi.advanceTimersByTime(1000);
    expect(onLongPress).toHaveBeenCalledTimes(1);
  });

  it('claims the press as it fires, and claims nothing for a press it drops', () => {
    const onClaim = vi.fn();
    const stopWatching = watchPressClaims(onClaim);
    const detector = createLongPressDetector({onLongPress: () => {}});
    detector.start({x: 0, y: 0});
    detector.cancel();
    vi.advanceTimersByTime(1000);
    expect(onClaim).not.toHaveBeenCalled();
    detector.start({x: 0, y: 0});
    vi.advanceTimersByTime(500);
    expect(onClaim).toHaveBeenCalledTimes(1);
    stopWatching();
  });

  it('reports a touch press first when its lift is stamped past the deadline, with no timer run', () => {
    const page = windowAt(1000);
    const onLongPress = vi.fn();
    const detector = createLongPressDetector({onLongPress});
    detector.touchStart(touch(page, 1000, [{clientX: 10, clientY: 20}]));
    detector.touchEnd(touch(page, 1800));
    expect(onLongPress).toHaveBeenCalledWith({x: 10, y: 20});
    expect(detector.isPending()).toBe(false);
  });

  it('ends the press on a second finger, and reports it first when that touch is stamped past the deadline', () => {
    const finger = {clientX: 5, clientY: 6};
    const early = vi.fn();
    const before = createLongPressDetector({onLongPress: early});
    const page = windowAt(1000);
    before.touchStart(touch(page, 1000, [finger]));
    before.touchStart(touch(page, 1200, [finger, finger]));
    expect(before.isPending()).toBe(false);
    vi.advanceTimersByTime(1000);
    expect(early).not.toHaveBeenCalled();

    const late = vi.fn();
    const after = createLongPressDetector({onLongPress: late});
    const busy = busyWindow(1000);
    after.touchStart(touch(busy, 1000, [finger]));
    after.touchStart(touch(busy, 1600, [finger, finger]));
    expect(late).toHaveBeenCalledWith({x: 5, y: 6});
    expect(after.isPending()).toBe(false);
  });

  it('lets a lift stamped before the deadline cancel the press when its timer runs late', () => {
    const onLongPress = vi.fn();
    const detector = createLongPressDetector({onLongPress});
    const busy = busyWindow(1000);
    detector.touchStart(touch(busy, 1000, [{clientX: 0, clientY: 0}]));
    // The page is busy past the deadline, so the timer runs late and yields
    // once to the queued lift.
    busy.at = 1700;
    vi.advanceTimersByTime(500);
    expect(onLongPress).not.toHaveBeenCalled();
    detector.touchEnd(touch(busy, 1400));
    vi.advanceTimersByTime(1000);
    expect(onLongPress).not.toHaveBeenCalled();

    detector.touchStart(touch(busy, 1700, [{clientX: 0, clientY: 0}]));
    busy.at = 2400;
    vi.advanceTimersByTime(500);
    expect(onLongPress).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onLongPress).toHaveBeenCalledTimes(1);
  });

  it('waits only for the rest of the hold when its start is handled late', () => {
    const onLongPress = vi.fn();
    const detector = createLongPressDetector({onLongPress});
    detector.touchStart(
      touch(windowAt(1300), 1000, [{clientX: 0, clientY: 0}]),
    );
    vi.advanceTimersByTime(199);
    expect(onLongPress).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onLongPress).toHaveBeenCalledTimes(1);
  });

  it('drops the press past the movement tolerance, or past a per-press tolerance', () => {
    const onLongPress = vi.fn();
    const detector = createLongPressDetector({onLongPress});
    detector.start({x: 0, y: 0});
    expect(detector.moveTo({x: 10, y: 0})).toBe(true);
    expect(detector.moveTo({x: 11, y: 0})).toBe(false);
    detector.start({x: 0, y: 0}, {moveCancelPx: 13});
    expect(detector.moveTo({x: 13, y: 0})).toBe(true);
    vi.advanceTimersByTime(500);
    expect(onLongPress).toHaveBeenCalledTimes(1);
  });

  it('starts nothing while disabled, and reads the latest options at each start and fire', () => {
    const first = vi.fn();
    const latest = vi.fn();
    const detector = createLongPressDetector({
      onLongPress: first,
      disabled: true,
    });
    detector.start({x: 0, y: 0});
    expect(detector.isPending()).toBe(false);
    detector.setOptions({onLongPress: first, delayMs: 200});
    detector.start({x: 1, y: 1});
    detector.setOptions({onLongPress: latest, delayMs: 200});
    vi.advanceTimersByTime(200);
    expect(first).not.toHaveBeenCalled();
    expect(latest).toHaveBeenCalledWith({x: 1, y: 1});
  });

  it('waits the full delay for a touch that carries no time (a stamp of 0)', () => {
    const onLongPress = vi.fn();
    const detector = createLongPressDetector({onLongPress});
    detector.touchStart(touch(windowAt(10_000), 0, [{clientX: 0, clientY: 0}]));
    vi.advanceTimersByTime(499);
    expect(onLongPress).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onLongPress).toHaveBeenCalledTimes(1);
  });
});

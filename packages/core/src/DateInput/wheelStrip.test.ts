// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file wheelStrip.test.ts
 * @input Uses Vitest, a fake clock and the shared animator in jsdom
 * @output Proves the touch wheel's strip: a drag's frames and their ticks,
 *   a curve played to its end or stopped where it is shown, the row reported
 *   nearest the band, and Reduce Motion's cross-fade for a transition while
 *   momentum keeps its motion
 * @position Unit coverage for wheelStrip.ts; PickerWheel.test.tsx covers the
 *   wheel that drives it, and the browser specs the compositor
 */

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {createWheelStrip} from './wheelStrip';
import {spinCurve, type WheelCurve, type WheelLayout} from './wheelPhysics';

const haptics = vi.hoisted(() => ({
  canVibrate: vi.fn(() => true),
  playHaptic: vi.fn(),
}));
vi.mock('../gestures/haptics', () => haptics);

const ROW = 28;
const LAYOUT: WheelLayout = {rowHeight: ROW, rowCount: 60};

/** A linear motion from `from` to `to` over `seconds`. */
function line(from: number, to: number, seconds: number): WheelCurve {
  return {
    duration: seconds,
    to,
    value: t => from + ((to - from) * Math.min(t, seconds)) / seconds,
    velocity: t => (t < seconds ? (to - from) / seconds : 0),
  };
}

function translateY(element: HTMLElement): number {
  const [, y = '0'] = element.style
    .getPropertyValue('translate')
    .trim()
    .split(/\s+/);
  return Number.parseFloat(y) || 0;
}

let reducedMotion = false;

beforeEach(() => {
  vi.useFakeTimers({
    toFake: ['setTimeout', 'clearTimeout', 'performance', 'Date'],
  });
  reducedMotion = false;
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches:
      query === '(pointer: coarse)' ||
      (reducedMotion && query === '(prefers-reduced-motion: reduce)'),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
  haptics.playHaptic.mockClear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function setup() {
  const element = document.createElement('div');
  const strip = createWheelStrip(LAYOUT);
  strip.attach(element);
  const nearest: number[] = [];
  strip.onNearestChange(position => nearest.push(position));
  return {element, strip, nearest};
}

describe('createWheelStrip', () => {
  it('shows a drag frame at once on the strip, and reports the row nearest the band', () => {
    const {element, strip, nearest} = setup();
    strip.setOffset(3.4 * ROW);
    expect(translateY(element)).toBeCloseTo(-3.4 * ROW, 3);
    expect(strip.offset()).toBeCloseTo(3.4 * ROW, 3);
    expect(nearest).toEqual([3]);
    strip.setOffset(3.6 * ROW);
    expect(nearest).toEqual([3, 4]);
  });

  it('plays a curve to its end, then reports its row and that it arrived', () => {
    const {strip, nearest} = setup();
    const onEnd = vi.fn();
    strip.play(line(0, 5 * ROW, 0.5), {onEnd});
    expect(strip.isMoving()).toBe(true);
    expect(strip.target()).toBe(5 * ROW);
    vi.advanceTimersByTime(250);
    expect(strip.offset()).toBeCloseTo(2.5 * ROW, 0);
    // A motion reports nothing until it ends.
    expect(nearest).toEqual([]);
    vi.advanceTimersByTime(250);
    expect(onEnd).toHaveBeenCalledExactlyOnceWith('arrived', 5 * ROW);
    expect(strip.isMoving()).toBe(false);
    expect(nearest).toEqual([5]);
  });

  it('stops a motion where it was shown at the given time', () => {
    const {element, strip} = setup();
    const onEnd = vi.fn();
    strip.play(line(0, 10 * ROW, 1), {onEnd});
    vi.advanceTimersByTime(400);
    const touchedAt = performance.now() - 100;
    const stopped = strip.stop(touchedAt);
    expect(stopped).toBeCloseTo(3 * ROW, 0);
    expect(onEnd).toHaveBeenCalledExactlyOnceWith('stopped', stopped);
    expect(translateY(element)).toBeCloseTo(-stopped, 3);
    vi.advanceTimersByTime(1000);
    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(strip.offset()).toBeCloseTo(stopped, 3);
  });

  it('ends a motion as stopped when a drag frame takes the strip', () => {
    const {strip} = setup();
    const onEnd = vi.fn();
    strip.play(line(0, 10 * ROW, 1), {onEnd});
    vi.advanceTimersByTime(100);
    strip.setOffset(2 * ROW, {ticks: true});
    expect(onEnd).toHaveBeenCalledWith('stopped', expect.any(Number));
    expect(strip.isMoving()).toBe(false);
  });

  it('ticks each row a drag frame brings to the band', () => {
    const {strip} = setup();
    strip.resetDrag();
    strip.setOffset(0, {ticks: true});
    strip.setOffset(0.4 * ROW, {ticks: true});
    expect(haptics.playHaptic).not.toHaveBeenCalled();
    vi.advanceTimersByTime(50);
    strip.setOffset(1.1 * ROW, {ticks: true});
    expect(haptics.playHaptic).toHaveBeenCalledExactlyOnceWith('selection');
  });

  it('ticks the rows a released curve passes, at most one per 40 ms, and none for a spin', () => {
    const {strip} = setup();
    // 20 rows in 0.5 s: a row every 25 ms, faster than the tick allows.
    strip.play(line(0, 20 * ROW, 0.5), {ticks: true, momentum: true});
    vi.advanceTimersByTime(600);
    const ticks = haptics.playHaptic.mock.calls.length;
    expect(ticks).toBeGreaterThan(5);
    expect(ticks).toBeLessThanOrEqual(13);
    haptics.playHaptic.mockClear();
    strip.play(spinCurve(20 * ROW, 23 * ROW, 0.3, [0.42, 0, 0.58, 1]));
    vi.advanceTimersByTime(400);
    expect(haptics.playHaptic).not.toHaveBeenCalled();
  });

  it('lands a zero-length curve at once', () => {
    const {element, strip} = setup();
    const onEnd = vi.fn();
    strip.play(line(0, 7 * ROW, 0), {onEnd});
    expect(onEnd).toHaveBeenCalledExactlyOnceWith('arrived', 7 * ROW);
    expect(translateY(element)).toBeCloseTo(-7 * ROW, 3);
  });

  it('under Reduce Motion, cross-fades a transition and keeps a throw’s momentum', async () => {
    reducedMotion = true;
    const {strip, nearest} = setup();
    const onEnd = vi.fn();
    // A tap's turn: the animator's cross-fade, which lands at its midpoint.
    strip.play(line(0, 4 * ROW, 0.3), {onEnd, ticks: true});
    await vi.advanceTimersByTimeAsync(100);
    expect(nearest).toEqual([4]);
    expect(onEnd).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(100);
    expect(onEnd).toHaveBeenCalledExactlyOnceWith('arrived', 4 * ROW);
    expect(haptics.playHaptic).not.toHaveBeenCalled();
    // A coast plays as is, for its whole length.
    const coastEnd = vi.fn();
    strip.play(line(4 * ROW, 24 * ROW, 0.8), {
      onEnd: coastEnd,
      momentum: true,
      touchRelease: true,
    });
    await vi.advanceTimersByTimeAsync(400);
    expect(coastEnd).not.toHaveBeenCalled();
    expect(strip.offset()).toBeCloseTo(14 * ROW, 0);
    await vi.advanceTimersByTimeAsync(400);
    expect(coastEnd).toHaveBeenCalledExactlyOnceWith('arrived', 24 * ROW);
  });

  it('ends a motion still running as stopped when it is disposed', () => {
    const {strip} = setup();
    const onEnd = vi.fn();
    strip.play(line(0, 10 * ROW, 1), {onEnd});
    vi.advanceTimersByTime(300);
    strip.dispose();
    expect(onEnd).toHaveBeenCalledExactlyOnceWith(
      'stopped',
      expect.any(Number),
    );
  });
});

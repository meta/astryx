// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file rideKeyboard.test.ts
 * @input vitest, rideKeyboard, a stand-in animator
 * @output Tests that a ride plays its transition's curve from the
 *   transition's start, Gboard's slide or Safari on iOS's springs, and asks
 *   for an entrance. In Safari on iOS a surface rides the inset's edge. A jump
 *   or an ended slide lands at once.
 * @position Unit tests for keyboard/rideKeyboard.ts
 */

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import type {Animator} from '../motion/animator';
import {keyboard as androidKeyboard} from '../motion/android';
import {KEYBOARD_SPRING} from '../motion/uikit/springs';
import {timing as uikitTiming} from '../motion/uikit/timing';
import {isElement} from '../utils/nodeType';
import {mayKeepKeyboard} from './keyboardTarget';
import {createUIKitKeyboardSchedule} from './uikitKeyboardSchedule';

const uikitKeyboardSchedule = createUIKitKeyboardSchedule({
  notificationMs: uikitTiming.keyboardNotificationMs,
  mayKeepKeyboard,
  isElement,
});
import type {KeyboardTransition} from './keyboardModel';
import {rideKeyboard} from './rideKeyboard';

function standInAnimator() {
  const handle = {finished: Promise.resolve(true)};
  return {
    animate: vi.fn(() => handle),
    play: vi.fn(() => handle),
    set: vi.fn(),
    get: vi.fn(() => 0),
  };
}

const transition = (
  overrides: Partial<KeyboardTransition>,
): KeyboardTransition => ({
  kind: 'show',
  from: 0,
  to: 300,
  start: 1000,
  velocity: 0,
  animated: true,
  predicted: false,
  curve: null,
  ...overrides,
});

describe('rideKeyboard', () => {
  // The transitions start at 1000 ms, and a ride called after its slide has
  // ended lands at once. So the clock reads the slide's start unless a case
  // sets it.
  beforeEach(() => {
    vi.spyOn(performance, 'now').mockReturnValue(1000);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('plays the eased slide the transition publishes where it has one', () => {
    const animator = standInAnimator();

    rideKeyboard(
      animator as unknown as Animator,
      {y: -300},
      transition({
        curve: {
          durationMs: androidKeyboard.showMs,
          points: androidKeyboard.showCurve,
        },
      }),
    );

    expect(animator.animate).not.toHaveBeenCalled();
    expect(animator.play).toHaveBeenCalledTimes(1);
    const [curves, options] = animator.play.mock.calls[0] as unknown as [
      Record<string, {duration: number; at: (t: number) => number}>,
      {at: number},
    ];
    expect(options).toEqual({at: 1000});
    expect(curves.y.duration).toBeCloseTo(androidKeyboard.showMs / 1000, 9);
    expect(curves.y.at(curves.y.duration)).toBe(-300);
  });

  it('plays UIKit’s keyboard spring where the transition publishes it, landing at the notification’s duration (iOS)', () => {
    const animator = standInAnimator();

    rideKeyboard(
      animator as unknown as Animator,
      {y: -336},
      transition({
        to: 336,
        curve: uikitKeyboardSchedule.curve,
      }),
    );

    expect(animator.play).toHaveBeenCalledTimes(1);
    const [curves, options] = animator.play.mock.calls[0] as unknown as [
      Record<string, {duration: number; at: (t: number) => number}>,
      {at: number},
    ];
    expect(options).toEqual({at: 1000});
    const span = uikitTiming.keyboardNotificationMs / 1000;
    expect(curves.y.duration).toBeCloseTo(span, 9);
    // Critically damped: 1 − (1 + ω₀t)·e^(−ω₀t) of the way at t.
    const omega = Math.sqrt(KEYBOARD_SPRING.stiffness / KEYBOARD_SPRING.mass);
    const along = (s: number) => 1 - (1 + omega * s) * Math.exp(-omega * s);
    expect(curves.y.at(0.1)).toBeCloseTo(-336 * along(0.1), 6);
    expect(curves.y.at(span)).toBe(-336);
  });

  it('rides the inset’s edge on a show in Safari on iOS: a surface that travels less than the keyboard waits for the edge, then rides with it', () => {
    const animator = standInAnimator();
    const show = uikitKeyboardSchedule.showCurve;
    expect(show).toBeDefined();

    rideKeyboard(
      animator as unknown as Animator,
      {y: -100},
      transition({to: 336, curve: show ?? null}),
    );

    expect(animator.play).toHaveBeenCalledTimes(1);
    const [curves] = animator.play.mock.calls[0] as unknown as [
      Record<string, {duration: number; at: (t: number) => number}>,
    ];
    const edge = (t: number) => 336 * (show?.progress(t) ?? 0);
    // The surface rests 236 px above the keyboard's start, so it holds still
    // until the inset's edge has risen that far.
    for (const t of [0.01, 0.03, 0.05]) {
      expect(edge(t)).toBeLessThan(236);
      expect(curves.y.at(t)).toBe(0);
    }
    // Then the edge pushes it.
    const t = 0.12;
    expect(edge(t)).toBeGreaterThan(236);
    expect(curves.y.at(t)).toBeCloseTo(-(edge(t) - 236), 6);
    expect(curves.y.at(curves.y.duration)).toBe(-100);
  });

  it('lets a surface down only its own travel on a hide in Safari on iOS, so it comes to rest before the keyboard is down', () => {
    const animator = standInAnimator();
    animator.get.mockReturnValue(-100);

    rideKeyboard(
      animator as unknown as Animator,
      {y: 0},
      transition({
        kind: 'hide',
        from: 336,
        to: 0,
        predicted: true,
        curve: uikitKeyboardSchedule.curve,
      }),
    );

    const [curves] = animator.play.mock.calls[0] as unknown as [
      Record<string, {duration: number; at: (t: number) => number}>,
    ];
    const fallen = (t: number) => 336 * uikitKeyboardSchedule.curve.progress(t);
    const t = 0.03;
    expect(fallen(t)).toBeLessThan(100);
    expect(curves.y.at(t)).toBeCloseTo(-100 + fallen(t), 6);
    // At rest once the edge has fallen the surface's 100 px.
    const rest = 0.09;
    expect(fallen(rest)).toBeGreaterThan(100);
    expect(curves.y.at(rest)).toBe(0);
  });

  it('moves a surface over its own travel along Gboard’s slide, as Chrome on Android rides', () => {
    const animator = standInAnimator();

    rideKeyboard(
      animator as unknown as Animator,
      {y: -100},
      transition({
        to: 336,
        curve: {
          durationMs: androidKeyboard.showMs,
          points: androidKeyboard.showCurve,
        },
      }),
    );

    const [curves] = animator.play.mock.calls[0] as unknown as [
      Record<string, {duration: number; at: (t: number) => number}>,
    ];
    // From the slide's first moment, a part of its travel.
    expect(curves.y.at(0.03)).toBeLessThan(0);
    expect(curves.y.at(curves.y.duration)).toBe(-100);
  });

  it("plays the transition's own curve, even a show published with the hide slide", () => {
    const animator = standInAnimator();

    rideKeyboard(
      animator as unknown as Animator,
      {y: -300},
      transition({
        kind: 'show',
        curve: {
          durationMs: androidKeyboard.hideMs,
          points: androidKeyboard.hideCurve,
        },
      }),
    );

    const [curves] = animator.play.mock.calls[0] as unknown as [
      Record<string, {duration: number; at: (t: number) => number}>,
    ];
    expect(curves.y.duration).toBeCloseTo(androidKeyboard.hideMs / 1000, 9);
  });

  it('lands at once when the slide has ended by the call, as a page busy through the slide reads its report', () => {
    const animator = standInAnimator();
    vi.spyOn(performance, 'now').mockReturnValue(
      1000 + androidKeyboard.showMs + 50,
    );

    const handle = rideKeyboard(
      animator as unknown as Animator,
      {y: 0},
      transition({
        curve: {
          durationMs: androidKeyboard.showMs,
          points: androidKeyboard.showCurve,
        },
      }),
    );

    expect(handle).toBeNull();
    expect(animator.play).not.toHaveBeenCalled();
    expect(animator.set).toHaveBeenCalledWith({y: 0});
  });

  it('asks the animator for its entrance under Reduce Motion where the ride is an entrance', () => {
    const animator = standInAnimator();
    const slide = transition({
      curve: {
        durationMs: androidKeyboard.showMs,
        points: androidKeyboard.showCurve,
      },
    });

    rideKeyboard(animator as unknown as Animator, {y: 0}, slide, {
      entrance: true,
    });
    rideKeyboard(animator as unknown as Animator, {y: 0}, slide);

    const calls = animator.play.mock.calls as unknown as [
      unknown,
      Record<string, unknown>,
    ][];
    expect(calls[0][1]).toEqual({at: 1000, crossfadeAs: 'entrance'});
    expect(calls[1][1]).toEqual({at: 1000});
  });

  it('starts no later than the document timeline, as Safari can date the report after its frame', () => {
    const slide = transition({curve: uikitKeyboardSchedule.curve});
    try {
      Object.defineProperty(document, 'timeline', {
        configurable: true,
        value: {currentTime: 999},
      });
      const late = standInAnimator();
      rideKeyboard(late as unknown as Animator, {y: -336}, slide);
      const lateCalls = late.play.mock.calls as unknown as [
        unknown,
        Record<string, unknown>,
      ][];
      expect(lateCalls[0]?.[1]).toEqual({at: 999});
      expect(late.get).toHaveBeenCalledWith('y', 999);
      // A report dated at or before its frame keeps its own start.
      Object.defineProperty(document, 'timeline', {
        configurable: true,
        value: {currentTime: 1000},
      });
      const onTime = standInAnimator();
      rideKeyboard(onTime as unknown as Animator, {y: -336}, slide);
      const onTimeCalls = onTime.play.mock.calls as unknown as [
        unknown,
        Record<string, unknown>,
      ][];
      expect(onTimeCalls[0]?.[1]).toEqual({at: 1000});
    } finally {
      Reflect.deleteProperty(document, 'timeline');
    }
  });

  it('holds the element still until the report when the ride starts at an earlier frame', () => {
    const slide = transition({curve: uikitKeyboardSchedule.showCurve});
    type Played = [
      Record<string, {duration: number; at: (t: number) => number}>,
      unknown,
    ];
    try {
      // The report is dated 13 ms after the frame that dispatches it.
      Object.defineProperty(document, 'timeline', {
        configurable: true,
        value: {currentTime: 987},
      });
      const early = standInAnimator();
      rideKeyboard(early as unknown as Animator, {y: -300}, slide);
      Object.defineProperty(document, 'timeline', {
        configurable: true,
        value: {currentTime: 1000},
      });
      const onTime = standInAnimator();
      rideKeyboard(onTime as unknown as Animator, {y: -300}, slide);
      const [earlyCurves, earlyOptions] = early.play.mock
        .calls[0] as unknown as Played;
      const [onTimeCurves] = onTime.play.mock.calls[0] as unknown as Played;
      // The ride still starts at the frame, so a long task cannot hold it.
      expect(earlyOptions).toEqual({at: 987});
      // Until the report the element stays where it is.
      expect(earlyCurves.y.at(0.012)).toBeCloseTo(0, 6);
      // From the report it moves as a ride that starts there.
      for (const t of [0.02, 0.1, 0.2]) {
        expect(earlyCurves.y.at(0.013 + t)).toBeCloseTo(
          onTimeCurves.y.at(t),
          6,
        );
      }
      expect(earlyCurves.y.duration).toBeCloseTo(
        onTimeCurves.y.duration + 0.013,
        6,
      );
    } finally {
      Reflect.deleteProperty(document, 'timeline');
    }
  });

  it('keeps the start of a predicted hide after a blur, which starts ahead of the frame on purpose', () => {
    const hide = transition({
      kind: 'hide',
      from: 300,
      to: 0,
      curve: uikitKeyboardSchedule.curve,
      predicted: true,
    });
    try {
      Object.defineProperty(document, 'timeline', {
        configurable: true,
        value: {currentTime: 980},
      });
      const animator = standInAnimator();
      rideKeyboard(animator as unknown as Animator, {y: 0}, hide);
      const calls = animator.play.mock.calls as unknown as [
        unknown,
        Record<string, unknown>,
      ][];
      expect(calls[0]?.[1]).toEqual({at: 1000});
      expect(animator.get).toHaveBeenCalledWith('y', 1000);
    } finally {
      Reflect.deleteProperty(document, 'timeline');
    }
  });

  it('lands at once when the keyboard jumps', () => {
    const animator = standInAnimator();

    expect(
      rideKeyboard(
        animator as unknown as Animator,
        {y: -300},
        transition({animated: false}),
      ),
    ).toBeNull();
    expect(animator.set).toHaveBeenCalledWith({y: -300});
    expect(animator.animate).not.toHaveBeenCalled();
  });
});

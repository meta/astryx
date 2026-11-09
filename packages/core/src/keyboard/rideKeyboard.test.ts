// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file rideKeyboard.test.ts
 * @input vitest, rideKeyboard, a stand-in animator
 * @output Tests that a ride plays its transition's curve from the
 *   transition's start and asks for an entrance. A jump or an ended slide
 *   lands at once.
 * @position Unit tests for keyboard/rideKeyboard.ts
 */

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import type {Animator} from '../motion/animator';
import {keyboard as androidKeyboard} from '../motion/android';
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

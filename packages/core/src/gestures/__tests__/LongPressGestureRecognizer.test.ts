// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file LongPressGestureRecognizer.test.ts
 * @input Synthetic touches with explicit timestamps through a GestureArena
 * @output LongPressGestureRecognizer's state machine: the press duration on the event clock, the movement tolerance as a distance, a lift before the duration, taps before the press, and a zero duration beginning on the touch
 * @position Unit tests of packages/core/src/gestures/LongPressGestureRecognizer.ts
 */

import {describe, expect, it} from 'vitest';
import {UIKIT_GESTURES} from '../../motion/uikit/gestures';
import {LongPressGestureRecognizer} from '../LongPressGestureRecognizer';
import {createHarness} from './harness';

describe('LongPressGestureRecognizer', () => {
  it('begins at exactly touch-down + 500 ms even when the next input is late', () => {
    const h = createHarness();
    const press = new LongPressGestureRecognizer({name: 'press'});
    h.finger(1).down(50, 50, 1000, {recognizers: [press]});
    // The main thread was blocked: the next thing processed is a move at
    // t = 1900. The press began at 1500, before that move.
    h.finger(1).move(80, 50, 1900);
    expect(press.beganAt).toBe(1500);
    expect(h.log).toEqual(['press:began@1500', 'press:changed@1900']);
    h.finger(1).up(2000);
    expect(h.log.slice(2)).toEqual(['press:ended@2000', 'press:possible@2000']);
  });

  it('uses UIKit defaults and allows unlimited movement after it began', () => {
    const press = new LongPressGestureRecognizer();
    expect(press.minimumPressDuration).toBe(500);
    expect(press.allowableMovement).toBe(10);
    const h = createHarness();
    h.finger(1).down(0, 0, 0, {recognizers: [press]});
    h.advance(500);
    expect(press.state).toBe('began');
    h.finger(1).move(300, 300, 600);
    expect(press.state).toBe('changed');
    expect(press.location()).toEqual({x: 300, y: 300});
  });

  it('measures the movement tolerance as a distance, not per axis', () => {
    const inside = createHarness();
    const a = new LongPressGestureRecognizer({name: 'a'});
    inside
      .finger(1)
      .down(0, 0, 0, {recognizers: [a]})
      .move(7, 7, 100);
    expect(a.state).toBe('possible');
    const outside = createHarness();
    const b = new LongPressGestureRecognizer({name: 'b'});
    outside
      .finger(1)
      .down(0, 0, 0, {recognizers: [b]})
      .move(7.2, 7.2, 100);
    expect(b.state).toBe('failed');
  });

  it('fails on a lift before the duration', () => {
    const h = createHarness();
    const press = new LongPressGestureRecognizer({name: 'press'});
    h.finger(1).down(0, 0, 0, {recognizers: [press]});
    h.finger(1).up(499);
    expect(h.log).toEqual(['press:failed@499', 'press:possible@499']);
    h.advance(600);
    expect(h.log).toHaveLength(2);
  });

  it('begins on the touch itself with a zero duration, and claims it', () => {
    const h = createHarness();
    const press = new LongPressGestureRecognizer({
      name: 'press',
      minimumPressDuration: 0,
      allowableMovement: Number.POSITIVE_INFINITY,
    });
    // Synchronously, in the touch-down delivery: no timer to wait for.
    h.finger(1).down(10, 10, 40, {recognizers: [press]});
    expect(press.state).toBe('began');
    expect(press.beganAt).toBe(40);
    expect(h.log).toEqual(['press:began@40']);
    expect(h.claims).toEqual([1]);
    // The finger slides across the group: changed, then ended at the lift.
    h.finger(1).move(10, 120, 80);
    expect(press.location()).toEqual({x: 10, y: 120});
    h.finger(1).up(120);
    expect(h.log.slice(1)).toEqual([
      'press:changed@80',
      'press:ended@120',
      'press:possible@120',
    ]);
  });

  it('supports a tap before the press (numberOfTapsRequired)', () => {
    const h = createHarness();
    const press = new LongPressGestureRecognizer({
      name: 'press',
      numberOfTapsRequired: 1,
    });
    h.finger(1).down(0, 0, 0, {recognizers: [press]});
    h.finger(1).up(80);
    h.finger(2).down(2, 0, 200, {recognizers: [press]});
    h.advance(700);
    expect(press.state).toBe('began');
  });

  it('counts only quick taps with the required fingers in the taps phase', () => {
    const tapLimit = UIKIT_GESTURES.tap.maximumTapDuration.value;
    // A first touch held past a tap's limit is no tap.
    const held = createHarness();
    const slow = new LongPressGestureRecognizer({
      name: 'slow',
      numberOfTapsRequired: 1,
    });
    held.finger(1).down(0, 0, 0, {recognizers: [slow]});
    held.finger(1).up(tapLimit + 100);
    expect(held.log).toContain(`slow:failed@${tapLimit + 100}`);
    // With two fingers required, a one-finger tap is no tap.
    const fingers = createHarness();
    const two = new LongPressGestureRecognizer({
      name: 'two',
      numberOfTapsRequired: 1,
      numberOfTouchesRequired: 2,
    });
    fingers.finger(1).down(0, 0, 0, {recognizers: [two]});
    fingers.finger(1).up(80);
    expect(fingers.log).toContain('two:failed@80');
  });

  it('keeps a begun press through a second finger, and ends it at the first finger’s lift (FR10)', () => {
    const h = createHarness();
    const press = new LongPressGestureRecognizer({name: 'press'});
    h.finger(1).down(0, 0, 0, {recognizers: [press]});
    h.advance(600);
    expect(press.state).toBe('began');
    h.finger(2).down(80, 0, 700, {recognizers: [press]});
    expect(press.state).toBe('began');
    expect(press.numberOfTouches).toBe(1);
    h.finger(1).up(800);
    expect(h.log).toContain('press:ended@800');
  });
});

// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file SwipeGestureRecognizer.test.ts
 * @input Synthetic touches with explicit timestamps through a GestureArena
 * @output SwipeGestureRecognizer's state machine: recognition during the motion, and failure when too slow, off-axis or the wrong way
 * @position Unit tests of packages/core/src/gestures/SwipeGestureRecognizer.ts
 */

import {describe, expect, it} from 'vitest';
import {SwipeGestureRecognizer} from '../SwipeGestureRecognizer';
import {createHarness} from './harness';

describe('SwipeGestureRecognizer', () => {
  it('is recognized during the motion, once the distance is covered', () => {
    const h = createHarness();
    const swipe = new SwipeGestureRecognizer({name: 'swipe'});
    const finger = h.finger(1).down(0, 0, 0, {recognizers: [swipe]});
    finger.move(30, 2, 30);
    expect(swipe.state).toBe('possible');
    finger.move(50, 4, 50);
    expect(swipe.recognizedDirection).toBe('right');
    expect(h.log[0]).toBe('swipe:ended@50');
  });

  it('fails when too slow, off-axis, or the wrong way', () => {
    const slow = createHarness();
    const a = new SwipeGestureRecognizer({name: 'a'});
    slow
      .finger(1)
      .down(0, 0, 0, {recognizers: [a]})
      .move(30, 0, 400);
    slow.advance(500);
    expect(a.state).toBe('failed');

    const diagonal = createHarness();
    const b = new SwipeGestureRecognizer({name: 'b'});
    diagonal
      .finger(1)
      .down(0, 0, 0, {recognizers: [b]})
      .move(45, 40, 60);
    expect(b.state).toBe('failed');

    const wrong = createHarness();
    const c = new SwipeGestureRecognizer({name: 'c', direction: 'left'});
    wrong
      .finger(1)
      .down(100, 0, 0, {recognizers: [c]})
      .move(160, 0, 60);
    expect(c.state).toBe('failed');
  });

  it('takes several directions and fingers', () => {
    const h = createHarness();
    const swipe = new SwipeGestureRecognizer({
      name: 'swipe',
      direction: ['up', 'down'],
      numberOfTouchesRequired: 2,
    });
    h.finger(1).down(0, 200, 0, {recognizers: [swipe]});
    h.finger(2).down(40, 200, 5, {recognizers: [swipe]});
    h.finger(1).move(0, 140, 50);
    h.finger(2).move(40, 140, 50);
    expect(swipe.recognizedDirection).toBe('up');
  });
});

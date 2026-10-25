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
      .move(45, 55, 60);
    // 55 px across is past the 50 px secondary allowance.
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

  it('gives the same verdict for the same path however its events are spaced', () => {
    // A straight drag to (55, 40): along 55 past the 50 px distance, 40 px
    // across within the 50 px allowance.
    const sparse = createHarness();
    const a = new SwipeGestureRecognizer({name: 'a'});
    sparse
      .finger(1)
      .down(0, 0, 0, {recognizers: [a]})
      .move(55, 40, 40);
    expect(a.state).toBe('ended');

    const dense = createHarness();
    const b = new SwipeGestureRecognizer({name: 'b'});
    const finger = dense.finger(1).down(0, 0, 0, {recognizers: [b]});
    for (let step = 1; step <= 10; step += 1) {
      finger.move(5.5 * step, 4 * step, 4 * step);
    }
    expect(b.state).toBe('ended');
    expect(b.recognizedDirection).toBe('right');
  });

  it('recognizes a 40\u00b0 swipe at 16 px per event as at small steps', () => {
    // At 40\u00b0 the travel along reaches 50 px with 42 px across, inside
    // the 50 px allowance; at 16 px per event the next event is already 51 px
    // across, so the verdict must come from the path between the events.
    const angle = (40 * Math.PI) / 180;
    for (const step of [2, 16]) {
      const h = createHarness();
      const swipe = new SwipeGestureRecognizer({name: 'swipe'});
      const finger = h.finger(1).down(0, 0, 0, {recognizers: [swipe]});
      for (let d = step, t = 4; d <= 96; d += step, t += 4) {
        finger.move(d * Math.cos(angle), d * Math.sin(angle), t);
        if (swipe.state !== 'possible') {
          break;
        }
      }
      expect(swipe.state).toBe('ended');
      expect(swipe.recognizedDirection).toBe('right');
    }
  });
});

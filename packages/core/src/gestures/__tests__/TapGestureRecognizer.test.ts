// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file TapGestureRecognizer.test.ts
 * @input Synthetic touches with explicit timestamps through a GestureArena
 * @output TapGestureRecognizer's state machine: single and multiple taps with one or more fingers: recognition at the lift, the movement, interval, separation and hold limits
 * @position Unit tests of packages/core/src/gestures/TapGestureRecognizer.ts
 */

import {describe, expect, it} from 'vitest';
import {UIKIT_GESTURES} from '../../motion/uikit/gestures';
import {TapGestureRecognizer} from '../TapGestureRecognizer';
import {createHarness} from './harness';

describe('TapGestureRecognizer', () => {
  it('recognizes a single tap at the lift', () => {
    const h = createHarness();
    const tap = new TapGestureRecognizer({name: 'tap'});
    const actions: string[] = [];
    tap.addListener(r => actions.push(`${r.state}@${h.arena.now()}`));
    h.finger(1)
      .down(100, 100, 0, {recognizers: [tap]})
      .move(103, 101, 40);
    expect(tap.state).toBe('possible');
    h.finger(1).up(80, 103, 101);
    expect(actions).toEqual(['ended@80']);
    expect(h.log).toEqual(['tap:ended@80', 'tap:possible@80']);
    expect(tap.location()).toEqual({x: 103, y: 101});
  });

  it('fails once a finger travels past the allowable movement', () => {
    const h = createHarness();
    const tap = new TapGestureRecognizer({name: 'tap'});
    const allowed = UIKIT_GESTURES.tap.allowableMovement.value;
    h.finger(1)
      .down(0, 0, 0, {recognizers: [tap]})
      .move(allowed, 0, 16);
    expect(tap.state).toBe('possible');
    h.finger(1).move(allowed + 0.5, 0, 32);
    expect(tap.state).toBe('failed');
    h.finger(1).up(48);
    expect(h.log).toEqual(['tap:failed@32', 'tap:possible@48']);
  });

  it('fails when more fingers land than required, and taps with two', () => {
    const h = createHarness();
    const one = new TapGestureRecognizer({name: 'one'});
    const two = new TapGestureRecognizer({
      name: 'two',
      numberOfTouchesRequired: 2,
    });
    h.finger(1).down(0, 0, 0, {recognizers: [one, two]});
    h.finger(2).down(40, 0, 20, {recognizers: [one, two]});
    expect(one.state).toBe('failed');
    h.finger(1).up(60);
    expect(two.state).toBe('possible');
    h.finger(2).up(70);
    expect(h.log).toEqual([
      'one:failed@20',
      'two:ended@70',
      'one:possible@70',
      'two:possible@70',
    ]);
  });

  it('recognizes a double tap inside the interval and fails outside it', () => {
    const interval = UIKIT_GESTURES.tap.maximumIntervalBetweenTaps.value;
    const h = createHarness();
    const double = new TapGestureRecognizer({
      name: 'double',
      numberOfTapsRequired: 2,
    });
    h.finger(1).down(0, 0, 0, {recognizers: [double]});
    h.finger(1).up(60);
    expect(double.state).toBe('possible');
    expect(double.completedTaps).toBe(1);
    h.finger(2).down(4, 2, 60 + interval - 1, {recognizers: [double]});
    h.finger(2).up(60 + interval + 50);
    expect(h.log).toEqual([
      `double:ended@${60 + interval + 50}`,
      `double:possible@${60 + interval + 50}`,
    ]);

    const late = createHarness();
    const slow = new TapGestureRecognizer({
      name: 'slow',
      numberOfTapsRequired: 2,
    });
    late.finger(1).down(0, 0, 0, {recognizers: [slow]});
    late.finger(1).up(60);
    late.finger(2).down(0, 0, 60 + interval + 1, {recognizers: [slow]});
    // The interval timer fired at its own deadline, before the late touch.
    expect(late.log[0]).toBe(`slow:failed@${60 + interval}`);
  });

  it('fails a second tap that lands too far from the first', () => {
    const h = createHarness();
    const double = new TapGestureRecognizer({
      name: 'double',
      numberOfTapsRequired: 2,
    });
    const separation = UIKIT_GESTURES.tap.allowableSeparation.value;
    h.finger(1).down(0, 0, 0, {recognizers: [double]});
    h.finger(1).up(50);
    h.finger(2).down(separation + 1, 0, 100, {recognizers: [double]});
    expect(double.state).toBe('failed');
  });

  it('recognizes a two-finger double tap, placing each tap at its fingers’ centroid', () => {
    const separation = UIKIT_GESTURES.tap.allowableSeparation.value;
    const make = () => {
      const h = createHarness();
      const tap = new TapGestureRecognizer({
        name: 'two',
        numberOfTapsRequired: 2,
        numberOfTouchesRequired: 2,
      });
      // First tap: fingers 80 px apart, the right one lifting last.
      h.finger(1).down(0, 0, 0, {recognizers: [tap]});
      h.finger(2).down(80, 0, 10, {recognizers: [tap]});
      h.finger(1).up(50);
      h.finger(2).up(60);
      expect(tap.completedTaps).toBe(1);
      return {h, tap};
    };
    // The same two fingers again, a few px off: one double tap, though the
    // first finger lands 78 px from where the last one lifted.
    const near = make();
    near.h.finger(3).down(2, 1, 150, {recognizers: [near.tap]});
    near.h.finger(4).down(82, 1, 160, {recognizers: [near.tap]});
    near.h.finger(3).up(200);
    near.h.finger(4).up(210);
    expect(near.h.log).toEqual(['two:ended@210', 'two:possible@210']);
    // A second tap whose centroid lands too far from the first's fails.
    const far = make();
    far.h.finger(3).down(separation + 1, 0, 150, {recognizers: [far.tap]});
    expect(far.tap.state).toBe('possible');
    far.h.finger(4).down(separation + 81, 0, 160, {recognizers: [far.tap]});
    expect(far.tap.state).toBe('failed');
  });

  it('fails a hold past a finite maximum tap duration', () => {
    const h = createHarness();
    const tap = new TapGestureRecognizer({
      name: 'tap',
      maximumTapDuration: 400,
    });
    h.finger(1).down(0, 0, 0, {recognizers: [tap]});
    h.advance(399);
    expect(tap.state).toBe('possible');
    h.advance(400);
    expect(tap.state).toBe('failed');
  });
});

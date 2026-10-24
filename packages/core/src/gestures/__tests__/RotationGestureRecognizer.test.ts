// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file RotationGestureRecognizer.test.ts
 * @input Synthetic touches with explicit timestamps through a GestureArena
 * @output RotationGestureRecognizer's state machine: the hysteresis and unwrapping past half a turn
 * @position Unit tests of packages/core/src/gestures/RotationGestureRecognizer.ts
 */

import {describe, expect, it} from 'vitest';
import {RotationGestureRecognizer} from '../RotationGestureRecognizer';
import {createHarness} from './harness';

describe('RotationGestureRecognizer', () => {
  it('begins after the hysteresis and unwraps past half a turn', () => {
    const h = createHarness();
    const rotation = new RotationGestureRecognizer({name: 'rotation'});
    h.finger(1).down(0, 0, 0, {recognizers: [rotation]});
    h.finger(2).down(100, 0, 0, {recognizers: [rotation]});
    const at = (angle: number, time: number) =>
      h.finger(2).move(100 * Math.cos(angle), 100 * Math.sin(angle), time);
    at((3 * Math.PI) / 180, 16);
    expect(rotation.state).toBe('possible');
    at((6 * Math.PI) / 180, 32);
    expect(rotation.state).toBe('began');
    let time = 32;
    for (let degrees = 30; degrees <= 270; degrees += 30) {
      time += 16;
      at((degrees * Math.PI) / 180, time);
    }
    expect(rotation.rotation).toBeCloseTo((270 * Math.PI) / 180, 5);
    expect(rotation.velocity).toBeGreaterThan(0);
  });
});

// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file PinchGestureRecognizer.test.ts
 * @input Synthetic touches with explicit timestamps through a GestureArena
 * @output PinchGestureRecognizer's state machine: the hysteresis, the scale against the moved starting span, the velocity, extra fingers, re-basing
 * @position Unit tests of packages/core/src/gestures/PinchGestureRecognizer.ts
 */

import {describe, expect, it} from 'vitest';
import {PinchGestureRecognizer} from '../PinchGestureRecognizer';
import {createHarness} from './harness';

describe('PinchGestureRecognizer', () => {
  it('begins after the hysteresis and reports scale and velocity', () => {
    const h = createHarness();
    const pinch = new PinchGestureRecognizer({name: 'pinch'});
    h.finger(1).down(100, 100, 0, {recognizers: [pinch]});
    h.finger(2).down(200, 100, 0, {recognizers: [pinch]});
    h.finger(2).move(205, 100, 16);
    expect(pinch.state).toBe('possible');
    h.finger(2).move(210, 100, 32);
    expect(pinch.state).toBe('began');
    // UIKit: against the starting span moved by the hysteresis (100 + 8).
    expect(pinch.scale).toBeCloseTo(110 / 108, 5);
    for (let t = 48; t <= 160; t += 16) {
      h.finger(2).move(210 + (t - 32) * 0.1, 100, t);
    }
    // 0.1 px/ms over 108 px.
    expect(pinch.velocity).toBeCloseTo(100 / 108, 5);
    h.finger(1).up(170);
    expect(h.log).toContain('pinch:ended@170');
  });

  it('ignores a third finger and can be re-based', () => {
    const h = createHarness();
    const pinch = new PinchGestureRecognizer({name: 'pinch'});
    h.finger(1).down(0, 0, 0, {recognizers: [pinch]});
    h.finger(2).down(100, 0, 0, {recognizers: [pinch]});
    h.finger(3).down(50, 50, 5, {recognizers: [pinch]});
    expect(pinch.numberOfTouches).toBe(2);
    h.finger(2).move(150, 0, 16);
    pinch.scale = 1;
    h.finger(2).move(300, 0, 32);
    expect(pinch.scale).toBeCloseTo(2, 5);
  });

  it('lets the velocity settle when the span holds while the fingers move', () => {
    const h = createHarness();
    const pinch = new PinchGestureRecognizer({name: 'pinch'});
    h.finger(1).down(100, 100, 0, {recognizers: [pinch]});
    h.finger(2).down(200, 100, 0, {recognizers: [pinch]});
    let time = 0;
    for (let x = 210; x <= 260; x += 10) {
      time += 16;
      h.finger(2).move(x, 100, time);
    }
    const spreading = pinch.velocity;
    expect(spreading).toBeGreaterThan(0);
    // The second finger circles the first at exactly the same distance (160:
    // 3-4-5 triangles), so the span holds while it moves.
    for (const [dx, dy] of [
      [128, 96],
      [96, 128],
      [0, 160],
      [-96, 128],
      [-128, 96],
    ]) {
      time += 16;
      h.finger(2).move(100 + dx, 100 + dy, time);
    }
    expect(Math.abs(pinch.velocity)).toBeLessThan(spreading * 0.25);
  });
});

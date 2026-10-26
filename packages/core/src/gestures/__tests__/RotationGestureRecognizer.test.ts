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

  it('keeps its velocity continuous when the rotation is re-based mid-turn', () => {
    const h = createHarness();
    const rotation = new RotationGestureRecognizer({name: 'rotation'});
    h.finger(1).down(0, 0, 0, {recognizers: [rotation]});
    h.finger(2).down(100, 0, 0, {recognizers: [rotation]});
    const at = (degrees: number, time: number) =>
      h
        .finger(2)
        .move(
          100 * Math.cos((degrees * Math.PI) / 180),
          100 * Math.sin((degrees * Math.PI) / 180),
          time,
        );
    // 2 degrees every 16 ms: about 2.18 rad/s.
    let time = 0;
    let degrees = 0;
    for (let i = 0; i < 8; i++) {
      time += 16;
      degrees += 2;
      at(degrees, time);
    }
    expect(rotation.state).toBe('changed');
    rotation.rotation = 0;
    for (let i = 0; i < 3; i++) {
      time += 16;
      degrees += 2;
      at(degrees, time);
      expect(rotation.velocity).toBeGreaterThan(1.5);
    }
  });

  it('keeps its release velocity when a listener re-bases on every change', () => {
    const h = createHarness();
    const rotation = new RotationGestureRecognizer({name: 'rotation'});
    rotation.addListener(r => {
      if (r.state === 'changed') {
        r.rotation = 0;
      }
    });
    let released = Number.NaN;
    rotation.addListener(r => {
      if (r.state === 'ended') {
        released = r.velocity;
      }
    });
    h.finger(1).down(0, 0, 0, {recognizers: [rotation]});
    h.finger(2).down(100, 0, 0, {recognizers: [rotation]});
    let time = 0;
    let degrees = 0;
    for (let i = 0; i < 8; i++) {
      time += 16;
      degrees += 2;
      h.finger(2).move(
        100 * Math.cos((degrees * Math.PI) / 180),
        100 * Math.sin((degrees * Math.PI) / 180),
        time,
      );
    }
    // Lift 8 ms after the last move: 2 degrees every 16 ms, about 2.18 rad/s.
    h.finger(2).up(time + 8);
    expect(released).toBeGreaterThan(1.5);
  });

  it('setting rotation (UIKit\u2019s incremental read) never moves the velocity', () => {
    const h = createHarness();
    const rotation = new RotationGestureRecognizer({name: 'rotation'});
    h.finger(1).down(0, 0, 0, {recognizers: [rotation]});
    h.finger(2).down(100, 0, 0, {recognizers: [rotation]});
    const at = (degrees: number, time: number) =>
      h
        .finger(2)
        .move(
          100 * Math.cos((degrees * Math.PI) / 180),
          100 * Math.sin((degrees * Math.PI) / 180),
          time,
        );
    let time = 0;
    for (let degrees = 10; degrees <= 60; degrees += 10) {
      time += 16;
      at(degrees, time);
      // Read and reset each frame, as an incremental consumer does.
      rotation.rotation = 0;
    }
    expect(rotation.velocity).toBeGreaterThan(0);
  });

  it('lets the velocity settle when the angle holds while the fingers move', () => {
    const h = createHarness();
    const rotation = new RotationGestureRecognizer({name: 'rotation'});
    h.finger(1).down(0, 0, 0, {recognizers: [rotation]});
    h.finger(2).down(100, 0, 0, {recognizers: [rotation]});
    let time = 0;
    for (const degrees of [10, 20, 40, 60, 80]) {
      time += 16;
      const a = (degrees * Math.PI) / 180;
      h.finger(2).move(100 * Math.cos(a), 100 * Math.sin(a), time);
    }
    // Straight up from the first finger: exactly a quarter turn.
    time += 16;
    h.finger(2).move(0, 100, time);
    const turning = rotation.velocity;
    expect(turning).toBeGreaterThan(0);
    // The second finger slides outward along the same line: the angle holds
    // exactly while the finger moves.
    for (let y = 110; y <= 160; y += 10) {
      time += 16;
      h.finger(2).move(0, y, time);
    }
    expect(Math.abs(rotation.velocity)).toBeLessThan(turning * 0.25);
  });
});

// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, expect, it} from 'vitest';
import type {MotionProperty} from './animator';
import {
  mapProgress,
  mapRange,
  presentedProgressVelocity,
  progressCurve,
  type ProgressChannel,
} from './progress';
import {solveSpring, toSpring} from './spring';

const SPRING = {response: 0.4, dampingRatio: 0.85};

/** An animator stand-in that presents fixed velocities. */
const presenting = (velocities: Partial<Record<MotionProperty, number>>) => ({
  getVelocity: (property: MotionProperty) => velocities[property] ?? 0,
});

describe('progressCurve', () => {
  it('follows the spring from 0 to 1 and lands exactly on 1 once settled', () => {
    const curve = progressCurve(SPRING, {velocity: 2});
    const spring = solveSpring(toSpring(SPRING), {from: 0, to: 1, velocity: 2});
    expect(curve.at(0)).toBe(0);
    expect(curve.velocity(0)).toBeCloseTo(2, 9);
    for (const t of [0.05, 0.1, 0.2, 0.3]) {
      expect(curve.at(t)).toBeCloseTo(spring.value(t), 12);
      expect(curve.velocity(t)).toBeCloseTo(spring.velocity(t), 12);
    }
    expect(curve.duration).toBeGreaterThan(0.3);
    expect(curve.at(curve.duration)).toBe(1);
    expect(curve.velocity(curve.duration)).toBe(0);
  });
});

describe('mapProgress', () => {
  it('maps the value through f and the velocity by the chain rule', () => {
    const progress = progressCurve(SPRING);
    const f = (p: number) => 100 + 300 * p * p;
    const mapped = mapProgress(progress, f);
    expect(mapped.duration).toBe(progress.duration);
    for (const t of [0.02, 0.1, 0.25]) {
      const p = progress.at(t);
      expect(mapped.at(t)).toBeCloseTo(f(p), 9);
      expect(mapped.velocity(t)).toBeCloseTo(600 * p * progress.velocity(t), 4);
    }
    expect(mapped.at(progress.duration)).toBe(400);
  });
});

describe('mapRange', () => {
  it('maps linearly inside the input range, exactly at its ends', () => {
    const dim = mapRange([600, 200], [0, 0.4]);
    expect(dim(600)).toBe(0);
    expect(dim(200)).toBe(0.4);
    expect(dim(400)).toBeCloseTo(0.2, 12);
    expect(dim(500)).toBeCloseTo(0.1, 12);
  });

  it('holds the output’s ends outside the input range, or runs on when not clamped', () => {
    const dim = mapRange([600, 200], [0, 0.4]);
    expect(dim(800)).toBe(0);
    expect(dim(0)).toBe(0.4);
    const open = mapRange([600, 200], [0, 0.4], {clamp: false});
    expect(open(800)).toBeCloseTo(-0.2, 12);
    expect(open(0)).toBeCloseTo(0.6, 12);
  });

  it('steps at the input when its range is empty', () => {
    const step = mapRange([10, 10], [0, 1]);
    expect(step(9)).toBe(0);
    expect(step(10)).toBe(1);
    expect(step(11)).toBe(1);
  });
});

describe('mapProgress with a driving channel', () => {
  // A sheet's y falling from 700 px to 100 px at a steady 1000 px/s.
  const sheetY = {
    duration: 0.6,
    at: (t: number) => 700 - 1000 * t,
    velocity: () => -1000,
  };

  it('follows any curve, not only a progress: the scrim’s dim along the sheet’s travel', () => {
    const dim = mapProgress(sheetY, mapRange([600, 200], [0, 0.4]));
    expect(dim.duration).toBe(0.6);
    expect(dim.at(0.3)).toBeCloseTo(0.4 * (200 / 400), 12);
    // Inside the range: 0.4 per 400 px at 1000 px/s, rising.
    expect(dim.velocity(0.3)).toBeCloseTo(1, 4);
  });

  it('is still, velocity 0, outside the range on both sides', () => {
    const dim = mapProgress(sheetY, mapRange([600, 200], [0, 0.4]));
    // y = 650 (not yet in range) and y = 150 (past it).
    for (const t of [0.05, 0.55]) {
      expect(Math.abs(dim.velocity(t))).toBe(0);
    }
    expect(dim.at(0.05)).toBe(0);
    expect(dim.at(0.55)).toBe(0.4);
  });
});

describe('presentedProgressVelocity', () => {
  const line = (
    from: Partial<Record<MotionProperty, number>>,
    to: Partial<Record<MotionProperty, number>>,
    weights: Partial<Record<MotionProperty, number>> = {},
  ): ProgressChannel[] =>
    (Object.keys(to) as MotionProperty[]).map(property => ({
      property,
      at: p => from[property]! + (to[property]! - from[property]!) * p,
      weight: weights[property],
    }));

  it('is the presented velocity over the path\u2019s tangent when they are parallel', () => {
    // A path of 200 px on x and 100 px on y, presented at 400 and 200 px/s:
    // two progress units per second.
    const channels = line({x: 0, y: 0}, {x: 200, y: 100});
    expect(
      presentedProgressVelocity(presenting({x: 400, y: 200}), channels),
    ).toBeCloseTo(2, 6);
  });

  it('keeps only the part along the path (v\u00b7t / t\u00b7t)', () => {
    // Moving across the path counts for nothing; against it, negatively.
    const channels = line({x: 0, y: 0}, {x: 100, y: 0});
    expect(
      presentedProgressVelocity(presenting({x: 0, y: 500}), channels),
    ).toBeCloseTo(0, 9);
    expect(
      presentedProgressVelocity(presenting({x: -50, y: 500}), channels),
    ).toBeCloseTo(-0.5, 6);
  });

  it('weighs each channel into one unit, so a scale counts in px', () => {
    // A 300 px wide box growing from scale 0.5 to 1 while moving 50 px: in px
    // the scale moves 150 px against 50 px of travel.
    const channels = line(
      {x: 0, scaleX: 0.5},
      {x: 50, scaleX: 1},
      {scaleX: 300},
    );
    // Presented: 100 px/s on x and 1 scale/s (300 px/s): (100·50 + 300·150) /
    // (50² + 150²) = 2 progress units per second.
    expect(
      presentedProgressVelocity(presenting({x: 100, scaleX: 1}), channels),
    ).toBeCloseTo(2, 6);
  });

  it('is 0 on a path that moves none of its channels, or from rest', () => {
    expect(
      presentedProgressVelocity(presenting({x: 100}), line({x: 10}, {x: 10})),
    ).toBe(0);
    expect(
      presentedProgressVelocity(presenting({}), line({x: 0}, {x: 10})),
    ).toBe(0);
  });

  it('reads every channel at the one time it is given', () => {
    const times: (number | undefined)[] = [];
    const animator = {
      getVelocity: (_property: MotionProperty, time?: number) => {
        times.push(time);
        return 0;
      },
    };
    presentedProgressVelocity(animator, line({x: 0, y: 0}, {x: 1, y: 1}), 1234);
    expect(times).toEqual([1234, 1234]);
  });
});

// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, expect, it} from 'vitest';
import type {MotionProperty} from './animator';
import {cubicBezier} from './bezier';
import {
  easedProgress,
  mapProgress,
  mapRange,
  presentedProgressVelocity,
  progressCurve,
  timedCurve,
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

describe('easedProgress', () => {
  it('eases from 0 to 1 over its length, and a curve of no length is at its end', () => {
    const curve = easedProgress(0.2, x => x * x);
    expect(curve.duration).toBe(0.2);
    expect(curve.at(0)).toBe(0);
    expect(curve.at(0.1)).toBeCloseTo(0.25, 6);
    expect(curve.at(0.2)).toBe(1);
    expect(curve.velocity(0.1)).toBeCloseTo(5, 3);
    expect(curve.velocity(0.2)).toBe(0);
    const none = easedProgress(0, x => x);
    expect(none.at(0)).toBe(1);
    expect(none.velocity(0)).toBe(0);
  });

  it('with jumps, a jump carries no speed and a smooth stretch keeps its slope', () => {
    const steps = (x: number) => Math.floor(4 * x) / 4;
    // Without the option, the jump at a quarter of 300 ms reads as a spike.
    expect(easedProgress(0.3, steps).velocity(0.075)).toBeGreaterThan(100);
    const jumping = easedProgress(0.3, steps, {jumps: true});
    for (const t of [0, 0.0749, 0.075, 0.0751, 0.15, 0.225, 0.2995]) {
      expect(jumping.velocity(t), `${t} s`).toBe(0);
    }
    expect(
      easedProgress(0.2, x => x * x, {jumps: true}).velocity(0.1),
    ).toBeCloseTo(5, 1);
  });

  // Popover and SegmentedControl read these numbers. Near an end the slope is
  // the mean over the first or last millisecond, not the slope at that time.
  it('reads its slope over one step of 1 ms, held inside the curve at its ends', () => {
    const easeIn = easedProgress(0.1, cubicBezier([0.42, 0, 1, 1]));
    expect(easeIn.velocity(1e-4)).toBeCloseTo(0.2053, 4);
    const standard = easedProgress(0.1, cubicBezier([0.2, 0, 0, 1]));
    expect(standard.velocity(1e-4)).toBeCloseTo(0.9761, 4);
    const after = 1e-4 + 1e-3;
    expect(standard.velocity(1e-4)).toBe(
      (standard.at(after) - standard.at(0)) / after,
    );
    const before = 0.1 - 1e-4 - 1e-3;
    expect(standard.velocity(0.1 - 1e-4)).toBe(
      (standard.at(0.1) - standard.at(before)) / (0.1 - before),
    );
  });
});

describe('timedCurve', () => {
  const EASING = [0.25, 0.1, 0.25, 1] as const;
  const EASE = cubicBezier(EASING);
  const progressOver = (durationMs: number, velocity?: number) =>
    timedCurve({from: 0, to: 1, durationMs, easing: EASING, velocity});

  it('runs from 0 to 1 over the duration on the easing, then holds 1', () => {
    const curve = progressOver(300);
    expect(curve.duration).toBeCloseTo(0.3, 9);
    expect(curve.at(0)).toBeCloseTo(0, 9);
    expect(curve.at(0.15)).toBeGreaterThan(0.5);
    expect(curve.at(0.3)).toBe(1);
    expect(curve.at(1)).toBe(1);
    expect(curve.velocity(0.3)).toBe(0);
    expect(curve.velocity(0.1)).toBeGreaterThan(0);
  });

  it('starts at a retargeted velocity and still lands on time, at rest', () => {
    const curve = progressOver(300, 6);
    expect(curve.velocity(0)).toBe(6);
    const h = 1e-4;
    expect((curve.at(h) - curve.at(0)) / h).toBeCloseTo(6, 1);
    expect(curve.at(0.3)).toBeCloseTo(1, 9);
    expect(curve.velocity(0.3)).toBe(0);
    // Its own velocity numerics follow the curve it plays.
    for (const t of [0.01, 0.1, 0.2, 0.29]) {
      expect(curve.velocity(t), `${t} s`).toBeCloseTo(
        (curve.at(t + 1e-6) - curve.at(t - 1e-6)) / 2e-6,
        1,
      );
    }
  });

  it('from rest is the eased curve itself', () => {
    const curve = progressOver(300);
    for (const t of [0, 0.05, 0.15, 0.25]) {
      expect(curve.at(t)).toBe(EASE(t / 0.3));
    }
  });

  it('lands at once for a zero duration', () => {
    const curve = progressOver(0, 6);
    expect(curve.duration).toBe(0);
    expect(curve.at(0)).toBe(1);
    expect(curve.velocity(0)).toBe(0);
  });

  it('carries the velocity in the units of its values', () => {
    const curve = timedCurve({
      from: 100,
      to: 400,
      durationMs: 300,
      easing: EASING,
      velocity: 1800,
    });
    const progress = progressOver(300, 6);
    for (const t of [0, 0.05, 0.15, 0.3]) {
      expect(curve.at(t)).toBeCloseTo(100 + 300 * progress.at(t), 9);
    }
    expect(curve.velocity(0)).toBe(1800);
  });

  it('with no distance, only the carry plays and it comes back on time', () => {
    const curve = timedCurve({
      from: 50,
      to: 50,
      durationMs: 300,
      easing: [0, 0, 1, 1],
      velocity: 600,
    });
    expect(curve.velocity(0)).toBe(600);
    expect(curve.at(0.1)).toBeGreaterThan(50);
    expect(curve.at(0.3)).toBe(50);
    expect(curve.velocity(0.3)).toBe(0);
  });
});

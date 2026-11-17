// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, expect, it} from 'vitest';
import {
  compareCurve,
  cubicBezier,
  parseTransform,
  projectDecay,
  rubberBand,
  springStep,
  timeline,
  timingFunction,
  velocityAt,
} from './math';

describe('cubicBezier', () => {
  it('matches the CSS keyword curves at known points', () => {
    const linear = cubicBezier(0, 0, 1, 1);
    expect(linear(0.3)).toBeCloseTo(0.3, 6);
    // ease (0.25, 0.1, 0.25, 1) at x = 0.5 is 0.8024 (CSS reference value).
    expect(cubicBezier(0.25, 0.1, 0.25, 1)(0.5)).toBeCloseTo(0.8024, 3);
    expect(cubicBezier(0.24, 1, 0.4, 1)(0)).toBe(0);
    expect(cubicBezier(0.24, 1, 0.4, 1)(1)).toBe(1);
  });
  it('parses timing functions', () => {
    expect(timingFunction('cubic-bezier(0, 0, 1, 1)')(0.25)).toBeCloseTo(
      0.25,
      6,
    );
    expect(timingFunction('ease-out')(0.5)).toBeCloseTo(
      cubicBezier(0, 0, 0.58, 1)(0.5),
      9,
    );
    expect(() => timingFunction('steps(4)')).toThrow();
  });
});

describe('springStep (SwiftUI response / dampingFraction)', () => {
  const critical = {response: 0.5, dampingFraction: 1};
  it('starts at 0 with the given velocity and ends at 1', () => {
    expect(springStep(critical, 0)).toBe(0);
    expect(springStep(critical, 3000)).toBeCloseTo(1, 6);
    const v = 4; // progress units per second
    const slope = springStep({...critical, initialVelocity: v}, 0.01) / 0.00001;
    expect(slope).toBeCloseTo(v, 1);
  });
  it('matches the closed forms in each regime', () => {
    const w0 = (2 * Math.PI) / 0.5;
    const t = 0.12;
    expect(springStep(critical, t * 1000)).toBeCloseTo(
      1 - Math.exp(-w0 * t) * (1 + w0 * t),
      9,
    );
    const z = 0.5;
    const wd = w0 * Math.sqrt(1 - z * z);
    const under =
      1 -
      Math.exp(-z * w0 * t) *
        (Math.cos(wd * t) + ((z * w0) / wd) * Math.sin(wd * t));
    expect(
      springStep({response: 0.5, dampingFraction: z}, t * 1000),
    ).toBeCloseTo(under, 9);
    // Over-damped and critical agree as damping approaches 1 from above.
    expect(
      springStep({response: 0.5, dampingFraction: 1.000001}, 120),
    ).toBeCloseTo(springStep(critical, 120), 4);
  });
  it('overshoots only when under-damped', () => {
    const peak = (dampingFraction: number) =>
      Math.max(
        ...timeline(2000, 4).map(ms =>
          springStep({response: 0.4, dampingFraction}, ms),
        ),
      );
    expect(peak(0.6)).toBeGreaterThan(1.05);
    expect(peak(1)).toBeLessThanOrEqual(1);
    expect(peak(1.5)).toBeLessThanOrEqual(1);
  });
});

describe('UIKit scroll physics', () => {
  it('projects a release with UIScrollView deceleration', () => {
    // 1000 pt/s at 0.998/ms coasts 499 pt; at 0.99/ms (fast) 99 pt.
    expect(projectDecay(1000)).toBeCloseTo(499, 6);
    expect(projectDecay(1000, 0.99)).toBeCloseTo(99, 6);
    expect(projectDecay(-500)).toBeCloseTo(-249.5, 6);
  });
  it('rubber-bands with c = 0.55', () => {
    expect(rubberBand(0, 800)).toBeCloseTo(0, 9);
    expect(rubberBand(100, 800)).toBeCloseTo(
      (1 - 1 / ((100 * 0.55) / 800 + 1)) * 800,
      9,
    );
    expect(rubberBand(-100, 800)).toBeCloseTo(-rubberBand(100, 800), 9);
    expect(rubberBand(1e9, 800)).toBeLessThan(800);
  });
});

describe('parseTransform', () => {
  it('decomposes computed transforms', () => {
    expect(parseTransform('none')).toEqual({
      translateX: 0,
      translateY: 0,
      scaleX: 1,
      scaleY: 1,
      rotate: 0,
    });
    expect(parseTransform('matrix(1, 0, 0, 1, 12.5, -40)')).toMatchObject({
      translateX: 12.5,
      translateY: -40,
      scaleX: 1,
    });
    const rotated = parseTransform(
      `matrix(${Math.cos(0.5)}, ${Math.sin(0.5)}, ${-Math.sin(0.5)}, ${Math.cos(0.5)}, 0, 0)`,
    );
    expect(rotated.rotate).toBeCloseTo((0.5 * 180) / Math.PI, 6);
    expect(
      parseTransform(
        'matrix3d(2, 0, 0, 0, 0, 2, 0, 0, 0, 0, 1, 0, 5, 6, 0, 1)',
      ),
    ).toMatchObject({translateX: 5, translateY: 6, scaleX: 2, scaleY: 2});
    expect(() => parseTransform('translateX(4px)')).toThrow();
  });
});

describe('velocityAt', () => {
  it('fits the last window and reports zero for a rest', () => {
    const samples = timeline(200, 10).map(t => ({t, value: t * 0.5}));
    expect(velocityAt(samples, 200)).toBeCloseTo(500, 6);
    expect(velocityAt(samples, 400)).toBe(0);
  });
});

describe('compareCurve', () => {
  it('reports the worst point', () => {
    const result = compareCurve(
      [
        {t: 0, value: 0},
        {t: 10, value: 1.2},
      ],
      t => t / 10,
      0.1,
    );
    expect(result.pass).toBe(false);
    expect(result.worst.t).toBe(10);
    expect(result.maxError).toBeCloseTo(0.2, 9);
  });
});

describe('compareCurve with points it cannot compare', () => {
  it('fails a sample the reference has no value for', () => {
    const reference = new Map([[0, 0]]);
    const result = compareCurve(
      [
        {t: 0, value: 0},
        {t: 10, value: 1},
      ],
      t => reference.get(t) ?? Number.NaN,
      0.1,
    );
    expect(result.pass).toBe(false);
    expect(result.worst.t).toBe(10);
    expect(result.maxError).toBe(Number.POSITIVE_INFINITY);
  });

  it('fails a non-finite sampled value', () => {
    const result = compareCurve([{t: 0, value: Number.NaN}], () => 0, 0.1);
    expect(result.pass).toBe(false);
  });
});

describe('timeline', () => {
  it('includes both ends', () => {
    expect(timeline(50, 1000 / 60)).toEqual([0, 16.667, 33.333, 50]);
  });
});

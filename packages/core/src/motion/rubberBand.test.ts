// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file rubberBand.test.ts
 * @input vitest, the rubber-band functions
 * @output Checks the formula against a published device measurement of
 *   UIScrollView, its slope, inverse and clamp round trips
 * @position Testing; validates rubberBand.ts without a browser
 */

import {describe, expect, it} from 'vitest';
import {
  rubberBand,
  rubberBandClamp,
  rubberBandInverse,
  rubberBandSlope,
  rubberBandUnclamp,
} from './rubberBand';

describe('rubberBand', () => {
  it('reproduces the published UIScrollView measurement (812 pt view)', () => {
    // Finger 500 / 1000 / 1500 pt past the edge displayed 205 / 328 / 409 pt
    // (I. Lobanov, "How UIScrollView works").
    expect(Math.abs(rubberBand(500, 812) - 205)).toBeLessThan(0.5);
    expect(Math.abs(rubberBand(1000, 812) - 328)).toBeLessThan(0.5);
    expect(Math.abs(rubberBand(1500, 812) - 409)).toBeLessThan(0.5);
  });

  it('is (1 − 1 ÷ (x·c ÷ d + 1))·d with c = 0.55', () => {
    for (const x of [0, 1, 10, 80, 300, 2000]) {
      expect(rubberBand(x, 600)).toBeCloseTo(
        (1 - 1 / ((x * 0.55) / 600 + 1)) * 600,
        9,
      );
    }
    expect(rubberBand(100, 600, 0.3)).toBeCloseTo(
      (1 - 1 / ((100 * 0.3) / 600 + 1)) * 600,
      9,
    );
  });

  it('keeps the sign, never reaches the dimension, starts at slope c', () => {
    expect(rubberBand(-120, 700)).toBeCloseTo(-rubberBand(120, 700), 12);
    expect(rubberBand(1e9, 700)).toBeLessThan(700);
    expect(rubberBandSlope(0, 700)).toBeCloseTo(0.55, 12);
    for (const x of [0, 50, 400, 3000]) {
      const h = 1e-4;
      const numeric =
        (rubberBand(x + h, 700) - rubberBand(x - h, 700)) / (2 * h);
      expect(rubberBandSlope(x, 700)).toBeCloseTo(numeric, 6);
    }
  });

  it('inverts exactly', () => {
    for (const x of [-900, -40, 0, 3, 75, 640, 5000]) {
      expect(rubberBandInverse(rubberBand(x, 812), 812)).toBeCloseTo(x, 6);
    }
    expect(rubberBandInverse(812, 812)).toBe(Infinity);
    expect(rubberBandInverse(-900, 812)).toBe(-Infinity);
  });

  it('a degenerate dimension bands nothing', () => {
    expect(rubberBand(50, 0)).toBe(0);
    expect(rubberBandInverse(50, 0)).toBe(0);
    expect(rubberBandSlope(50, 0)).toBe(0);
  });
});

describe('rubberBandClamp', () => {
  it('passes values inside the range through and bands past either edge', () => {
    expect(rubberBandClamp(120, 0, 500, 800)).toBe(120);
    expect(rubberBandClamp(-100, 0, 500, 800)).toBeCloseTo(
      rubberBand(-100, 800),
      12,
    );
    expect(rubberBandClamp(650, 0, 500, 800)).toBeCloseTo(
      500 + rubberBand(150, 800),
      12,
    );
  });

  it('round-trips through rubberBandUnclamp (a grab mid-bounce resumes in place)', () => {
    for (const raw of [-600, -12, 0, 250, 500, 510, 1400]) {
      const shown = rubberBandClamp(raw, 0, 500, 800);
      expect(rubberBandUnclamp(shown, 0, 500, 800)).toBeCloseTo(raw, 6);
    }
  });
});

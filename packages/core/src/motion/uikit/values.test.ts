// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file values.test.ts
 * @input vitest, the UIKit constants table and the motion math
 * @output Checks the table's values through the math that plays them: every
 *   spring is valid and settles; the alert spring is UIKit's legacy
 *   derivation; a sheet's detent and presentation springs render alike;
 *   scroll-to-top and the rubber band reproduce what UIKit was measured doing;
 *   the press release curve is the press model's
 * @position Testing; the source rules are uikit.test.ts
 */

import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {describe, expect, it} from 'vitest';
import {solveDecay} from '../decay';
import {rubberBand} from '../rubberBand';
import {
  naturalFrequency,
  settlingDuration,
  springFromUIKitDampingDuration,
  toSpring,
  type SpringDescription,
} from '../spring';
import {scroll, springs} from '.';
import {press} from './timing';

describe('UIKit constants table through the motion math', () => {
  const springEntries: [string, SpringDescription][] = [
    ...Object.entries(springs),
    ['scroll.bounce', scroll.bounce],
    ['scroll.paging.snap', scroll.paging.snap],
  ];

  it.each(springEntries)(
    '%s is a valid spring that settles',
    (_, description) => {
      const spring = toSpring(description);
      const settle = settlingDuration(spring);
      expect(settle).toBeGreaterThan(0.05);
      expect(settle).toBeLessThan(2);
    },
  );

  it('the alert spring is UIKit\u2019s legacy derivation at 0.404 s, critically damped', () => {
    // UIKit asks for damping 600 (clamped to 1) over 0.404 s; the measured
    // grid predicts the spring Core Animation was handed.
    const derived = springFromUIKitDampingDuration({
      duration: 0.404,
      dampingRatio: 1,
    });
    expect(derived.stiffness).toBeCloseTo(springs.alertPresent.stiffness, 1);
    expect(derived.damping).toBeCloseTo(springs.alertPresent.damping, 2);
  });

  it('a sheet\u2019s detent spring is its presentation spring as rendered (critical, same pace)', () => {
    // Core Animation clamps UIKit\u2019s default spring to critical damping.
    expect(naturalFrequency(toSpring(springs.sheetDetent))).toBeCloseTo(
      naturalFrequency(toSpring(springs.sheetPresent)),
      6,
    );
  });

  it('scroll-to-top as a decay lands on the top along the measured curve', () => {
    // 2000 pt from the top: remaining distance every ~50 ms after the start.
    const measured = [1257, 768, 475, 296, 186, 118];
    const coast = solveDecay({
      from: 0,
      velocity: 9.7 * 2000,
      rate: scroll.scrollToTopRate,
    });
    expect(coast.rest).toBeCloseTo(2000, -1);
    measured.forEach((remaining, i) => {
      expect(
        Math.abs(2000 - coast.value((i + 1) * 0.05) - remaining),
      ).toBeLessThan(30);
    });
  });

  it('the rubber band reproduces UIScrollView\u2019s released overscroll', () => {
    // Finger 100 / 300 / 600 pt past the edge of an 874 pt view, minus the
    // pan\u2019s 10 pt hysteresis.
    const cases: [number, number][] = [
      [90, 47],
      [290, 135],
      [590, 236.67],
    ];
    for (const [overflow, shown] of cases) {
      expect(
        Math.abs(
          rubberBand(overflow, 874, scroll.rubberBand.coefficient) - shown,
        ),
      ).toBeLessThan(0.5);
    }
  });

  it('the press release curve is the press model\u2019s RELEASE_EASE', () => {
    // The table records the curve the touch press model ships with; this pins
    // the two together so neither drifts alone.
    const source = readFileSync(
      join(__dirname, '../../utils/interactionOverlay.stylex.ts'),
      'utf8',
    );
    const match = /const RELEASE_EASE = 'cubic-bezier\(([^)]*)\)'/.exec(source);
    expect(match?.[1].split(',').map(Number)).toEqual([
      ...press.highlightOutCurve,
    ]);
  });
});

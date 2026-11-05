// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file segmented.test.ts
 * @input vitest, the segmented-control domain of the UIKit constants table,
 *   the spring solver, and samples of UIKit's own selection slide
 * @output Holds `segmentedControl.selectionSpring` to UISegmentedControl's
 *   measured slide (position per frame, iOS 26.2 simulator), an internal
 *   constant no theme retunes
 * @position Testing; parity of the segmented-control constants (law P4,
 *   unit layer). The browser layer is
 *   SegmentedControl/__tests__/SegmentedControl.interaction.browser.spec.ts.
 */

import {describe, expect, it} from 'vitest';
import {dampingRatioOf, responseOf, solveSpring, toSpring} from '../spring';
import {motionRoleIn, motionRoleOf} from '../roles';
import {resolveMotion} from '../resolveMotion';
import {registerSegmentedTable, segmentedControl} from './segmented';
import {registerSpringsTable, springs} from './springs';

/**
 * The selection lens's presented position per frame, in pt within the
 * control. Time 0 is the frame where the slide's presentation value first
 * appears. The data is UIKit lab capture `b5-segmented` on the iOS 26.2
 * simulator: a 300 × 31 pt control of three equal segments.
 */
const MEASURED = {
  tap: {
    from: 50,
    to: 250,
    samples: [
      [0.0, 50],
      [69.1, 117.81],
      [135.6, 191.14],
      [206.4, 231.12],
      [267.7, 246.72],
      [333.3, 250.89],
      [403.2, 251.17],
      [470.0, 250.67],
      [536.6, 250.27],
    ],
  },
  animatedSet: {
    from: 250,
    to: 50,
    samples: [
      [0.0, 250],
      [71.9, 184.42],
      [139.9, 110.35],
      [204.5, 69.55],
      [272.0, 53.5],
      [340.1, 49.15],
      [406.5, 48.82],
      [471.1, 49.32],
      [538.5, 49.72],
    ],
  },
} as const;

/**
 * The worst and rms distance between the table's spring and a measured
 * slide. The capture logs a frame a few ms after the animation is created, so
 * the start is searched within ±6 ms; nothing else is fitted.
 */
function residuals({
  from,
  to,
  samples,
}: (typeof MEASURED)[keyof typeof MEASURED]): {
  worst: number;
  rms: number;
  offsetMs: number;
} {
  const curve = solveSpring(toSpring(segmentedControl.selectionSpring), {
    from,
    to,
    velocity: 0,
  });
  let best = {worst: Infinity, rms: Infinity, offsetMs: 0};
  for (let offset = -6; offset <= 6; offset += 0.25) {
    let worst = 0;
    let squares = 0;
    for (const [t, x] of samples) {
      const error = Math.abs(curve.value(Math.max(0, t + offset) / 1000) - x);
      worst = Math.max(worst, error);
      squares += error * error;
    }
    const rms = Math.sqrt(squares / samples.length);
    if (rms < best.rms) {
      best = {worst, rms, offsetMs: offset};
    }
  }
  return best;
}

describe('segmentedControl.selectionSpring reproduces UIKit’s slide', () => {
  it('is the response / damping ratio the capture fits', () => {
    const spring = toSpring(segmentedControl.selectionSpring);
    expect(responseOf(spring)).toBeCloseTo(0.4, 6);
    expect(dampingRatioOf(spring)).toBeCloseTo(0.85, 6);
  });

  it.each(Object.entries(MEASURED))(
    'matches the measured %s slide within a point',
    (_name, measured) => {
      const {worst, rms} = residuals(measured);
      expect(rms).toBeLessThan(0.75);
      expect(worst).toBeLessThan(1.5);
    },
  );

  it('overshoots like UIKit: about 1.25 pt past a 200 pt move, then settles back', () => {
    const curve = solveSpring(toSpring(segmentedControl.selectionSpring), {
      from: 50,
      to: 250,
      velocity: 0,
    });
    let peak = 0;
    for (let t = 0; t <= 1; t += 0.001) {
      peak = Math.max(peak, curve.value(t));
    }
    // Measured peak 251.25 at about 0.39 s (tap) and 251.23 (programmatic).
    expect(peak - 250).toBeGreaterThan(0.9);
    expect(peak - 250).toBeLessThan(1.6);
    expect(Math.abs(curve.value(0.6) - 250)).toBeLessThan(0.5);
  });
});

describe('the drag chase', () => {
  it('is the shared role springs.fingerTracking (spec:AST-094 FR4), the values UIKit reports for this control: no copy in the table', () => {
    registerSpringsTable();
    expect('trackingSpring' in segmentedControl).toBe(false);
    expect(springs.fingerTracking).toEqual({
      response: 0.15,
      dampingRatio: 0.86,
    });
    expect(motionRoleOf(springs.fingerTracking)).toMatchObject({
      id: 'springs.fingerTracking',
      kind: 'spring',
    });
  });
});

describe('motion roles and internal constants', () => {
  it('its slide spring is an internal motion role once registered (spec:AST-094 FR4); the overshoot is not; the table holds no lift and no pressed dim, and the titles switch at once, with no clock', () => {
    registerSegmentedTable();
    expect(motionRoleOf(segmentedControl.selectionSpring)?.id).toBe(
      'segmented.selectionSpring',
    );
    expect(motionRoleIn(segmentedControl, 'dragOvershoot')).toBeUndefined();
    // A pressed thumb's lift is a theme's (a shared role, none by default),
    // and a pressed segment shows the shared overlay: nothing of either here.
    expect(Object.keys(segmentedControl).sort()).toEqual([
      'dragOvershoot',
      'selectionSpring',
    ]);
  });

  it('resolves to UIKit’s measured values whatever a theme sets: the old role variables do nothing', () => {
    const element = document.createElement('div');
    element.style.setProperty(
      '--motion-segmented-control-selection-spring',
      '0.25s 0',
    );
    document.body.append(element);
    try {
      expect(resolveMotion(element, segmentedControl.selectionSpring)).toEqual(
        segmentedControl.selectionSpring,
      );
    } finally {
      element.remove();
    }
  });
});

describe('one source for the slide', () => {
  it('the segmented slide has one spring, the measured one: no guessed thumb spring is left', () => {
    expect('segmentedThumb' in springs).toBe(false);
    expect(motionRoleIn(springs, 'segmentedThumb')).toBeUndefined();
  });
});

describe('Reduce Motion', () => {
  it('holds no values: SegmentedControl follows design:reduced-motion through the animator’s cross-fade, not UIKit’s fade and scale-in', () => {
    expect('reducedMotion' in segmentedControl).toBe(false);
  });
});

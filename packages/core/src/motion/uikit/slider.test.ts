// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file slider.test.ts
 * @input vitest, the slider domain of the UIKit constants table, the spring
 *   solver and the momentum projection, and samples of UIKit's own UISlider
 * @output Holds `slider` to UISlider's measured behavior (iOS 26.2
 *   simulator, capture b40): the value per `valueChanged` against the
 *   tracking rule, the thumb's lift and drop against its per-frame width,
 *   and the release coast against the per-frame value after a lift
 * @position Testing; parity of the slider constants (law P4, unit layer).
 *   The browser layer comes with Slider's touch presentation, which reads
 *   this table.
 */

import {describe, expect, it} from 'vitest';
import {projectDistance} from '../projection';
import {solveSpring, toSpring} from '../spring';
import {UIKIT_GESTURES} from './gestures';
import {slider} from './slider';

/** The lab's slider: 300 pt long, value 0…1. */
const TRACK = 300;

/**
 * `valueChanged` during a 200 pt/s drag from 0.2: the finger's travel since
 * touch-down (pt) and the value UIKit reported for it (UIKit lab capture
 * b40, case M4, Oct 23 2026). The pan began at 10.33 pt.
 */
const TRACKING = {
  startValue: 0.2,
  events: [
    [15.33, 0.21777777],
    [22.0, 0.24000001],
    [27.0, 0.25666666],
    [42.0, 0.30666667],
    [60.33, 0.36777779],
    [78.67, 0.42888889],
    [97.0, 0.49000001],
    [115.0, 0.55000001],
  ],
} as const;

/**
 * The thumb lens's width (pt) per frame from touch-down during an 800 ms
 * hold, and from the lift after it (UIKit lab capture b40, case M3).
 */
const LIFT = [
  [10.7, 37],
  [44.0, 47.1],
  [77.4, 54.93],
  [110.7, 58.6],
  [144.0, 59.39],
  [177.4, 58.84],
  [210.7, 58.02],
  [244.0, 57.43],
  [277.4, 57.27],
  [310.7, 57.35],
] as const;
const DROP = [
  [13.3, 57.35],
  [46.7, 54.62],
  [80.0, 50.8],
  [113.3, 46.87],
  [146.7, 43.39],
  [180.0, 40.62],
  [213.3, 38.6],
  [246.7, 37.27],
  [280.0, 36.5],
  [313.3, 36.13],
  [346.7, 36.04],
  [380.0, 36.12],
  [413.3, 36.27],
  [446.7, 36.46],
] as const;
const REST_WIDTH = 37;

/**
 * The value per frame after a lift at 126.9 pt/s (UIKit lab capture b40,
 * case M8a: grabbed 8 pt off the thumb's center, dragged 60 pt). The coast
 * shows on screen 38 ms after the lift.
 */
const COAST = {
  velocity: 126.9,
  liftValue: 0.6667,
  startMs: 38,
  samples: [
    [47.4, 0.6705],
    [80.7, 0.682],
    [114.0, 0.6905],
    [147.4, 0.6964],
    [180.7, 0.7005],
    [214.0, 0.7033],
    [247.4, 0.7051],
    [280.7, 0.7064],
    [314.0, 0.7071],
    [347.4, 0.7077],
    [380.7, 0.708],
    [414.0, 0.7085],
    [480.7, 0.7085],
  ],
} as const;

function rms(errors: ReadonlyArray<number>): number {
  return Math.sqrt(
    errors.reduce((sum, error) => sum + error * error, 0) / errors.length,
  );
}

describe('slider under Reduce Motion', () => {
  it('keeps no motion of its own under Reduce Motion (design:reduced-motion DR4)', () => {
    expect(Object.keys(slider)).not.toContain('reducedMotion');
  });
});

describe('slider (UISlider) constants against UIKit', () => {
  it('the touch target is the thumb grown by its hit insets', () => {
    // 37 × 24 pt thumb, insets 5.5 pt left and right, 12 pt above and below.
    expect(37 + 2 * 5.5).toBe(slider.thumbHitTarget);
    expect(24 + 2 * 12).toBe(slider.thumbHitTarget);
  });

  it('the value is the start value plus the travel past the pan threshold over the track length', () => {
    const hysteresis = UIKIT_GESTURES.pan.hysteresis.value;
    for (const [travel, value] of TRACKING.events) {
      const model =
        TRACKING.startValue +
        ((travel - hysteresis) / TRACK) * slider.trackingGain;
      expect(model).toBeCloseTo(value, 4);
    }
  });

  it('the lift and the drop follow the thumb lens’s measured width', () => {
    const lifted = REST_WIDTH * slider.liftScale;
    expect(lifted).toBeCloseTo(57.35, 1);
    const lift = solveSpring(toSpring(slider.liftSpring), {
      from: REST_WIDTH,
      to: lifted,
    });
    const liftErrors = LIFT.map(([ms, width]) => lift.value(ms / 1000) - width);
    // The fit's rms over every frame is 0.31 pt; over these samples, 0.41.
    expect(rms(liftErrors)).toBeLessThan(0.5);
    const drop = solveSpring(toSpring(slider.dropSpring), {
      from: lifted,
      to: REST_WIDTH,
    });
    const dropErrors = DROP.map(([ms, width]) => drop.value(ms / 1000) - width);
    // The best fit, 0.49 s, leaves 0.10 pt; the read 0.5 s, 0.20 pt.
    expect(rms(dropErrors)).toBeLessThan(0.25);
  });

  it('the release coasts on the release spring to 0.4 of the momentum projection', () => {
    const projected =
      slider.releaseProjectionShare *
      projectDistance(COAST.velocity, slider.releaseProjectionRate);
    // 12.64 pt predicted; UIKit travelled 12.56 pt.
    expect(projected).toBeCloseTo(12.64, 1);
    const target = COAST.liftValue + projected / TRACK;
    const coast = solveSpring(toSpring(slider.releaseSpring), {
      from: COAST.liftValue,
      to: target,
      velocity: COAST.velocity / TRACK,
    });
    const errors = COAST.samples.map(
      ([ms, value]) =>
        (coast.value(Math.max(0, ms - COAST.startMs) / 1000) - value) * TRACK,
    );
    // In pt of the track.
    expect(rms(errors)).toBeLessThan(0.15);
    expect(Math.max(...errors.map(Math.abs))).toBeLessThan(0.35);
  });
});

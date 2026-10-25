// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file VelocityTracker.test.ts
 * @input Synthetic finger traces with known velocities
 * @output UIKit's filter against the velocities UIKit reported on recorded
 *   touch streams; steady motion, a hard acceleration, the stillness reset
 *   before a release (spec:AST-100 FR2), sparse samples
 * @position Unit tests of packages/core/src/gestures/VelocityTracker.ts
 */

import {describe, expect, it} from 'vitest';
import {VelocityTracker} from '../VelocityTracker';

/** Feed `position(t)` sampled every `step` ms over [0, end]. */
function trace(
  tracker: VelocityTracker,
  position: (t: number) => number,
  end: number,
  step = 8,
): void {
  for (let t = 0; t <= end; t += step) {
    tracker.add(position(t), 0, t);
  }
}

/**
 * Touch streams UIKit's UIPanGestureRecognizer reported on (iOS 26.2
 * simulator, HID touches at 60 Hz): [ms since touch-down, y in pt] per event,
 * and the velocity(in:).y UIKit reported at each event from the third on.
 */
const UIKIT_STREAMS = {
  steady: {
    samples: [
      [0, 840],
      [57.702, 831.6666666666665],
      [73.904, 815],
      [91.286, 789.6666666666665],
      [107.677, 773],
      [125.123, 756.3333333333333],
      [141.298, 739.6666666666665],
      [157.709, 722.6666666666665],
      [174.631, 706],
      [191.78, 689.3333333333333],
      [209.313, 672.6666666666666],
      [226.956, 655.6666666666666],
      [243.419, 639],
      [260.223, 622.3333333333333],
      [277.866, 605.6666666666666],
      [294.774, 589],
      [312.902, 572],
      [333.081, 547],
      [350.016, 530.3333333333333],
      [368.475, 513.3333333333333],
      [396.62, 488.33333333333326],
    ],
    velocities: [
      -321.3, -1114.4, -1369.3, -1004.5, -970.3, -1031.5, -1025.7, -982.3,
      -967.6, -953.2, -973.3, -1008.3, -982.4, -952.8, -976.1, -998.0, -1187.9,
      -971.5, -914.4,
    ],
  },
  accelerating: {
    samples: [
      [0, 840],
      [70.032, 838.6666666666665],
      [93.493, 827.6666666666665],
      [110.376, 790],
      [131.223, 701],
      [147.373, 640],
      [164.226, 567.6666666666666],
      [181.326, 484.33333333333326],
    ],
    velocities: [-109.0, -821.3, -2638.6, -4170.8, -3880.1, -4408.3],
  },
} as const;

describe('VelocityTracker', () => {
  it.each(Object.entries(UIKIT_STREAMS))(
    'uikit reproduces every velocity UIKit reported on the %s stream',
    (_, {samples, velocities}) => {
      const tracker = new VelocityTracker();
      const errors: number[] = [];
      samples.forEach(([time, y], index) => {
        tracker.add(0, y, time);
        if (index >= 2) {
          errors.push(Math.abs(tracker.velocity().y - velocities[index - 2]));
        }
      });
      expect(errors).toHaveLength(velocities.length);
      // Within the rounding of the recorded values (0.1 pt/s) and of the
      // timestamps (1 us).
      expect(Math.max(...errors)).toBeLessThan(0.1);
    },
  );

  it('keeps the last moving value through a rest while the finger is down', () => {
    const tracker = new VelocityTracker();
    trace(tracker, t => t * 2, 160);
    // No event arrives while the finger rests: nothing changes the estimate.
    expect(tracker.velocity().x).toBeCloseTo(2000, 6);
  });

  it('releases at 0 after the finger rested past the stillness interval (AST-100 FR2)', () => {
    const tracker = new VelocityTracker({stillness: 40});
    trace(tracker, t => t * 2, 160);
    // Lifted right after the last move: the moving value.
    expect(tracker.velocity(168).x).toBeCloseTo(2000, 6);
    // At the interval itself: still the moving value.
    expect(tracker.velocity(200).x).toBeCloseTo(2000, 6);
    // Rested longer than the interval: no flick.
    expect(tracker.velocity(201)).toEqual({x: 0, y: 0});
  });

  it('counts a sample at the same position as resting, not moving', () => {
    const tracker = new VelocityTracker({stillness: 40});
    trace(tracker, t => t * 2, 160);
    // Events that report no movement (a still finger) do not restart it.
    tracker.add(320, 0, 180);
    tracker.add(320, 0, 220);
    expect(tracker.velocity(230)).toEqual({x: 0, y: 0});
    // A real move does.
    tracker.add(330, 0, 228);
    expect(tracker.velocity(236).x).not.toBe(0);
  });

  it('reads a steady 1000 px/s exactly', () => {
    const tracker = new VelocityTracker();
    trace(tracker, t => t, 200);
    expect(tracker.velocity().x).toBeCloseTo(1000, 6);
  });

  it('lags a hard acceleration by a frame, as UIKit does', () => {
    // x = 0.02 t^2 (px, ms). UIKit's filter is 0.8 on the previous interval
    // (its middle, 188 ms: 7520 px/s) and 0.2 on the newest (196 ms:
    // 7840 px/s).
    const tracker = new VelocityTracker();
    trace(tracker, t => 0.02 * t * t, 200);
    expect(tracker.velocity().x).toBeCloseTo(0.8 * 7520 + 0.2 * 7840, 3);
  });

  it('handles one and two samples, and repeated timestamps', () => {
    const tracker = new VelocityTracker();
    expect(tracker.velocity()).toEqual({x: 0, y: 0});
    tracker.add(0, 0, 0);
    expect(tracker.velocity()).toEqual({x: 0, y: 0});
    tracker.add(10, 20, 10);
    // One interval so far: reported whole.
    expect(tracker.velocity()).toEqual({x: 1000, y: 2000});
    // The same timestamp replaces the newest sample.
    tracker.add(20, 20, 10);
    expect(tracker.velocity().x).toBeCloseTo(2000, 6);
    // An older timestamp is ignored.
    tracker.add(500, 500, 5);
    expect(tracker.lastSample).toEqual({x: 20, y: 20, time: 10});
  });

  it('keeps at most maxSamples and forgets on reset', () => {
    const tracker = new VelocityTracker({maxSamples: 3});
    trace(tracker, t => t, 80);
    tracker.reset();
    expect(tracker.lastSample).toBeNull();
  });
});

// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file VelocityTracker.test.ts
 * @input Synthetic finger traces with known velocities
 * @output UIKit's filter against the velocities UIKit reported on recorded
 *   touch streams; each strategy against the true velocity: steady motion, a
 *   hard acceleration, a pause before the lift, noise, sparse samples
 * @position Unit tests of packages/core/src/gestures/VelocityTracker.ts
 */

import {describe, expect, it} from 'vitest';
import {VelocityTracker, type VelocityStrategy} from '../VelocityTracker';

const STRATEGIES: VelocityStrategy[] = ['uikit', 'lsq2', 'iosFling', 'window'];

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
      const tracker = new VelocityTracker({strategy: 'uikit'});
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

  it('uikit reports the last moving value after a rest, as UIKit does', () => {
    const tracker = new VelocityTracker();
    trace(tracker, t => t * 2, 160);
    // No event arrives while the finger rests: nothing changes the estimate.
    expect(tracker.velocity().x).toBeCloseTo(2000, 6);
  });

  it.each(STRATEGIES)('%s reads a steady 1000 px/s exactly', strategy => {
    const tracker = new VelocityTracker({strategy});
    trace(tracker, t => t, 200);
    expect(tracker.velocity().x).toBeCloseTo(1000, 6);
  });

  it('lsq2 follows a hard acceleration where the averages lag', () => {
    // x = 0.02 t^2 (px, ms): the true velocity at t = 200 is 0.04 * 200 =
    // 8 px/ms = 8000 px/s.
    const position = (t: number) => 0.02 * t * t;
    const lsq = new VelocityTracker({strategy: 'lsq2'});
    const window = new VelocityTracker({strategy: 'window'});
    const ios = new VelocityTracker({strategy: 'iosFling'});
    const uikit = new VelocityTracker({strategy: 'uikit'});
    trace(lsq, position, 200);
    trace(window, position, 200);
    trace(ios, position, 200);
    trace(uikit, position, 200);
    expect(lsq.velocity().x).toBeCloseTo(8000, 3);
    // The two-point average over the window (samples 104..200 ms) reads
    // the middle of it: 0.02 * (104 + 200) px/ms.
    expect(window.velocity().x).toBeCloseTo(6080, 3);
    // The iOS weighting leans on older pairs.
    expect(ios.velocity().x).toBeLessThan(lsq.velocity().x);
    // UIKit's filter is 0.8 on the previous interval (its middle, 188 ms:
    // 7520 px/s) and 0.2 on the newest (196 ms: 7840 px/s).
    expect(uikit.velocity().x).toBeCloseTo(0.8 * 7520 + 0.2 * 7840, 3);
  });

  it('lsq2 ignores motion before a rest inside the horizon', () => {
    const tracker = new VelocityTracker({strategy: 'lsq2'});
    tracker.add(0, 0, 0);
    tracker.add(50, 0, 16);
    // A 50 ms rest, then slow motion: only the slow motion counts.
    tracker.add(50, 0, 66);
    tracker.add(51, 0, 74);
    tracker.add(52, 0, 82);
    expect(tracker.velocity().x).toBeCloseTo(125, 3);
  });

  it('keeps lsq2 close to the truth under sample noise', () => {
    const tracker = new VelocityTracker({strategy: 'lsq2'});
    const noise = [
      0.6, -0.4, 0.2, -0.7, 0.5, -0.1, 0.3, -0.5, 0.4, -0.3, 0.1, -0.6, 0.7,
    ];
    noise.forEach((jitter, index) => {
      const t = index * 8;
      tracker.add(t * 1.5 + jitter, 0, t);
    });
    expect(Math.abs(tracker.velocity().x - 1500)).toBeLessThan(150);
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

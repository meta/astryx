// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file VelocityTracker.test.ts
 * @input Synthetic finger traces with known velocities
 * @output UIKit's filter against the velocities UIKit reported on recorded
 *   touch streams; steady motion, a hard acceleration, the release rules
 *   (stillness, two moved samples), moved-only updates and the scroll-view
 *   release blend (architecture:interaction-modality INV10, spec:AST-100 FR2)
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

  it('releases at 0 after a rest longer than the stillness interval (AST-100 FR2)', () => {
    const tracker = new VelocityTracker({stillness: 40});
    trace(tracker, t => t * 2, 160);
    expect(tracker.velocity(168).x).toBeCloseTo(2000, 6);
    expect(tracker.velocity(200).x).toBeCloseTo(2000, 6);
    expect(tracker.velocity(201)).toEqual({x: 0, y: 0});
    expect(tracker.scrollVelocity(201)).toEqual({x: 0, y: 0});
  });

  it('releases at 0 with fewer than two moved samples (AST-100)', () => {
    const tracker = new VelocityTracker();
    tracker.add(0, 0, 0);
    tracker.add(10, 0, 8);
    // One moved sample: the live value is that interval, the release is 0.
    expect(tracker.velocity().x).toBeCloseTo(1250, 6);
    expect(tracker.velocity(10)).toEqual({x: 0, y: 0});
    expect(tracker.scrollVelocity(10)).toEqual({x: 0, y: 0});
    tracker.add(20, 0, 16);
    expect(tracker.velocity(18).x).toBeCloseTo(1250, 6);
  });

  it('updates only on moved samples (INV10)', () => {
    const tracker = new VelocityTracker();
    tracker.add(0, 0, 0);
    tracker.add(10, 0, 10);
    tracker.add(20, 0, 20);
    const moving = tracker.velocity();
    // An event at the same position is not motion: nothing changes, and the
    // next move's interval runs from the last moved sample.
    tracker.add(20, 0, 30);
    expect(tracker.velocity()).toEqual(moving);
    tracker.add(30, 0, 40);
    // 10 px over the 20 ms since the last move: 500 px/s, after 1000 px/s.
    expect(tracker.velocity().x).toBeCloseTo(0.2 * 500 + 0.8 * 1000, 6);
  });

  it('blends a scrolling surface\u2019s release from the last two pan values (INV10)', () => {
    const tracker = new VelocityTracker();
    tracker.add(0, 0, 0);
    tracker.add(10, 0, 10);
    tracker.add(20, 0, 20);
    const previous = tracker.velocity().x;
    tracker.add(40, 0, 30);
    const newest = tracker.velocity().x;
    expect(tracker.scrollVelocity(32).x).toBeCloseTo(
      0.25 * newest + 0.75 * previous,
      6,
    );
  });

  // Four UIPickerView swipes, HID touches on the iOS 26.2 simulator: each
  // stream is [ms since touch-down, y in pt], and the release is the velocity
  // UIKit handed scrollViewWillEndDragging, in offset px/s.
  it.each([
    [
      '200 pt in 50 ms',
      [
        [0, 368],
        [46.48, 334.67],
        [72.92, 201.33],
      ],
      933.4,
    ],
    [
      '200 pt in 100 ms',
      [
        [0, 368],
        [49.2, 351.33],
        [65.27, 301.33],
        [88.47, 251.33],
        [104.68, 218],
        [129.4, 168],
      ],
      2114,
    ],
    [
      '200 pt in 200 ms',
      [
        [0, 368],
        [46.01, 359.67],
        [63.5, 334.67],
        [81.36, 318],
        [97.69, 301.33],
        [120.12, 276.33],
        [137.2, 259.67],
        [171.83, 226.33],
        [196.13, 201.33],
        [212.66, 184.67],
        [230.83, 168],
      ],
      1016.2,
    ],
    [
      'a 90 pt flick',
      [
        [0, 353],
        [41.5, 335],
        [62.02, 281],
      ],
      543.6,
    ],
  ] as const)(
    "reproduces UIKit's scroll release on a recorded UIPickerView swipe, %s (INV10)",
    (_, stream, release) => {
      const tracker = new VelocityTracker();
      for (const [time, y] of stream) {
        tracker.add(0, y, time);
      }
      const lift = stream[stream.length - 1][0];
      // The content moves against the finger: its velocity is the finger's,
      // negated.
      const offset = -tracker.scrollVelocity(lift).y;
      expect(Math.abs(offset - release) / release).toBeLessThan(0.001);
    },
  );

  it('reads a steady 1000 px/s exactly', () => {
    const tracker = new VelocityTracker();
    trace(tracker, t => t, 200);
    expect(tracker.velocity().x).toBeCloseTo(1000, 6);
    expect(tracker.scrollVelocity(200).x).toBeCloseTo(1000, 6);
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

  it('forgets everything on reset', () => {
    const tracker = new VelocityTracker();
    trace(tracker, t => t, 80);
    tracker.reset();
    expect(tracker.lastSample).toBeNull();
    expect(tracker.velocity()).toEqual({x: 0, y: 0});
    expect(tracker.velocity(80)).toEqual({x: 0, y: 0});
  });
});

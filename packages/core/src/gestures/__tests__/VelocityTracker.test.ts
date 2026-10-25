// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file VelocityTracker.test.ts
 * @input Synthetic finger traces with known velocities, and touch streams
 *   recorded in UIKit with the velocities it reported
 * @output The pan reading against every velocity(in:) UIKit reported on six
 *   streams, the scroll-view reading against four UIPickerView releases,
 *   rests silent and reporting, the event clock, sparse samples
 * @position Unit tests of packages/core/src/gestures/VelocityTracker.ts
 */

import {describe, expect, it} from 'vitest';
import {UIKIT_GESTURES} from '../../motion/uikit/gestures';
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

/**
 * Swipes on a UIPickerView column (iOS 26.2 simulator, HID touches): [ms
 * since touch-down, y in pt] per event, and the velocity UIKit handed
 * scrollViewWillEndDragging, in offset px/s (the content moves against the
 * finger).
 */
const PICKER_RELEASES = {
  '200 pt in 50 ms': {
    stream: [
      [0, 368],
      [46.48, 334.67],
      [72.92, 201.33],
    ],
    release: 933.4,
  },
  '200 pt in 100 ms': {
    stream: [
      [0, 368],
      [49.2, 351.33],
      [65.27, 301.33],
      [88.47, 251.33],
      [104.68, 218],
      [129.4, 168],
    ],
    release: 2114,
  },
  '200 pt in 200 ms': {
    stream: [
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
    release: 1016.2,
  },
  'a 90 pt flick': {
    stream: [
      [0, 353],
      [41.5, 335],
      [62.02, 281],
    ],
    release: 543.6,
  },
} as const;

describe('VelocityTracker', () => {
  it.each(Object.entries(UIKIT_STREAMS))(
    'reads every velocity(in:) UIKit reported on the %s stream',
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

  it.each(Object.entries(PICKER_RELEASES))(
    'releases %s as a scroll view does',
    (_, {stream, release}) => {
      const tracker = new VelocityTracker();
      for (const [time, y] of stream) {
        tracker.add(0, y, time);
      }
      expect(
        Math.abs(-tracker.scrollReleaseVelocity().y - release),
      ).toBeLessThan(0.5);
    },
  );

  it('reads a steady 1000 px/s exactly, as a pan and as a scroll view', () => {
    const tracker = new VelocityTracker();
    trace(tracker, t => t, 200);
    expect(tracker.velocity().x).toBeCloseTo(1000, 6);
    expect(tracker.scrollReleaseVelocity().x).toBeCloseTo(1000, 6);
  });

  it('reads 0 at a lift after a still pause longer than the stillness interval, and keeps the motion for a shorter one', () => {
    const tracker = new VelocityTracker();
    trace(tracker, t => t * 2, 160);
    const still = UIKIT_GESTURES.velocity.stillness.value;
    // No event arrives while the finger rests: the blend keeps the motion.
    expect(tracker.velocity().x).toBeCloseTo(2000, 6);
    expect(tracker.velocity(160 + still).x).toBeCloseTo(2000, 6);
    expect(tracker.scrollReleaseVelocity(160 + still).x).toBeCloseTo(2000, 6);
    // Past the interval, a still finger never flicks (spec:AST-100 FR2).
    expect(tracker.velocity(160 + still + 1).x).toBe(0);
    expect(tracker.scrollReleaseVelocity(160 + still + 1).x).toBe(0);
  });

  it('reaches 0 when a resting finger keeps reporting: two samples for a pan, three for a scroll view', () => {
    const tracker = new VelocityTracker();
    trace(tracker, t => t, 200);
    tracker.add(200, 0, 208);
    // UIKit's own sequence: 1000, then 800 on the first sample without
    // movement, then 0.
    expect(tracker.velocity().x).toBeCloseTo(800, 6);
    tracker.add(200, 0, 216);
    expect(tracker.velocity().x).toBe(0);
    expect(tracker.scrollReleaseVelocity().x).toBeCloseTo(600, 6);
    tracker.add(200, 0, 224);
    expect(tracker.scrollReleaseVelocity().x).toBe(0);
  });

  it('follows the events own clock, however far from the wall clock', () => {
    const near = new VelocityTracker();
    const far = new VelocityTracker();
    for (let t = 0; t <= 96; t += 8) {
      near.add(t * t * 0.02, 0, t);
      far.add(t * t * 0.02, 0, 9e12 + t);
    }
    expect(far.velocity().x).toBeCloseTo(near.velocity().x, 6);
    expect(far.scrollReleaseVelocity().x).toBeCloseTo(
      near.scrollReleaseVelocity().x,
      6,
    );
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

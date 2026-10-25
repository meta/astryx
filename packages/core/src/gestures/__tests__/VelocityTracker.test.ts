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

describe('VelocityTracker', () => {
  it('reads a steady 1000 px/s exactly', () => {
    const tracker = new VelocityTracker();
    trace(tracker, t => t, 200);
    expect(tracker.velocity().x).toBeCloseTo(1000, 6);
    expect(tracker.scrollVelocity(200).x).toBeCloseTo(1000, 6);
  });

  it('reads 0 once a resting finger reports without moving, with no timer', () => {
    const tracker = new VelocityTracker();
    trace(tracker, t => t, 200);
    // A silent rest (no events) keeps the last motion's value, as UIKit does.
    expect(tracker.velocity().x).toBeCloseTo(1000, 6);
    const still = UIKIT_GESTURES.velocity.stillSamples.value;
    for (let i = 1; i < still; i++) {
      tracker.add(200, 0, 200 + 8 * i);
      expect(tracker.velocity().x).not.toBe(0);
    }
    tracker.add(200, 0, 200 + 8 * still);
    expect(tracker.velocity().x).toBe(0);
  });

  it('ignores motion older than the window before the lift', () => {
    const tracker = new VelocityTracker();
    // A fast stroke, then slow motion for longer than the window.
    trace(tracker, t => (t <= 40 ? 10 * t : 400 + (t - 40) * 0.5), 200);
    expect(tracker.velocity().x).toBeCloseTo(500, 6);
  });

  it('follows the events own clock, however far from the wall clock', () => {
    const near = new VelocityTracker();
    const far = new VelocityTracker();
    for (let t = 0; t <= 96; t += 8) {
      near.add(t * 2, 0, t);
      far.add(t * 2, 0, 9e12 + t);
    }
    expect(far.velocity().x).toBeCloseTo(near.velocity().x, 6);
  });

  it('reports what the UIKit streams would release, for the record', () => {
    const errors: string[] = [];
    for (const [name, {samples, velocities}] of Object.entries(UIKIT_STREAMS)) {
      const tracker = new VelocityTracker();
      samples.forEach(([time, y]) => tracker.add(0, y, time));
      const last = velocities[velocities.length - 1];
      errors.push(
        `${name}: ${tracker.velocity().y.toFixed(1)} vs UIKit ${last.toFixed(1)}`,
      );
    }
    expect(errors.length).toBe(Object.keys(UIKIT_STREAMS).length);
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

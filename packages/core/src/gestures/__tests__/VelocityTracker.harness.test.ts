// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file VelocityTracker.harness.test.ts
 * @input VelocityTracker and the interaction harness's `readRelease`
 * @output Checks that the harness reads a paced play's release as this
 *   tracker does, on the same samples
 * @position Testing. The harness copies this tracker's filter because it
 *   cannot import Core's gestures. This test keeps the two equal.
 *
 * SYNC: When modified, update
 *   /internal/interaction-harness/src/touch.ts (`coreRelease`).
 */

import {
  readRelease,
  type TouchEventStep,
} from '@astryxdesign/interaction-harness';
import {describe, expect, it} from 'vitest';
import {UIKIT_VELOCITY} from '../../motion/uikit/gestures';
import {VelocityTracker} from '../VelocityTracker';

/** A finger's samples as [x, y, ms], in order, and its lift time. */
interface Gesture {
  readonly samples: ReadonlyArray<readonly [number, number, number]>;
  readonly lift: number;
}

/** Three moves, then a lift `ms` after the last one. */
function liftAfter(ms: number): Gesture {
  return {
    samples: [
      [100, 50, 0],
      [116, 50, 16],
      [132, 50, 32],
    ],
    lift: 32 + ms,
  };
}

// The tracker reads a speed at the stillness interval and none 1 ms past it.
// A copy with another interval or bound fails one of these.
const AT_STILLNESS = liftAfter(UIKIT_VELOCITY.stillness.value);
const PAST_STILLNESS = liftAfter(UIKIT_VELOCITY.stillness.value + 1);

const GESTURES: Record<string, Gesture> = {
  'a steady flick': {
    samples: [
      [100, 50, 0],
      [116, 50, 16],
      [132, 50, 32],
      [148, 50, 48],
      [164, 50, 64],
    ],
    lift: 80,
  },
  'an accelerating throw': {
    samples: [
      [100, 50, 0],
      [104, 50, 16],
      [112, 50, 32],
      [128, 50, 48],
      [160, 50, 64],
    ],
    lift: 72,
  },
  'two moves at one time': {
    samples: [
      [100, 50, 0],
      [116, 50, 16],
      [132, 50, 32],
      [140, 50, 32],
      [156, 50, 48],
    ],
    lift: 56,
  },
  'a sample that does not move': {
    samples: [
      [100, 50, 0],
      [116, 50, 16],
      [116, 50, 32],
      [132, 50, 48],
    ],
    lift: 56,
  },
  'a diagonal drag': {
    samples: [
      [100, 300, 0],
      [110, 290, 17],
      [125, 270, 33],
      [140, 255, 50],
    ],
    lift: 66,
  },
  'a single move': {
    samples: [
      [100, 50, 0],
      [116, 50, 16],
    ],
    lift: 32,
  },
  'a rest before the lift': {
    samples: [
      [100, 50, 0],
      [116, 50, 16],
      [132, 50, 32],
    ],
    lift: 120,
  },
  'a lift at the stillness interval': AT_STILLNESS,
  'a lift 1 ms past the stillness interval': PAST_STILLNESS,
};

/** The tracker's release speed for the gesture, in px/s. */
function coreSpeed({samples, lift}: Gesture): number {
  const tracker = new VelocityTracker();
  for (const [x, y, t] of samples) {
    tracker.add(x, y, t);
  }
  const velocity = tracker.velocity(lift);
  return Math.hypot(velocity.x, velocity.y);
}

/** The gesture as a paced play's touch events, one finger. */
function stepsOf({samples, lift}: Gesture): TouchEventStep[] {
  const steps: TouchEventStep[] = samples.map(([x, y, t], i) => {
    const finger = {id: 0, x, y};
    return {
      t,
      type: i === 0 ? 'touchStart' : 'touchMove',
      fingers: [finger],
      changed: [finger],
    };
  });
  const [x, y] = samples[samples.length - 1];
  steps.push({
    t: lift,
    type: 'touchEnd',
    fingers: [],
    changed: [{id: 0, x, y}],
  });
  return steps;
}

describe("the interaction harness's copy of the release filter", () => {
  for (const [name, gesture] of Object.entries(GESTURES)) {
    it(`reads ${name} as VelocityTracker does`, () => {
      const core = coreSpeed(gesture);
      // The page received each event at its scripted time.
      const steps = stepsOf(gesture);
      const reading = readRelease(
        steps,
        steps.map(step => ({stamp: step.t, handledAt: step.t})),
      );
      expect(reading?.scriptPxPerS).toBeCloseTo(core, 6);
      expect(reading?.pagePxPerS).toBeCloseTo(core, 6);
    });
  }

  it('straddles the stillness reset with its two boundary lifts', () => {
    expect(coreSpeed(AT_STILLNESS)).toBeGreaterThan(0);
    expect(coreSpeed(PAST_STILLNESS)).toBe(0);
  });
});

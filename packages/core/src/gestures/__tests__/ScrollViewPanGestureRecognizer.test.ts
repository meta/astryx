// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ScrollViewPanGestureRecognizer.test.ts
 * @input The gesture test harness, VelocityTracker, and swipes recorded on a
 *   UIPickerView
 * @output A scroll view's pan releases with the velocity UIKit handed
 *   scrollViewWillEndDragging; a plain pan releases with velocity(in:);
 *   ScrollViewRelease against four picker releases, steady motion, a still
 *   finger silent and reporting (spec:AST-100 FR2), the event clock
 * @position Unit tests of
 *   packages/core/src/gestures/ScrollViewPanGestureRecognizer.ts
 */

import {describe, expect, it} from 'vitest';
import {UIKIT_GESTURES} from '../../motion/uikit/gestures';
import {PanGestureRecognizer} from '../PanGestureRecognizer';
import {
  ScrollViewPanGestureRecognizer,
  ScrollViewRelease,
} from '../ScrollViewPanGestureRecognizer';
import {VelocityTracker} from '../VelocityTracker';
import {createHarness} from './harness';

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

/** A tracker and the scroll view's release over it, fed together. */
function scrollView() {
  const tracker = new VelocityTracker();
  const release = new ScrollViewRelease();
  return {
    tracker,
    release,
    add(x: number, y: number, time: number) {
      tracker.add(x, y, time);
      release.sampled(tracker);
    },
    velocity: (releaseTime?: number) => release.velocity(tracker, releaseTime),
  };
}

/** [ms since touch-down, y in pt]; UIKit's release in offset px/s. */
const SWIPES = [
  {
    name: '200 pt in 50 ms',
    stream: [
      [0, 368],
      [46.48, 334.67],
      [72.92, 201.33],
    ],
    scrollView: 933.4,
    pan: 1582.3,
  },
  {
    name: 'a 90 pt flick',
    stream: [
      [0, 353],
      [41.5, 335],
      [62.02, 281],
    ],
    scrollView: 543.6,
    pan: 873.3,
  },
] as const;

function release(
  recognizer: PanGestureRecognizer,
  stream: ReadonlyArray<readonly [number, number]>,
): number {
  const h = createHarness();
  let velocity = Number.NaN;
  recognizer.addListener(r => {
    if (r.state === 'ended') {
      velocity = -recognizer.velocity().y;
    }
  });
  const [first, ...rest] = stream;
  const finger = h.finger(1).down(100, first[1], first[0], {
    recognizers: [recognizer],
  });
  for (const [time, y] of rest) {
    finger.move(100, y, time);
  }
  finger.up(rest[rest.length - 1][0]);
  return velocity;
}

describe('ScrollViewPanGestureRecognizer', () => {
  it.each(SWIPES)(
    'releases $name as a scroll view does, and a plain pan as velocity(in:)',
    ({stream, scrollView, pan}) => {
      expect(
        Math.abs(
          release(
            new ScrollViewPanGestureRecognizer({direction: 'vertical'}),
            stream,
          ) - scrollView,
        ),
      ).toBeLessThan(0.5);
      expect(
        Math.abs(
          release(new PanGestureRecognizer({direction: 'vertical'}), stream) -
            pan,
        ),
      ).toBeLessThan(0.5);
    },
  );

  it.each(Object.entries(PICKER_RELEASES))(
    'ScrollViewRelease releases %s as a scroll view does',
    (_, {stream, release}) => {
      const view = scrollView();
      for (const [time, y] of stream) {
        view.add(0, y, time);
      }
      expect(Math.abs(-view.velocity().y - release)).toBeLessThan(0.5);
    },
  );

  it('reads a steady 1000 px/s exactly', () => {
    const view = scrollView();
    for (let t = 0; t <= 200; t += 8) {
      view.add(t, 0, t);
    }
    expect(view.velocity().x).toBeCloseTo(1000, 6);
  });

  it('releases at 0 after the finger rested past the stillness interval, silent or reporting (spec:AST-100 FR2)', () => {
    const still = UIKIT_GESTURES.velocity.stillness.value;
    const silent = scrollView();
    for (let t = 0; t <= 160; t += 8) {
      silent.add(t * 2, 0, t);
    }
    // No event arrives while the finger rests: the blend keeps the motion.
    expect(silent.velocity(160 + still).x).toBeCloseTo(2000, 6);
    expect(silent.velocity(160 + still + 1).x).toBe(0);
    // A resting finger that keeps reporting: 1000, then 600 once the pan reads
    // 800 then 0, then 0, and past the interval 0 at the release.
    const reporting = scrollView();
    for (let t = 0; t <= 200; t += 8) {
      reporting.add(t, 0, t);
    }
    reporting.add(200, 0, 208);
    reporting.add(200, 0, 216);
    expect(reporting.velocity().x).toBeCloseTo(600, 6);
    reporting.add(200, 0, 224);
    expect(reporting.velocity().x).toBe(0);
    expect(reporting.velocity(200 + still + 1).x).toBe(0);
  });

  it('follows the events own clock, however far from the wall clock', () => {
    const near = scrollView();
    const far = scrollView();
    for (let t = 0; t <= 96; t += 8) {
      near.add(t * t * 0.02, 0, t);
      far.add(t * t * 0.02, 0, 9e12 + t);
    }
    expect(far.velocity().x).toBeCloseTo(near.velocity().x, 6);
  });

  it('forgets on reset, and a replaced sample does not count as a new one', () => {
    const view = scrollView();
    view.add(0, 0, 0);
    view.add(10, 0, 10);
    // The same timestamp replaces the newest sample: still one interval.
    view.add(20, 0, 10);
    expect(view.velocity().x).toBeCloseTo(2000, 6);
    view.tracker.reset();
    view.release.reset();
    expect(view.velocity()).toEqual({x: 0, y: 0});
  });
});

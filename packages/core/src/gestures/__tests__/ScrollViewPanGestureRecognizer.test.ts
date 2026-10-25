// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ScrollViewPanGestureRecognizer.test.ts
 * @input The gesture test harness and two swipes recorded on a UIPickerView
 * @output A scroll view's pan releases with the velocity UIKit handed
 *   scrollViewWillEndDragging; a plain pan releases with velocity(in:)
 * @position Unit tests of
 *   packages/core/src/gestures/ScrollViewPanGestureRecognizer.ts
 */

import {describe, expect, it} from 'vitest';
import {PanGestureRecognizer} from '../PanGestureRecognizer';
import {ScrollViewPanGestureRecognizer} from '../ScrollViewPanGestureRecognizer';
import {createHarness} from './harness';

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
});

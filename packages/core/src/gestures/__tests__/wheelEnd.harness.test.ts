// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file wheelEnd.harness.test.ts
 * @input A GestureHost on a manual clock with a pan that takes a trackpad's
 *   scroll, and the interaction harness's wheel scroll pauses and burst judge
 * @output Checks that the harness splits a wheel burst where GestureHost
 *   splits a trackpad scroll. On each axis, a gap of `WHEEL_SCROLL_END_MS`
 *   starts a second gesture. A gap 0.5 ms shorter keeps one.
 * @position Testing. The harness copies the pauses because it cannot import
 *   Core. This test keeps the two equal.
 *
 * SYNC: When modified, update
 *   /internal/interaction-harness/src/webInput.ts (`WHEEL_SCROLL_END_MS`).
 */

import {
  WHEEL_SCROLL_END_MS,
  wheelGapCauses,
} from '@astryxdesign/interaction-harness';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import {GestureHost} from '../GestureHost';
import {PanGestureRecognizer} from '../PanGestureRecognizer';
import {ManualClock} from './harness';

type Axis = keyof typeof WHEEL_SCROLL_END_MS;

let clock: ManualClock;
let host: GestureHost;
let detach: () => void = () => {};

beforeEach(() => {
  clock = new ManualClock();
  host = new GestureHost(document, {
    clock,
    isPrimaryPointerCoarse: () => false,
  });
});

afterEach(() => {
  detach();
  document.body.innerHTML = '';
});

/** A trackpad's wheel along `axis`: its legacy delta three times its delta. */
function trackpadWheel(target: EventTarget, axis: Axis, time: number): void {
  clock.time = time;
  const [dx, dy] = axis === 'horizontal' ? [8, 0] : [0, 8];
  const event = new WheelEvent('wheel', {
    bubbles: true,
    cancelable: true,
    composed: true,
    clientX: 20,
    clientY: 20,
    deltaX: dx,
    deltaY: dy,
  });
  Object.defineProperty(event, 'timeStamp', {value: time});
  Object.defineProperty(event, 'wheelDeltaX', {value: -3 * dx});
  Object.defineProperty(event, 'wheelDeltaY', {value: -3 * dy});
  target.dispatchEvent(event);
}

/**
 * The gestures a pan begins from three wheels a frame apart, a gap of
 * `gapMs`, and three more. No timer runs, so the next wheel's own time
 * decides the split, as on a blocked main thread.
 */
function gesturesAcross(axis: Axis, gapMs: number): number {
  document.body.innerHTML = '<div id="box"></div>';
  const box = document.getElementById('box') as HTMLElement;
  const pan = new PanGestureRecognizer({
    direction: axis,
    allowedScrollTypes: ['continuous'],
  });
  let began = 0;
  pan.addTransitionListener((_recognizer, _from, to) => {
    if (to === 'began') {
      began += 1;
    }
  });
  detach = host.attach(box, pan);
  for (const time of [0, 16, 32, 32 + gapMs, 48 + gapMs, 64 + gapMs]) {
    trackpadWheel(box, axis, time);
  }
  return began;
}

describe("the interaction harness's wheel scroll pauses", () => {
  for (const axis of ['vertical', 'horizontal'] as const) {
    const pause = WHEEL_SCROLL_END_MS[axis];

    it(`split a ${axis} trackpad scroll at a gap of ${pause} ms, as GestureHost does`, () => {
      expect(gesturesAcross(axis, pause)).toBe(2);
      expect(
        wheelGapCauses('chromium', [0, pause], [Number.NaN, Number.NaN], pause)
          .dispatchStalls,
      ).toEqual([pause]);
    });

    it(`keep a ${axis} trackpad scroll whole at a gap 0.5 ms shorter, as GestureHost does`, () => {
      expect(gesturesAcross(axis, pause - 0.5)).toBe(1);
      expect(
        wheelGapCauses(
          'chromium',
          [0, pause - 0.5],
          [Number.NaN, Number.NaN],
          pause,
        ).dispatchStalls,
      ).toEqual([]);
    });
  }
});

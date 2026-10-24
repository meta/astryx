// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file VelocityTracker.ts
 * @input Timestamped positions of a moving contact, and the release time
 * @output Exports VelocityTracker, the one velocity tracker every continuous
 *   recognizer uses (architecture:interaction-modality INV10,
 *   spec:AST-100 FR1, FR2)
 * @position Pure math under packages/core/src/gestures; no DOM
 *
 * What a release hands to a spring or a deceleration: the finger's velocity
 * when it lifted, in px per SECOND (UIKit's unit for `velocity(in:)`).
 *
 * - `uikit` (default): UIPanGestureRecognizer's own filter, measured. Each
 *   event's instantaneous velocity is the position change over the timestamp
 *   change since the previous event (the touch-down counts as the first),
 *   and the velocity is 0.2 times the newest one plus 0.8 times the one
 *   before. Fitted to every value UIKit reported on six HID streams, exactly.
 *   It reacts a frame late to an acceleration, includes a hold before the
 *   first move, and never decays: a finger at rest sends no events, so a
 *   release after a pause reports the last moving value, as UIKit does.
 * - `window`: the two-point speed over the last 100 ms that BottomSheet's
 *   gesture uses on main, for a path that keeps main's behavior (a release
 *   off iOS that must stay byte-identical). Not UIKit.
 *
 * Feed the `uikit` filter one sample per input event (coalesced samples
 * would change its timing); `window` takes every sample.
 *
 * SYNC: When modified, update VelocityTracker.test.ts.
 */

import {UIKIT_GESTURES} from '../motion/uikit/gestures';
import type {Point, TouchSample} from './types';

/**
 * How a pan estimates its release velocity: one of the filters this file's
 * header describes, `uikit` by default.
 * @experimental
 */
export type VelocityStrategy = 'uikit' | 'window';

export interface VelocityTrackerOptions {
  /** @default 'uikit' */
  strategy?: VelocityStrategy;
  /** Samples older than this (ms) relative to the newest are ignored. */
  horizon?: number;
  /** At most this many samples are kept. */
  maxSamples?: number;
}

const ZERO: Point = {x: 0, y: 0};
const PAN_CURRENT_WEIGHT = UIKIT_GESTURES.velocity.currentWeight.value;
const SCROLL_CURRENT_WEIGHT = UIKIT_GESTURES.velocity.scrollReleaseWeight.value;

function blend(weight: number, current: Point, previous: Point): Point {
  return {
    x: weight * current.x + (1 - weight) * previous.x,
    y: weight * current.y + (1 - weight) * previous.y,
  };
}

export class VelocityTracker {
  readonly strategy: VelocityStrategy;
  private readonly horizon: number;
  private readonly maxSamples: number;
  private samples: TouchSample[] = [];

  constructor(options: VelocityTrackerOptions = {}) {
    this.strategy = options.strategy ?? 'uikit';
    this.horizon = options.horizon ?? UIKIT_GESTURES.velocity.horizon.value;
    this.maxSamples =
      options.maxSamples ?? UIKIT_GESTURES.velocity.maxSamples.value;
  }

  /** Forget every sample (a new gesture). */
  reset(): void {
    this.newest = null;
    this.moved = [];
    this.moves = 0;
    this.pan = ZERO;
    this.previousPan = ZERO;
  }

  /**
   * Record a position. Timestamps must not go backwards (an older sample is
   * ignored), and a moved sample at the newest moved sample's timestamp
   * replaces it. A sample at the newest position is not motion: it changes
   * no velocity.
   */
  add(x: number, y: number, time: number): void {
    if (this.newest != null && time < this.newest.time) {
      return;
    }
    this.newest = {x, y, time};
    const last = this.moved[this.moved.length - 1];
    if (last != null && x === last.x && y === last.y) {
      return;
    }
    if (last != null && time === last.time) {
      this.moved[this.moved.length - 1] = {x, y, time};
    } else {
      this.moved.push({x, y, time});
      if (this.moved.length > 3) {
        this.moved.shift();
      }
      if (last != null) {
        this.moves += 1;
        this.previousPan = this.pan;
      }
    }
    this.pan = panVelocity(this.moved);
  }

  /** Record every sample in order. */
  addSamples(samples: ReadonlyArray<TouchSample>): void {
    for (const sample of samples) {
      this.add(sample.x, sample.y, sample.time);
    }
  }

  /** The newest sample, if any. */
  get lastSample(): TouchSample | null {
    return this.samples[this.samples.length - 1] ?? null;
  }

  /** The velocity in px/s at the newest sample. */
  velocity(): Point {
    const newest = this.samples[this.samples.length - 1];
    if (newest == null) {
      return ZERO;
    }
    switch (this.strategy) {
      case 'uikit':
        return uikitVelocity(this.samples);
      case 'window':
        return windowVelocity(this.samples, newest, this.horizon);
    }
  }
}

const UIKIT_CURRENT_WEIGHT = UIKIT_GESTURES.velocity.currentWeight.value;

/** UIPanGestureRecognizer's filter: 0.2 x newest + 0.8 x previous event velocity. */
function uikitVelocity(samples: ReadonlyArray<TouchSample>): Point {
  const n = samples.length;
  if (n < 2) {
    return ZERO;
  }
  const current = pairVelocity(samples[n - 2], samples[n - 1]);
  if (n === 2) {
    return current;
  }
  return blend(
    PAN_CURRENT_WEIGHT,
    current,
    pairVelocity(moved[n - 3], moved[n - 2]),
  );
}

/** Instantaneous velocity (px/s) between two samples, zero across no time. */
function pairVelocity(start: TouchSample, end: TouchSample): Point {
  const dt = end.time - start.time;
  if (dt <= 0) {
    return ZERO;
  }
  return {
    x: ((end.x - start.x) / dt) * 1000,
    y: ((end.y - start.y) / dt) * 1000,
  };
}

/**
 * BottomSheet's former estimator: displacement from the oldest sample still
 * inside the window (keeping at least one partner) over the elapsed time,
 * with a lone partner older than the window read as if it took the window.
 */
function windowVelocity(
  samples: ReadonlyArray<TouchSample>,
  newest: TouchSample,
  horizon: number,
): Point {
  if (samples.length < 2) {
    return ZERO;
  }
  let first = samples.length - 2;
  while (first > 0 && newest.time - samples[first - 1].time <= horizon) {
    first--;
  }
  const oldest = samples[first];
  const span = Math.min(newest.time - oldest.time, horizon);
  if (span <= 0) {
    return ZERO;
  }
  return {
    x: ((newest.x - oldest.x) / span) * 1000,
    y: ((newest.y - oldest.y) / span) * 1000,
  };
}

// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file VelocityTracker.ts
 * @input Timestamped positions of a moving contact
 * @output Exports VelocityTracker, the one release-velocity estimator every
 *   continuous recognizer uses (`spec:AST-100`)
 * @position Pure math under packages/core/src/gestures; no DOM
 *
 * What a release hands to a spring or a deceleration: the finger's velocity
 * when it lifted, in px per SECOND. One filter for every gesture and every
 * pointer (FR1): the two-point velocity over the samples in a fixed window
 * before the lift (`velocity.horizon`), with no motion older than the window
 * (FR2). A contact whose last `velocity.stillSamples` moves did not move
 * reads 0: a resting finger never flicks (UIKit resets the same way, on
 * samples, with no timer). Times are the input events' own timestamps (FR4). Thresholds stay
 * with each component (FR3).
 *
 * SYNC: When modified, update VelocityTracker.test.ts.
 */

import {UIKIT_GESTURES} from '../motion/uikit/gestures';
import type {Point, TouchSample} from './types';

export interface VelocityTrackerOptions {
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
  private readonly horizon: number;
  private readonly maxSamples: number;
  private samples: TouchSample[] = [];

  constructor(options: VelocityTrackerOptions = {}) {
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

  /**
   * The release velocity in px/s (`spec:AST-100`): the two-point velocity
   * over the samples in the window before the newest one. A contact that
   * sent `velocity.stillSamples` moves in a row without moving reads 0 (a
   * resting finger still reports, and UIKit's own estimate reaches 0 on its
   * second zero-movement sample); no timer is involved, so a perfectly
   * silent rest keeps the last motion's value, as UIKit's does. Fewer than
   * two samples in the window read 0.
   */
  velocity(): Point {
    const n = this.samples.length;
    const newest = this.samples[n - 1];
    if (newest == null) {
      return ZERO;
    }
    if (n > STILL_SAMPLES) {
      let still = true;
      for (let i = n - STILL_SAMPLES; i < n; i++) {
        const a = this.samples[i - 1];
        const b = this.samples[i];
        if (a.x !== b.x || a.y !== b.y) {
          still = false;
          break;
        }
      }
      if (still) {
        return ZERO;
      }
    }
    return windowVelocity(this.samples, newest.time, this.horizon);
  }
}

const STILL_SAMPLES = UIKIT_GESTURES.velocity.stillSamples.value;

/**
 * BottomSheet's former estimator: displacement from the oldest sample still
 * inside the window (keeping at least one partner) over the elapsed time,
 * with a lone partner older than the window read as if it took the window.
 */
function windowVelocity(
  samples: ReadonlyArray<TouchSample>,
  time: number,
  horizon: number,
): Point {
  const newest = samples[samples.length - 1];
  let first = samples.length - 1;
  while (first > 0 && time - samples[first - 1].time <= horizon) {
    first--;
  }
  const oldest = samples[first];
  const span = newest.time - oldest.time;
  if (first === samples.length - 1 || span <= 0) {
    // Fewer than two samples in the window: no velocity to read.
    return ZERO;
  }
  return {
    x: ((newest.x - oldest.x) / span) * 1000,
    y: ((newest.y - oldest.y) / span) * 1000,
  };
}

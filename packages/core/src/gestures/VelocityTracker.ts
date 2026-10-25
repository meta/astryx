// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file VelocityTracker.ts
 * @input Timestamped positions of a moving contact
 * @output Exports VelocityTracker, the one release-velocity filter every
 *   continuous recognizer uses (`spec:AST-100`), read as a pan recognizer
 *   reads it or as a scroll view reads it
 * @position Pure math under packages/core/src/gestures; no DOM
 *
 * What a release hands to a spring or a deceleration: the contact's velocity
 * when it lifted, in px per SECOND. One filter for every gesture and every
 * pointer (FR1), UIKit's own, measured. Each sample's instantaneous velocity
 * (position change over timestamp change since the previous sample, the
 * touch-down counting as the first) is blended with the previous one:
 *
 *   pan(n) = w * v(n) + (1 - w) * v(n-1), w = `velocity.currentWeight`,
 *
 * which is UIPanGestureRecognizer's `velocity(in:)`. A scroll view smooths
 * its pan recognizer once more for the velocity it hands
 * `scrollViewWillEndDragging`:
 *
 *   scroll(n) = s * pan(n) + (1 - s) * pan(n-1), s = `velocity.scrollReleaseWeight`.
 *
 * Samples update it: a resting contact that keeps reporting brings it to 0
 * within two samples (three for a scroll view). Read at the lift, a contact
 * still for longer than the stillness interval (`velocity.stillness`) reads
 * 0 (FR2: a still finger never flicks), the one place it differs from iOS,
 * whose blend keeps the last motion through a silent rest. Times are the
 * input events' own timestamps (FR4); thresholds stay with each component
 * (FR3).
 *
 * SYNC: When modified, update VelocityTracker.test.ts.
 */

import {UIKIT_GESTURES} from '../motion/uikit/gestures';
import type {Point, TouchSample} from './types';

export interface VelocityTrackerOptions {
  /** At most this many samples are kept. */
  maxSamples?: number;
}

const ZERO: Point = {x: 0, y: 0};
const PAN_WEIGHT = UIKIT_GESTURES.velocity.currentWeight.value;
const STILLNESS = UIKIT_GESTURES.velocity.stillness.value;
const SCROLL_RELEASE_WEIGHT = UIKIT_GESTURES.velocity.scrollReleaseWeight.value;

export class VelocityTracker {
  private readonly maxSamples: number;
  private samples: TouchSample[] = [];

  constructor(options: VelocityTrackerOptions = {}) {
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
   * The velocity in px/s as a pan recognizer reports it: pan(n). `at`, the
   * lift's event time, applies the stillness reset.
   */
  velocity(at?: number): Point {
    if (this.isStill(at)) {
      return ZERO;
    }
    return panVelocity(this.samples, this.samples.length);
  }

  /**
   * The velocity in px/s as a scroll view releases it: scroll(n), its pan
   * recognizer's last two values blended once more. With one interval so
   * far, the pan's value.
   */
  scrollReleaseVelocity(at?: number): Point {
    if (this.isStill(at)) {
      return ZERO;
    }
    const end = this.samples.length;
    if (end < 3) {
      return panVelocity(this.samples, end);
    }
    return blend(
      panVelocity(this.samples, end),
      panVelocity(this.samples, end - 1),
      SCROLL_RELEASE_WEIGHT,
    );
  }

  /** No sample for longer than the stillness interval before `at`. */
  private isStill(at: number | undefined): boolean {
    const newest = this.samples[this.samples.length - 1];
    return at != null && newest != null && at - newest.time > STILLNESS;
  }
}

/** pan(n) over `samples[0..end)`: one interval so far is reported whole. */
function panVelocity(samples: ReadonlyArray<TouchSample>, end: number): Point {
  if (end < 2) {
    return ZERO;
  }
  const current = pairVelocity(samples[end - 2], samples[end - 1]);
  if (end === 2) {
    return current;
  }
  return blend(
    current,
    pairVelocity(samples[end - 3], samples[end - 2]),
    PAN_WEIGHT,
  );
}

function blend(current: Point, previous: Point, weight: number): Point {
  return {
    x: weight * current.x + (1 - weight) * previous.x,
    y: weight * current.y + (1 - weight) * previous.y,
  };
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

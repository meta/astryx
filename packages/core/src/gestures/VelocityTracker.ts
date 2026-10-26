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
 * One filter, iOS's measured blend, updated on each MOVED sample (a sample
 * at the newest position is not motion):
 *
 * - A pan's velocity is 0.2 times the newest interval's velocity plus 0.8
 *   times the previous interval's (an interval runs from one moved sample to
 *   the next; the touch-down counts as the first). With one interval so far
 *   it is that interval, as UIKit reports it. It reproduces every value
 *   UIKit reported on six HID streams, and like UIKit's it reacts a frame
 *   late to an acceleration.
 * - A scrolling surface's release (paging, a wheel) is 0.25 times the newest
 *   pan value plus 0.75 times the previous one.
 *
 * A release (`velocity(releaseTime)`, `scrollVelocity(releaseTime)`) reads 0
 * when the contact was still for longer than the stillness interval before
 * lifting, the one difference from iOS, whose filter never decays and so
 * flings after a rest; and 0 with fewer than two moved samples.
 *
 * Feed it one sample per input event: coalesced samples would change its
 * timing.
 *
 * SYNC: When modified, update VelocityTracker.test.ts.
 */

import {UIKIT_VELOCITY} from '../motion/uikit/gestures';
import type {Point, TouchSample} from './types';

export interface VelocityTrackerOptions {
  /**
   * A contact that has not moved for longer than this (ms) before its
   * release releases at 0 (spec:AST-100 FR2).
   */
  stillness?: number;
}

const ZERO: Point = {x: 0, y: 0};
const PAN_CURRENT_WEIGHT = UIKIT_VELOCITY.currentWeight.value;
const SCROLL_CURRENT_WEIGHT = UIKIT_VELOCITY.scrollReleaseWeight.value;

function blend(weight: number, current: Point, previous: Point): Point {
  return {
    x: weight * current.x + (1 - weight) * previous.x,
    y: weight * current.y + (1 - weight) * previous.y,
  };
}

export class VelocityTracker {
  private readonly stillness: number;
  /** The newest sample added, moved or not. */
  private newest: TouchSample | null = null;
  /**
   * The newest moved samples, oldest first (the touch-down counts as the
   * first); the filter reads the last three.
   */
  private moved: TouchSample[] = [];
  /** Moved samples since the touch-down. */
  private moves = 0;
  /** The newest pan value, and the one before it. */
  private pan: Point = ZERO;
  private previousPan: Point = ZERO;

  constructor(options: VelocityTrackerOptions = {}) {
    this.stillness = options.stillness ?? UIKIT_VELOCITY.stillness.value;
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
    return this.newest;
  }

  /**
   * The pan's velocity in px/s. Pass the release's event time to read the
   * release velocity of a dragged surface: 0 after a rest longer than the
   * stillness interval, or with fewer than two moved samples (AST-100 FR2).
   */
  velocity(releaseTime?: number): Point {
    if (releaseTime != null && !this.releases(releaseTime)) {
      return ZERO;
    }
    return this.pan;
  }

  /**
   * A scrolling surface's release velocity in px/s (paging, a wheel): 0.25
   * times the newest pan value plus 0.75 times the previous one, with the
   * same stillness and two-moved-sample rules (AST-100 FR2).
   */
  scrollVelocity(releaseTime: number): Point {
    if (!this.releases(releaseTime)) {
      return ZERO;
    }
    return blend(SCROLL_CURRENT_WEIGHT, this.pan, this.previousPan);
  }

  private releases(releaseTime: number): boolean {
    const last = this.moved[this.moved.length - 1];
    return (
      this.moves >= 2 &&
      last != null &&
      releaseTime - last.time <= this.stillness
    );
  }
}

/**
 * UIPanGestureRecognizer's filter over the newest moved samples: 0.2 x the
 * newest interval's velocity + 0.8 x the previous one's; one interval so far
 * is reported whole, as UIKit does.
 */
function panVelocity(moved: ReadonlyArray<TouchSample>): Point {
  const n = moved.length;
  if (n < 2) {
    return ZERO;
  }
  const current = pairVelocity(moved[n - 2], moved[n - 1]);
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

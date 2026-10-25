// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file VelocityTracker.ts
 * @input Timestamped positions of a moving contact, and the release time
 * @output Exports VelocityTracker, the one release-velocity filter every
 *   continuous recognizer uses (spec:AST-100 FR1, FR2)
 * @position Pure math under packages/core/src/gestures; no DOM
 *
 * What a release hands to a spring or a deceleration: the finger's velocity
 * when it lifted, in px per SECOND (UIKit's unit for `velocity(in:)`).
 *
 * The filter is UIPanGestureRecognizer's own, measured: each event's
 * instantaneous velocity is the position change over the timestamp change
 * since the previous event (the touch-down counts as the first), and the
 * velocity is 0.2 times the newest one plus 0.8 times the one before. It
 * reproduces every value UIKit reported on six HID streams, and like UIKit's
 * it reacts a frame late to an acceleration and includes a hold before the
 * first move.
 *
 * One difference from UIKit (spec:AST-100 FR2): a contact that stayed still
 * for longer than the stillness interval before it lifted releases at 0.
 * UIKit's filter never decays, because a finger at rest sends no events, so
 * it flings after a rest; `velocity(releaseTime)` does not.
 *
 * Feed it one sample per input event: coalesced samples would change its
 * timing.
 *
 * SYNC: When modified, update VelocityTracker.test.ts.
 */

import {UIKIT_GESTURES} from '../motion/uikit/gestures';
import type {Point, TouchSample} from './types';

export interface VelocityTrackerOptions {
  /** At most this many samples are kept. */
  maxSamples?: number;
  /**
   * A contact that has not moved for longer than this (ms) before its
   * release releases at 0 (spec:AST-100 FR2).
   */
  stillness?: number;
}

const ZERO: Point = {x: 0, y: 0};

export class VelocityTracker {
  private readonly maxSamples: number;
  private readonly stillness: number;
  private samples: TouchSample[] = [];
  /** When the position last changed (the first sample counts). */
  private lastMoveTime: number | null = null;

  constructor(options: VelocityTrackerOptions = {}) {
    this.maxSamples = Math.max(
      3,
      options.maxSamples ?? UIKIT_GESTURES.velocity.maxSamples.value,
    );
    this.stillness =
      options.stillness ?? UIKIT_GESTURES.velocity.stillness.value;
  }

  /** Forget every sample (a new gesture). */
  reset(): void {
    this.samples = [];
    this.lastMoveTime = null;
  }

  /**
   * Record a position. Timestamps must not go backwards (an older sample is
   * ignored), and a moved sample at the newest moved sample's timestamp
   * replaces it. A sample at the newest position is not motion: it changes
   * no velocity.
   */
  add(x: number, y: number, time: number): void {
    const newest = this.samples[this.samples.length - 1];
    if (newest != null && time <= newest.time) {
      if (time === newest.time) {
        this.samples[this.samples.length - 1] = {x, y, time};
        if (x !== newest.x || y !== newest.y) {
          this.lastMoveTime = time;
        }
      }
      return;
    }
    if (newest == null || x !== newest.x || y !== newest.y) {
      this.lastMoveTime = time;
    }
    this.samples.push({x, y, time});
    if (this.samples.length > this.maxSamples) {
      this.samples.shift();
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
   * The velocity in px/s at the newest sample. Pass the release's event time
   * to read the release velocity: 0 when the contact was still for longer
   * than the stillness interval before it (spec:AST-100 FR2).
   */
  velocity(releaseTime?: number): Point {
    if (
      releaseTime != null &&
      this.lastMoveTime != null &&
      releaseTime - this.lastMoveTime > this.stillness
    ) {
      return ZERO;
    }
    return uikitVelocity(this.samples);
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
    // One interval so far: UIKit reports it whole (a pinch's first value).
    return current;
  }
  const previous = pairVelocity(samples[n - 3], samples[n - 2]);
  return {
    x:
      UIKIT_CURRENT_WEIGHT * current.x +
      (1 - UIKIT_CURRENT_WEIGHT) * previous.x,
    y:
      UIKIT_CURRENT_WEIGHT * current.y +
      (1 - UIKIT_CURRENT_WEIGHT) * previous.y,
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

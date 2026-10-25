// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ScrollViewPanGestureRecognizer.ts
 * @input Touches from a GestureArena
 * @output Exports ScrollViewPanGestureRecognizer, the pan a scroll view
 *   drags with, its options, and ScrollViewRelease, the release smoothing it
 *   applies on top of the one filter
 * @position Continuous recognizer of packages/core/src/gestures: a pan whose
 *   velocity is the one a scroll view releases with
 *
 * UIScrollView drags with its own pan recognizer and, when the finger lifts,
 * hands `scrollViewWillEndDragging` that recognizer's last two velocities
 * blended once more (`velocity.scrollReleaseWeight`, measured).
 * `spec:AST-100` FR2 asks a scrolling surface (paging, a wheel picker) for
 * exactly that release, so a component that behaves like a scroll view reads
 * this recognizer, and coasts as far as UIKit's; anything else reads a plain
 * pan's. The pan's velocity is VelocityTracker's one filter; this adds only
 * the scroll view's blend over its last two values, and the same stillness
 * reset at the release. No option.
 */

import {UIKIT_GESTURES} from '../motion/uikit/gestures';
import {
  PanGestureRecognizer,
  type PanGestureRecognizerOptions,
} from './PanGestureRecognizer';
import type {Point, TouchSample} from './types';
import type {VelocityTracker} from './VelocityTracker';

const SCROLL_RELEASE_WEIGHT = UIKIT_GESTURES.velocity.scrollReleaseWeight.value;
const STILLNESS = UIKIT_GESTURES.velocity.stillness.value;
const ZERO: Point = {x: 0, y: 0};

/**
 * A scroll view's release over a VelocityTracker: told after each sample the
 * tracker takes, it keeps the pan's previous velocity and when the contact
 * last moved, and reads `scroll(n) = w * pan(n) + (1 - w) * pan(n - 1)`
 * (`w` = `velocity.scrollReleaseWeight`); with one interval so far, the
 * pan's value. At the release it is 0 when the contact was still for longer
 * than the stillness interval (spec:AST-100 FR2), the tracker's own rule.
 * @experimental
 */
export class ScrollViewRelease {
  private newest: TouchSample | null = null;
  private samples = 0;
  private panBefore: Point = ZERO;
  private panNow: Point = ZERO;
  private lastMoveTime: number | null = null;

  /** Call after each `tracker.add(...)`. */
  sampled(tracker: VelocityTracker): void {
    const sample = tracker.lastSample;
    if (sample == null) {
      return;
    }
    const previous = this.newest;
    if (previous != null && sample.time === previous.time) {
      // The tracker replaced its newest sample (the same timestamp).
      if (sample.x !== previous.x || sample.y !== previous.y) {
        this.lastMoveTime = sample.time;
      }
    } else {
      if (
        previous == null ||
        sample.x !== previous.x ||
        sample.y !== previous.y
      ) {
        this.lastMoveTime = sample.time;
      }
      this.samples += 1;
      this.panBefore = this.panNow;
    }
    this.newest = sample;
    this.panNow = tracker.velocity();
  }

  /** Forget every sample (with `tracker.reset()`). */
  reset(): void {
    this.newest = null;
    this.samples = 0;
    this.panBefore = ZERO;
    this.panNow = ZERO;
    this.lastMoveTime = null;
  }

  /**
   * The scroll view's velocity in px/s. Pass the release's event time to read
   * its release velocity.
   */
  velocity(tracker: VelocityTracker, releaseTime?: number): Point {
    if (
      releaseTime != null &&
      this.lastMoveTime != null &&
      releaseTime - this.lastMoveTime > STILLNESS
    ) {
      return ZERO;
    }
    const pan = tracker.velocity();
    if (this.samples < 3) {
      return pan;
    }
    return {
      x:
        SCROLL_RELEASE_WEIGHT * pan.x +
        (1 - SCROLL_RELEASE_WEIGHT) * this.panBefore.x,
      y:
        SCROLL_RELEASE_WEIGHT * pan.y +
        (1 - SCROLL_RELEASE_WEIGHT) * this.panBefore.y,
    };
  }
}

/** @experimental */
export type ScrollViewPanGestureRecognizerOptions = PanGestureRecognizerOptions;

/** @experimental */
export class ScrollViewPanGestureRecognizer extends PanGestureRecognizer {
  private readonly release = new ScrollViewRelease();

  /** A scroll view's release: its pan's last two velocities, blended. */
  protected override readVelocity(
    tracker: VelocityTracker,
    releaseTime: number | undefined,
  ): Point {
    return this.release.velocity(tracker, releaseTime);
  }

  protected override sampleAdded(tracker: VelocityTracker): void {
    this.release.sampled(tracker);
  }

  protected override samplesReset(): void {
    this.release.reset();
  }
}

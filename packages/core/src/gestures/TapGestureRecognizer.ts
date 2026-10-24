// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file TapGestureRecognizer.ts
 * @input Touches from a GestureArena
 * @output Exports TapGestureRecognizer (UITapGestureRecognizer) and its options
 * @position Discrete recognizer of packages/core/src/gestures
 *
 * Recognizes when `numberOfTapsRequired` taps of `numberOfTouchesRequired`
 * fingers each have lifted. A tap fails when a finger travels further than
 * `allowableMovement`, when more fingers land than required, when the next
 * tap does not land within `maximumIntervalBetweenTaps` of the previous lift
 * or lands further than `allowableSeparation` from the first, or when a
 * finger stays down longer than `maximumTapDuration`.
 *
 * Between taps the recognizer stays `possible` with no touches, so a single
 * tap that requires a double tap to fail waits the interval out, as in UIKit.
 */

import {UIKIT_GESTURES} from '../motion/uikit/gestures';
import {distance, travel} from './geometry';
import {
  GestureRecognizer,
  MANIPULATION,
  type GestureRecognizerOptions,
  type NativeTouchBehavior,
} from './GestureRecognizer';
import type {GestureEventContext, GestureTouch, Point} from './types';

/** @experimental */
export interface TapGestureRecognizerOptions extends GestureRecognizerOptions<TapGestureRecognizer> {
  /** @default 1 */
  numberOfTapsRequired?: number;
  /** @default 1 */
  numberOfTouchesRequired?: number;
  allowableMovement?: number;
  maximumIntervalBetweenTaps?: number;
  allowableSeparation?: number;
  maximumTapDuration?: number;
}

const TAP = UIKIT_GESTURES.tap;

/** @experimental */
export class TapGestureRecognizer extends GestureRecognizer {
  numberOfTapsRequired: number;
  numberOfTouchesRequired: number;
  allowableMovement: number;
  maximumIntervalBetweenTaps: number;
  allowableSeparation: number;
  maximumTapDuration: number;

  private tapCount = 0;
  private isTapInProgress = false;
  private maxTouchesThisTap = 0;
  private firstTapLocation: Point | null = null;
  /** Where the current tap's fingers landed. */
  private tapStarts: Point[] = [];

  constructor(options: TapGestureRecognizerOptions = {}) {
    super(options);
    this.numberOfTapsRequired = options.numberOfTapsRequired ?? 1;
    this.numberOfTouchesRequired = options.numberOfTouchesRequired ?? 1;
    this.allowableMovement =
      options.allowableMovement ?? TAP.allowableMovement.value;
    this.maximumIntervalBetweenTaps =
      options.maximumIntervalBetweenTaps ??
      TAP.maximumIntervalBetweenTaps.value;
    this.allowableSeparation =
      options.allowableSeparation ?? TAP.allowableSeparation.value;
    this.maximumTapDuration =
      options.maximumTapDuration ?? TAP.maximumTapDuration.value;
  }

  override get isDiscrete(): boolean {
    return true;
  }

  override get nativeTouchBehavior(): NativeTouchBehavior {
    return MANIPULATION;
  }

  /** Taps completed so far in the current sequence. */
  get completedTaps(): number {
    return this.tapCount;
  }

  override isInvolved(): boolean {
    return super.isInvolved() || this.tapCount > 0;
  }

  protected override touchesBegan(
    touches: ReadonlyArray<GestureTouch>,
    event: GestureEventContext,
  ): void {
    if (!this.isTapInProgress) {
      this.isTapInProgress = true;
      this.tapStarts = [];
      this.maxTouchesThisTap = 0;
      this.clearTimer();
      if (Number.isFinite(this.maximumTapDuration)) {
        this.setTimer(event.time + this.maximumTapDuration, () => {
          this.setState('failed');
        });
      }
    }
    for (const touch of touches) {
      this.tapStarts.push({x: touch.startX, y: touch.startY});
    }
    this.maxTouchesThisTap = Math.max(
      this.maxTouchesThisTap,
      this.numberOfTouches,
    );
    if (this.numberOfTouches > this.numberOfTouchesRequired) {
      this.setState('failed');
      return;
    }
    // A later tap lands near the first: centroid against centroid, once its
    // required fingers are down (a two-finger double tap at the same two
    // points matches).
    if (
      this.firstTapLocation != null &&
      this.tapStarts.length === this.numberOfTouchesRequired &&
      distance(centroidOf(this.tapStarts), this.firstTapLocation) >
        this.allowableSeparation
    ) {
      this.setState('failed');
    }
  }

  protected override touchesMoved(touches: ReadonlyArray<GestureTouch>): void {
    if (touches.some(touch => travel(touch) > this.allowableMovement)) {
      this.setState('failed');
    }
  }

  protected override touchesEnded(
    touches: ReadonlyArray<GestureTouch>,
    event: GestureEventContext,
  ): void {
    if (touches.some(touch => travel(touch) > this.allowableMovement)) {
      this.setState('failed');
      return;
    }
    if (this.numberOfTouches - touches.length > 0) {
      // Wait for every finger of this tap to lift.
      return;
    }
    this.isTapInProgress = false;
    this.clearTimer();
    if (this.maxTouchesThisTap !== this.numberOfTouchesRequired) {
      this.setState('failed');
      return;
    }
    this.tapCount += 1;
    this.firstTapLocation ??= centroidOf(this.tapStarts);
    if (this.tapCount >= this.numberOfTapsRequired) {
      this.setState('ended');
      return;
    }
    this.setTimer(event.time + this.maximumIntervalBetweenTaps, () => {
      this.setState('failed');
    });
  }

  protected override reset(): void {
    this.tapCount = 0;
    this.isTapInProgress = false;
    this.maxTouchesThisTap = 0;
    this.firstTapLocation = null;
    this.tapStarts = [];
  }
}

function centroidOf(points: ReadonlyArray<Point>): Point {
  let x = 0;
  let y = 0;
  for (const point of points) {
    x += point.x;
    y += point.y;
  }
  const count = Math.max(1, points.length);
  return {x: x / count, y: y / count};
}

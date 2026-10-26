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
 * finger stays down longer than `maximumTapDuration`. With several fingers a
 * tap is placed at their centroid: the first tap where its fingers lifted,
 * the next where its fingers landed, once all of them have.
 *
 * Between taps the recognizer stays `possible` with no touches, so a single
 * tap that requires a double tap to fail waits the interval out, as in UIKit.
 */

import {UIKIT_TAP} from '../motion/uikit/gestures';
import {distance, travel} from './geometry';
import {
  GestureRecognizer,
  MANIPULATION,
  type GestureRecognizerOptions,
  type NativeTouchBehavior,
} from './GestureRecognizer';
import type {GestureEventContext, GestureTouch, Point} from './types';

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

const TAP = UIKIT_TAP;

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
  /** Where the first tap's fingers lifted: their centroid. */
  private firstTapLocation: Point | null = null;
  /** The current tap's fingers: where each landed and where each lifted. */
  private tapStarts = new Map<number, Point>();
  private tapLifts = new Map<number, Point>();

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
      this.tapStarts.clear();
      this.tapLifts.clear();
      this.maxTouchesThisTap = 0;
      this.clearTimer();
      if (Number.isFinite(this.maximumTapDuration)) {
        this.setTimer(event.time + this.maximumTapDuration, () => {
          this.setState('failed');
        });
      }
    }
    for (const touch of touches) {
      this.tapStarts.set(touch.id, {x: touch.startX, y: touch.startY});
    }
    this.maxTouchesThisTap = Math.max(
      this.maxTouchesThisTap,
      this.numberOfTouches,
    );
    if (this.numberOfTouches > this.numberOfTouchesRequired) {
      this.setState('failed');
      return;
    }
    // A later tap must land near the first: compared once all of its
    // fingers have landed, centroid to centroid.
    if (
      this.firstTapLocation != null &&
      this.tapStarts.size === this.numberOfTouchesRequired &&
      distance(centerOf(this.tapStarts.values()), this.firstTapLocation) >
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
    for (const touch of touches) {
      this.tapLifts.set(touch.id, {x: touch.x, y: touch.y});
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
    this.firstTapLocation ??= centerOf(this.tapLifts.values());
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
    this.tapStarts.clear();
    this.tapLifts.clear();
  }
}

/** The centroid of some points. */
function centerOf(points: Iterable<Point>): Point {
  let x = 0;
  let y = 0;
  let count = 0;
  for (const point of points) {
    x += point.x;
    y += point.y;
    count += 1;
  }
  return count === 0 ? {x: 0, y: 0} : {x: x / count, y: y / count};
}

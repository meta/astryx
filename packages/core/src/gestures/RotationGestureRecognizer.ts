// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file RotationGestureRecognizer.ts
 * @input Touches from a GestureArena
 * @output Exports RotationGestureRecognizer (UIRotationGestureRecognizer)
 *   and its options
 * @position Continuous two-finger recognizer of packages/core/src/gestures
 *
 * Tracks the first two fingers. Begins once the line between them has turned
 * `hysteresis` radians. `rotation` is the angle turned since they landed,
 * unwrapped (it keeps counting past half a turn), clockwise positive in
 * screen coordinates as in UIKit; `velocity` is radians per second.
 */

import {UIKIT_GESTURES} from '../motion/uikit/gestures';
import {angleBetween, centroid, unwrapAngle} from './geometry';
import {
  GestureRecognizer,
  isActive,
  type GestureRecognizerOptions,
  type NativeTouchBehavior,
} from './GestureRecognizer';
import type {GestureEventContext, GestureTouch, Point} from './types';
import {VelocityTracker} from './VelocityTracker';

/** @experimental */
export interface RotationGestureRecognizerOptions extends GestureRecognizerOptions<RotationGestureRecognizer> {
  hysteresis?: number;
}

/** @experimental */
export class RotationGestureRecognizer extends GestureRecognizer {
  hysteresis: number;
  private initialAngle = 0;
  private lastAngle = 0;
  private rotationValue = 0;
  private readonly tracker = new VelocityTracker();

  constructor(options: RotationGestureRecognizerOptions = {}) {
    super(options);
    this.hysteresis =
      options.hysteresis ?? UIKIT_GESTURES.rotation.hysteresis.value;
  }

  /** Radians turned since the fingers landed (or since the last set). */
  get rotation(): number {
    return this.rotationValue;
  }

  set rotation(value: number) {
    this.initialAngle = this.lastAngle - value;
    this.rotationValue = value;
  }

  /** Radians per second. */
  get velocity(): number {
    return this.tracker.velocity().x;
  }

  focalPoint(): Point {
    return centroid(this.touches.values());
  }

  /** Two fingers on this view are this recognizer's, not the browser's zoom. */
  override get nativeTouchBehavior(): NativeTouchBehavior {
    return {panX: true, panY: true, pinchZoom: false, doubleTapZoom: false};
  }

  protected override acceptsTouch(touch: GestureTouch): boolean {
    return this.numberOfTouches < 2 && super.acceptsTouch(touch);
  }

  protected override touchesBegan(
    _touches: ReadonlyArray<GestureTouch>,
    event: GestureEventContext,
  ): void {
    if (this.numberOfTouches === 2) {
      const [a, b] = this.trackedTouches;
      this.initialAngle = angleBetween(a, b);
      this.lastAngle = this.initialAngle;
      this.rotationValue = 0;
      this.tracker.reset();
      this.tracker.add(0, 0, event.time);
    }
  }

  protected override touchesMoved(
    _touches: ReadonlyArray<GestureTouch>,
    event: GestureEventContext,
  ): void {
    if (this.numberOfTouches < 2) {
      return;
    }
    const [a, b] = this.trackedTouches;
    this.lastAngle = unwrapAngle(angleBetween(a, b), this.lastAngle);
    this.rotationValue = this.lastAngle - this.initialAngle;
    this.tracker.add(this.rotationValue, 0, event.time);
    if (this.state === 'possible') {
      if (Math.abs(this.rotationValue) >= this.hysteresis) {
        this.setState('began');
      }
    } else if (isActive(this.state)) {
      this.setState('changed');
    }
  }

  protected override touchesEnded(): void {
    this.setState(isActive(this.state) ? 'ended' : 'failed');
  }

  protected override reset(): void {
    this.initialAngle = 0;
    this.lastAngle = 0;
    this.rotationValue = 0;
    this.tracker.reset();
  }
}

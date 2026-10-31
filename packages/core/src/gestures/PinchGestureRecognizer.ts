// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file PinchGestureRecognizer.ts
 * @input Touches from a GestureArena
 * @output Exports PinchGestureRecognizer (UIPinchGestureRecognizer) and its
 *   options
 * @position Continuous two-finger recognizer of packages/core/src/gestures
 *
 * Tracks the first two fingers; more are ignored. Begins once the distance
 * between them has changed by `hysteresis` px. As in UIKit, `scale` is then
 * the current distance over the starting distance moved by the hysteresis
 * toward the pinch, so it does not jump (settable to re-base it); `velocity`
 * is scale per second. Lifting either finger ends an
 * active pinch and fails a possible one.
 *
 * A host gives every element WITHOUT a pinch recognizer `pinch-zoom` in its
 * `touch-action`, so the page stays zoomable (WCAG 1.4.4); attaching one
 * takes the two-finger gesture for this element only.
 */

import {UIKIT_PINCH} from '../motion/uikit/gestures';
import {centroid, distance} from './geometry';
import {
  GestureRecognizer,
  isActive,
  type GestureRecognizerOptions,
  type NativeTouchBehavior,
} from './GestureRecognizer';
import type {GestureEventContext, GestureTouch, Point} from './types';
import {VelocityTracker} from './VelocityTracker';

export interface PinchGestureRecognizerOptions extends GestureRecognizerOptions<PinchGestureRecognizer> {
  hysteresis?: number;
}

export class PinchGestureRecognizer extends GestureRecognizer {
  override get kind(): GestureRecognizer['kind'] {
    return 'pinch';
  }

  hysteresis: number;
  private initialSpan = 0;
  private scaleValue = 1;
  private readonly tracker = new VelocityTracker();
  private lastTime = 0;

  constructor(options: PinchGestureRecognizerOptions = {}) {
    super(options);
    this.hysteresis = options.hysteresis ?? UIKIT_PINCH.hysteresis.value;
  }

  /** Current span over the span the fingers started at. */
  get scale(): number {
    return this.scaleValue;
  }

  /** Re-base: from now on the scale reads `value` at the current span. */
  set scale(value: number) {
    const span = this.span();
    if (span > 0 && value > 0) {
      this.initialSpan = span / value;
      this.scaleValue = value;
      // The velocity continues from the re-based value, without a jump.
      this.tracker.reset();
      this.tracker.add(value, 0, this.lastTime);
    }
  }

  /** Scale per second (UIKit's filter; measured for pans, assumed here). */
  get velocity(): number {
    return this.tracker.velocity().x;
  }

  /** The midpoint between the two fingers. */
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
    this.lastTime = event.time;
    if (this.numberOfTouches === 2) {
      this.initialSpan = this.span();
      this.scaleValue = 1;
      this.tracker.reset();
      this.tracker.add(1, 0, event.time);
    }
  }

  protected override touchesMoved(
    _touches: ReadonlyArray<GestureTouch>,
    event: GestureEventContext,
  ): void {
    if (this.numberOfTouches < 2 || this.initialSpan <= 0) {
      return;
    }
    this.lastTime = event.time;
    const span = this.span();
    // Once recognized, a pinch waiting on a recognizer it requires to fail
    // keeps its re-based start: its moves only follow the fingers.
    if (this.state === 'possible' && this.pending == null) {
      if (Math.abs(span - this.initialSpan) >= this.hysteresis) {
        // UIKit measures from the start moved by the hysteresis, and its
        // first velocity spans from the touch-down (scale 1) to here.
        this.initialSpan +=
          Math.sign(span - this.initialSpan) * this.hysteresis;
        this.scaleValue = span / this.initialSpan;
        this.tracker.add(this.scaleValue, 0, event.time);
        this.setState('began');
      }
      return;
    }
    this.scaleValue = span / this.initialSpan;
    // Every move of the fingers is a sample: a span that holds while they
    // move reads as no change, so the velocity never goes stale.
    this.tracker.add(this.scaleValue, 0, event.time, {isMotion: true});
    if (isActive(this.state)) {
      this.setState('changed');
    }
  }

  protected override touchesEnded(): void {
    this.setState(isActive(this.state) ? 'ended' : 'failed');
  }

  protected override reset(): void {
    this.initialSpan = 0;
    this.scaleValue = 1;
    this.tracker.reset();
  }

  private span(): number {
    const [a, b] = this.trackedTouches;
    return a == null || b == null ? 0 : distance(a, b);
  }
}

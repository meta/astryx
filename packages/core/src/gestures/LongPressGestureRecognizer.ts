// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file LongPressGestureRecognizer.ts
 * @input Touches from a GestureArena
 * @output Exports LongPressGestureRecognizer (UILongPressGestureRecognizer)
 *   and its options
 * @position Continuous recognizer of packages/core/src/gestures
 *
 * Begins once `numberOfTouchesRequired` fingers have stayed down for
 * `minimumPressDuration` without any of them travelling further than
 * `allowableMovement` (after `numberOfTapsRequired` quick taps, when set).
 * After it begins, movement is unlimited and reports `changed`; lifting a
 * finger ends it. Lifting or travelling before the duration fails it. With a
 * duration of zero it begins on the touch itself, in the same event, as
 * UIKit's does: the selection tracker of an alert's, a menu's or an action
 * sheet's actions (highlight under the finger, act on the lift).
 *
 * The begin time is exact: the duration is a deadline on the event clock, so
 * a blocked main thread delays the callback, not the moment it reports.
 */

import {UIKIT_LONG_PRESS, UIKIT_TAP} from '../motion/uikit/gestures';
import {travel} from './geometry';
import {
  GestureRecognizer,
  isActive,
  MANIPULATION,
  type GestureRecognizerOptions,
  type NativeTouchBehavior,
} from './GestureRecognizer';
import type {GestureEventContext, GestureTouch} from './types';

export interface LongPressGestureRecognizerOptions extends GestureRecognizerOptions<LongPressGestureRecognizer> {
  minimumPressDuration?: number;
  allowableMovement?: number;
  /** Quick taps before the press. @default 0 */
  numberOfTapsRequired?: number;
  /** @default 1 */
  numberOfTouchesRequired?: number;
}

export class LongPressGestureRecognizer extends GestureRecognizer {
  minimumPressDuration: number;
  allowableMovement: number;
  numberOfTapsRequired: number;
  numberOfTouchesRequired: number;

  private tapsDone = 0;
  /** The taps phase's current tap: when it landed and its most fingers. */
  private tapStartedAt: number | null = null;
  private tapMostTouches = 0;
  private isPressTimerArmed = false;
  /** When the gesture began, on the event clock. */
  beganAt: number | null = null;

  constructor(options: LongPressGestureRecognizerOptions = {}) {
    super(options);
    this.minimumPressDuration =
      options.minimumPressDuration ??
      UIKIT_LONG_PRESS.minimumPressDuration.value;
    this.allowableMovement =
      options.allowableMovement ?? UIKIT_LONG_PRESS.allowableMovement.value;
    this.numberOfTapsRequired = options.numberOfTapsRequired ?? 0;
    this.numberOfTouchesRequired = options.numberOfTouchesRequired ?? 1;
  }

  override isInvolved(): boolean {
    return super.isInvolved() || this.tapsDone > 0;
  }

  override get nativeTouchBehavior(): NativeTouchBehavior {
    return MANIPULATION;
  }

  protected override acceptsTouch(touch: GestureTouch): boolean {
    // Extra fingers after the press began do not end or move it.
    if (isActive(this.state)) {
      return false;
    }
    return super.acceptsTouch(touch);
  }

  protected override touchesBegan(
    _touches: ReadonlyArray<GestureTouch>,
    event: GestureEventContext,
  ): void {
    if (this.numberOfTouches > this.numberOfTouchesRequired) {
      this.setState('failed');
      return;
    }
    if (this.tapsDone > 0) {
      // The next tap (or the press) landed in time.
      this.clearTimer();
    }
    if (this.tapsDone < this.numberOfTapsRequired) {
      this.tapStartedAt ??= event.time;
      this.tapMostTouches = Math.max(this.tapMostTouches, this.numberOfTouches);
    }
    if (
      this.numberOfTouches === this.numberOfTouchesRequired &&
      this.tapsDone >= this.numberOfTapsRequired
    ) {
      if (this.minimumPressDuration <= 0) {
        // UIKit's zero-duration press begins on the touch itself, in the
        // same event (a selection tracker over a group of actions).
        this.beganAt = event.time;
        this.setState('began');
        return;
      }
      this.isPressTimerArmed = true;
      this.setTimer(event.time + this.minimumPressDuration, () => {
        this.isPressTimerArmed = false;
        if (
          this.state === 'possible' &&
          this.numberOfTouches === this.numberOfTouchesRequired
        ) {
          this.beganAt = this.now();
          this.setState('began');
        }
      });
    }
  }

  protected override touchesMoved(touches: ReadonlyArray<GestureTouch>): void {
    if (this.state === 'possible') {
      if (touches.some(touch => travel(touch) > this.allowableMovement)) {
        this.setState('failed');
      }
      return;
    }
    if (isActive(this.state)) {
      this.setState('changed');
    }
  }

  protected override touchesEnded(
    touches: ReadonlyArray<GestureTouch>,
    event: GestureEventContext,
  ): void {
    if (isActive(this.state)) {
      this.setState('ended');
      return;
    }
    if (this.isPressTimerArmed || this.tapsDone >= this.numberOfTapsRequired) {
      // Lifted before the duration: not a long press.
      this.setState('failed');
      return;
    }
    if (this.numberOfTouches - touches.length > 0) {
      return;
    }
    // A completed tap of the taps phase: quick, and with the press's finger
    // count, as a tap recognizer's would be. GUESS: its hold limit and
    // interval are the tap recognizer's (UIKit's measured
    // `maximumTapDuration` and `maximumIntervalBetweenTaps`), until
    // measurement M-G20 (motion/MEASUREMENTS.md) reads
    // UILongPressGestureRecognizer's own.
    const heldFor = event.time - (this.tapStartedAt ?? event.time);
    const fingers = this.tapMostTouches;
    this.tapStartedAt = null;
    this.tapMostTouches = 0;
    if (
      heldFor > UIKIT_TAP.maximumTapDuration.value ||
      fingers !== this.numberOfTouchesRequired
    ) {
      this.setState('failed');
      return;
    }
    this.tapsDone += 1;
    this.setTimer(
      event.time + UIKIT_TAP.maximumIntervalBetweenTaps.value,
      () => {
        this.setState('failed');
      },
    );
  }

  protected override reset(): void {
    this.tapsDone = 0;
    this.tapStartedAt = null;
    this.tapMostTouches = 0;
    this.isPressTimerArmed = false;
    this.beganAt = null;
  }
}

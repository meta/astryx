// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file SwipeGestureRecognizer.ts
 * @input Touches from a GestureArena
 * @output Exports SwipeGestureRecognizer (UISwipeGestureRecognizer), its
 *   options and direction type
 * @position Discrete recognizer of packages/core/src/gestures
 *
 * Recognized WHILE the fingers move, as UIKit's is: as soon as the centroid
 * has travelled `minimumDistance` along an allowed direction, within
 * `maximumDuration` of touch-down, with off-axis travel no more than
 * `maximumSecondaryMovement` px across it. Travel that clears the distance in no allowed
 * direction fails it, as do too many fingers, the duration running out, and
 * a lift before it was recognized.
 */

import {UIKIT_GESTURES} from '../motion/uikit/gestures';
import {centroid} from './geometry';
import {
  GestureRecognizer,
  type GestureRecognizerOptions,
  type NativeTouchBehavior,
} from './GestureRecognizer';
import type {GestureEventContext, GestureTouch, Point} from './types';

/** @experimental */
export type SwipeDirection = 'left' | 'right' | 'up' | 'down';

/** @experimental */
export interface SwipeGestureRecognizerOptions extends GestureRecognizerOptions<SwipeGestureRecognizer> {
  /** @default ['right'] */
  direction?: SwipeDirection | ReadonlyArray<SwipeDirection>;
  /** @default 1 */
  numberOfTouchesRequired?: number;
  minimumDistance?: number;
  maximumDuration?: number;
  maximumSecondaryMovement?: number;
}

const SWIPE = UIKIT_GESTURES.swipe;

/** @experimental */
export class SwipeGestureRecognizer extends GestureRecognizer {
  directions: ReadonlyArray<SwipeDirection>;
  numberOfTouchesRequired: number;
  minimumDistance: number;
  maximumDuration: number;
  maximumSecondaryMovement: number;
  /** The direction of the recognized swipe. */
  recognizedDirection: SwipeDirection | null = null;

  private origin: Point = {x: 0, y: 0};

  constructor(options: SwipeGestureRecognizerOptions = {}) {
    super(options);
    const direction = options.direction ?? ['right'];
    this.directions = typeof direction === 'string' ? [direction] : direction;
    this.numberOfTouchesRequired = options.numberOfTouchesRequired ?? 1;
    this.minimumDistance =
      options.minimumDistance ?? SWIPE.minimumDistance.value;
    this.maximumDuration =
      options.maximumDuration ?? SWIPE.maximumDuration.value;
    this.maximumSecondaryMovement =
      options.maximumSecondaryMovement ?? SWIPE.maximumSecondaryMovement.value;
  }

  override get isDiscrete(): boolean {
    return true;
  }

  override get nativeTouchBehavior(): NativeTouchBehavior {
    const horizontal = this.directions.some(
      direction => direction === 'left' || direction === 'right',
    );
    const vertical = this.directions.some(
      direction => direction === 'up' || direction === 'down',
    );
    return {
      panX: !horizontal,
      panY: !vertical,
      pinchZoom: true,
      doubleTapZoom: false,
    };
  }

  protected override touchesBegan(
    touches: ReadonlyArray<GestureTouch>,
    event: GestureEventContext,
  ): void {
    if (this.numberOfTouches > this.numberOfTouchesRequired) {
      this.setState('failed');
      return;
    }
    if (this.numberOfTouches === touches.length) {
      this.setTimer(event.time + this.maximumDuration, () => {
        this.setState('failed');
      });
    }
    // Measure from where every required finger is down.
    this.origin = centroid(this.touches.values());
  }

  protected override touchesMoved(): void {
    if (this.numberOfTouches !== this.numberOfTouchesRequired) {
      return;
    }
    const current = centroid(this.touches.values());
    const dx = current.x - this.origin.x;
    const dy = current.y - this.origin.y;
    let isReachable = false;
    for (const direction of this.directions) {
      const [along, across] =
        direction === 'left'
          ? [-dx, dy]
          : direction === 'right'
            ? [dx, dy]
            : direction === 'up'
              ? [-dy, dx]
              : [dy, dx];
      if (Math.abs(across) > this.maximumSecondaryMovement) {
        continue;
      }
      if (along >= this.minimumDistance) {
        this.recognizedDirection = direction;
        this.setState('ended');
        return;
      }
      // Still reachable unless the drag has run the other way.
      if (along > -this.maximumSecondaryMovement) {
        isReachable = true;
      }
    }
    // Fails only once no allowed direction can still be reached, so the
    // same drag gives the same answer however its events are spaced.
    if (!isReachable) {
      this.setState('failed');
    }
  }

  protected override touchesEnded(): void {
    this.setState('failed');
  }

  protected override reset(): void {
    this.recognizedDirection = null;
    this.origin = {x: 0, y: 0};
  }
}

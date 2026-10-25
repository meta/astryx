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
 * `maximumSecondaryMovement` px across it. Off-axis travel past that
 * allowance, or the distance travelled the wrong way, rules a direction out;
 * the swipe fails once every allowed direction is ruled out, as it does for
 * too many fingers, the duration running out, and a lift before it was
 * recognized.
 */

import {UIKIT_GESTURES} from '../motion/uikit/gestures';
import {centroid} from './geometry';
import {
  GestureRecognizer,
  type GestureRecognizerOptions,
  type NativeTouchBehavior,
} from './GestureRecognizer';
import type {GestureEventContext, GestureTouch, Point} from './types';

export type SwipeDirection = 'left' | 'right' | 'up' | 'down';

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

export class SwipeGestureRecognizer extends GestureRecognizer {
  directions: ReadonlyArray<SwipeDirection>;
  numberOfTouchesRequired: number;
  minimumDistance: number;
  maximumDuration: number;
  maximumSecondaryMovement: number;
  /** The direction of the recognized swipe. */
  recognizedDirection: SwipeDirection | null = null;

  private origin: Point = {x: 0, y: 0};
  /** Directions this touch's path has ruled out. */
  private readonly ruledOut = new Set<SwipeDirection>();

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
    for (const direction of this.directions) {
      const [along, across] =
        direction === 'left'
          ? [-dx, dy]
          : direction === 'right'
            ? [dx, dy]
            : direction === 'up'
              ? [-dy, dx]
              : [dy, dx];
      if (this.ruledOut.has(direction)) {
        continue;
      }
      // Off-axis travel past the allowance, or the distance the wrong way,
      // rules a direction out for good, so the verdict follows the path and
      // not how far apart the events were.
      if (
        Math.abs(across) > this.maximumSecondaryMovement ||
        along <= -this.minimumDistance
      ) {
        this.ruledOut.add(direction);
        continue;
      }
      if (along >= this.minimumDistance) {
        this.recognizedDirection = direction;
        this.setState('ended');
        return;
      }
    }
    if (this.directions.every(direction => this.ruledOut.has(direction))) {
      this.setState('failed');
    }
  }

  protected override touchesEnded(): void {
    this.setState('failed');
  }

  protected override reset(): void {
    this.recognizedDirection = null;
    this.ruledOut.clear();
    this.origin = {x: 0, y: 0};
  }
}

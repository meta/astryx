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

import {UIKIT_SWIPE} from '../motion/uikit/gestures';
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

const SWIPE = UIKIT_SWIPE;

export class SwipeGestureRecognizer extends GestureRecognizer {
  override get kind(): GestureRecognizer['kind'] {
    return 'swipe';
  }

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
  /** The centroid at the previous move. */
  private last: Point | null = null;

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
        // A swipe already recognized, waiting on a recognizer it requires to
        // fail, holds its recognition (spec:AST-094 FR15).
        if (this.pending == null) {
          this.setState('failed');
        }
      });
    }
    // Measure from where every required finger is down.
    this.origin = centroid(this.touches.values());
    this.last = null;
  }

  protected override touchesMoved(): void {
    if (
      this.pending != null ||
      this.numberOfTouches !== this.numberOfTouchesRequired
    ) {
      return;
    }
    const current = centroid(this.touches.values());
    const from = this.last ?? this.origin;
    this.last = current;
    for (const direction of this.directions) {
      if (this.ruledOut.has(direction)) {
        continue;
      }
      // Along and across this direction at the start and the end of the
      // move. The path between two events is read as a straight segment, so
      // the verdict does not depend on how far apart the events were.
      const [along0, across0] = this.project(direction, from);
      const [along1, across1] = this.project(direction, current);
      const reaches = segmentCrossing(along0, along1, this.minimumDistance);
      const strays = Math.max(
        segmentCrossing(across0, across1, this.maximumSecondaryMovement),
        segmentCrossing(-across0, -across1, this.maximumSecondaryMovement),
      );
      const strayAt = strays < 0 ? Infinity : strays;
      if (reaches >= 0 && reaches <= strayAt) {
        this.recognizedDirection = direction;
        this.setState('ended');
        return;
      }
      // Off-axis travel past the allowance, or the distance the wrong way,
      // rules a direction out for good.
      if (strays >= 0 || along1 <= -this.minimumDistance) {
        this.ruledOut.add(direction);
      }
    }
    if (this.directions.every(direction => this.ruledOut.has(direction))) {
      this.setState('failed');
    }
  }

  /** Travel along and across `direction` from the origin to `point`. */
  private project(direction: SwipeDirection, point: Point): [number, number] {
    const dx = point.x - this.origin.x;
    const dy = point.y - this.origin.y;
    return direction === 'left'
      ? [-dx, dy]
      : direction === 'right'
        ? [dx, dy]
        : direction === 'up'
          ? [-dy, dx]
          : [dy, dx];
  }

  protected override touchesEnded(): void {
    // Recognized and waiting, it holds past the lift (FR15).
    if (this.pending == null) {
      this.setState('failed');
    }
  }

  protected override reset(): void {
    this.recognizedDirection = null;
    this.ruledOut.clear();
    this.last = null;
    this.origin = {x: 0, y: 0};
  }
}

/**
 * Where on the segment from `start` to `end` (0 to 1) the value first
 * reaches `limit`; 0 when it starts there, -1 when it never does.
 */
function segmentCrossing(start: number, end: number, limit: number): number {
  if (start >= limit) {
    return 0;
  }
  if (end < limit) {
    return -1;
  }
  return (limit - start) / (end - start);
}

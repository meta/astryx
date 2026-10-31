// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file geometry.ts
 * @input Touches
 * @output Exports the small geometry helpers recognizers share: centroid,
 *   distance, span and angle of two touches, angle unwrapping
 * @position Pure helpers under packages/core/src/gestures
 */

import type {GestureTouch, Point} from './types';

export function centroid(
  touches: Iterable<GestureTouch>,
  excluding?: ReadonlySet<number>,
): Point {
  let x = 0;
  let y = 0;
  let count = 0;
  for (const touch of touches) {
    if (excluding?.has(touch.id)) {
      continue;
    }
    x += touch.x;
    y += touch.y;
    count += 1;
  }
  return count === 0 ? {x: 0, y: 0} : {x: x / count, y: y / count};
}

export function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** How far a touch is from where it landed. */
export function travel(touch: GestureTouch): number {
  return Math.hypot(touch.x - touch.startX, touch.y - touch.startY);
}

/** The angle of the vector from the first touch to the second, radians. */
export function angleBetween(a: Point, b: Point): number {
  return Math.atan2(b.y - a.y, b.x - a.x);
}

/** `angle` shifted by whole turns to be within half a turn of `reference`. */
export function unwrapAngle(angle: number, reference: number): number {
  let result = angle;
  while (result - reference > Math.PI) {
    result -= 2 * Math.PI;
  }
  while (result - reference < -Math.PI) {
    result += 2 * Math.PI;
  }
  return result;
}

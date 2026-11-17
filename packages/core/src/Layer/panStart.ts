// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file panStart.ts
 * @input Where a press went down, and a later point of the same press
 * @output hasPanBegun: whether the press has moved past UIKit's pan
 *   hysteresis along either axis
 * @position Internal leaf of the Layer module, shared by the outside-press
 *   watch (outsidePress.ts) and the input hold's `'outside'` scope, which a
 *   menu passes it to
 */

import {UIKIT_PAN} from '../motion/uikit/gestures';

/** Whether a press that went down at `start` has begun to pan at `point`. */
export function hasPanBegun(
  start: {readonly x: number; readonly y: number},
  point: {readonly clientX: number; readonly clientY: number},
): boolean {
  return (
    Math.max(
      Math.abs(point.clientX - start.x),
      Math.abs(point.clientY - start.y),
    ) >= UIKIT_PAN.hysteresis.value
  );
}

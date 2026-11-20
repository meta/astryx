// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file busyMotionJudge.ts
 * @input The alert region's mean luma per screencast frame, and the compositor control's box in the same frames
 * @output judgeAgainstControl: frames the control moved, frames the alert missed, and the longest stall of each
 * @position Shared by the AlertDialog busy-main-thread motion proof and its unit tests
 */

import type {TrackedFrame} from '@astryxdesign/interaction-harness';

/**
 * The smallest change in the alert region's mean luma that counts as motion.
 * The cast is lossless, so a frame that repeats the alert's pixels reads the
 * same mean luma exactly. A cut near zero therefore tells a frozen alert from
 * a slow one. The proof draws the alert so that the region follows the
 * alert's opacity alone and has no stationary point: a moving alert changes
 * the mean by about 1.4 or more on every frame, far above the cut.
 */
export const ALERT_MOTION_LUMA = 0.005;

/**
 * Judges the alert against the compositor control in one busy window. Both
 * are read from the same screencast frames. The alert changes on every frame
 * the control moved, and stalls no longer than the control does. On a
 * two-core runner the block's spin starves the compositor and the screencast
 * alike, so a frame rate is no reference there.
 */
export function judgeAgainstControl(
  alert: ReadonlyArray<{t: number; luma: number}>,
  control: ReadonlyArray<Pick<TrackedFrame, 'box'>>,
  window: {from: number; to: number},
) {
  let controlMoved = 0;
  let missed = 0;
  let alertStall = 0;
  let controlStall = 0;
  let longestAlertStall = 0;
  let longestControlStall = 0;
  for (let i = 1; i < alert.length; i += 1) {
    if (alert[i].t < window.from || alert[i].t > window.to) {
      continue;
    }
    const before = control[i - 1].box;
    const now = control[i].box;
    const controlMoves =
      before != null && now != null && Math.abs(now.x - before.x) > 0.5;
    const alertMoves =
      Math.abs(alert[i].luma - alert[i - 1].luma) > ALERT_MOTION_LUMA;
    controlStall = controlMoves ? 0 : controlStall + 1;
    alertStall = alertMoves ? 0 : alertStall + 1;
    longestControlStall = Math.max(longestControlStall, controlStall);
    longestAlertStall = Math.max(longestAlertStall, alertStall);
    if (controlMoves) {
      controlMoved += 1;
      if (!alertMoves) {
        missed += 1;
      }
    }
  }
  return {controlMoved, missed, longestAlertStall, longestControlStall};
}

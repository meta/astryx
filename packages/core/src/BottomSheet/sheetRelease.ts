// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file sheetRelease.ts
 * @input The UIKit constants table (`sheet.release`, the sheet springs) and
 *   the motion foundation's snap-point projection
 * @output Exports resolveSheetRelease, which says where a released sheet goes
 *   and on which spring under a finger; resolveDefaultRelease, today's rule
 *   everywhere else; and the SheetRelease type
 * @position Internal to BottomSheet; pure (no DOM, no React). Called by
 *   useSheetGestures when a drag ends.
 *
 * Under a finger (a coarse primary pointer, `readTouchPresentation`), a
 * released sheet goes where UISheetPresentationController sends it. The
 * dismissed position (the sheet fully below the screen) counts as one of the
 * positions.
 * - Below `sheet.release.fastSpeed`, to the position nearest its release
 *   offset projected `sheet.release.projectionSeconds` ahead at the release
 *   velocity. Below `sheet.release.minProjectionSpeed` nothing is
 *   projected: it lands on whatever is nearest where it was let go; at
 *   rest the sheet dismisses once it is more than halfway from its
 *   shortest detent to gone. A sheet released just above a detent while
 *   moving up, but slowly, falls back to it.
 * - From that speed on, a flick: at least to the next position beyond where
 *   it is, in its direction (on a position within
 *   `sheet.release.detentTolerance`, the one after it), or to the
 *   projection's nearest position if that is farther.
 * - Either way, a release whose velocity points back toward where the
 *   drag began cancels, to the detent nearest that start, whatever the
 *   travel so far (spec:AST-094 FR37): a cancel commits nothing, so it never
 *   dismisses, even for a drag begun where a finger caught the sheet near
 *   gone. UIKit's own sheet does not: measured, a
 *   back-out let go below 250 pt/s settles where it is nearest (sheet.ts).
 *
 * The sheet gets there on UIKit's release spring, picked by the same speed
 * (critically damped below it, 80 % damped from it on), and starting at the
 * finger's velocity.
 *
 * Offsets are px down from the tallest detent (0 = fully open), velocities
 * px/s with positive meaning downward, as useSheetGestures measures them.
 *
 * SYNC: When modified, update these files to stay in sync:
 * - /packages/core/src/BottomSheet/sheetRelease.test.ts
 * - /packages/core/src/BottomSheet/useSheetGestures.ts
 */

import {selectSnapPoint} from '../motion/projection';
import type {SpringDescription} from '../motion/spring';
import {sheet} from '../motion/uikit/sheet';
import {
  SHEET_DETENT_SPRING,
  SHEET_DISMISS_SWIPE_SPRING,
  SHEET_RELEASE_FAST_SPRING,
} from '../motion/uikit/springs';
import {resolveSettleOffset} from './snapOffsets';

export interface SheetRelease {
  /** A detent to settle on, or a dismissal. */
  kind: 'detent' | 'dismiss';
  /** Index into the detents passed in; -1 for a dismissal. */
  index: number;
  /** Where the sheet goes: the detent's offset, or the dismissed offset. */
  offset: number;
  /** The projected rest offset the choice was made from. */
  projected: number;
  /** The spring that takes it there, handed the release velocity. */
  spring: SpringDescription;
}

/** The deceleration rate whose projection reaches `seconds` of the velocity. */
function rateForProjection(seconds: number): number {
  // WWDC18's projection coasts (v / 1000) · r / (1 − r): r / (1 − r) = 1000·τ.
  const ms = seconds * 1000;
  return ms / (1 + ms);
}

const PROJECTION_RATE = rateForProjection(sheet.release.projectionSeconds);

/** The index of the position nearest `offset` (the first on a tie). */
function nearestIndex(
  positions: ReadonlyArray<number>,
  offset: number,
): number {
  let best = 0;
  for (let i = 1; i < positions.length; i += 1) {
    if (Math.abs(positions[i] - offset) < Math.abs(positions[best] - offset)) {
      best = i;
    }
  }
  return best;
}

/**
 * Where a sheet released at `position` moving at `velocity` settles, and on
 * which spring.
 *
 * @example
 * ```
 * // Detents at 0 (open) and 300 px; gone at 640 px. Released at 300 px
 * // moving down at 1200 px/s: a flick, so past the 300 px detent it is on
 * // to the next position down, although its projection (420 px) is nearer
 * // 300.
 * resolveSheetRelease({
 *   detents: [0, 300],
 *   dismissedOffset: 640,
 *   position: 300,
 *   velocity: 1200,
 *   start: 0,
 * }); // {kind: 'dismiss', offset: 640, spring: SHEET_DISMISS_SWIPE_SPRING, …}
 * ```
 */
export function resolveSheetRelease({
  detents,
  dismissedOffset,
  position,
  velocity,
  start,
}: {
  /** Detent offsets, ascending (the tallest first). */
  detents: ReadonlyArray<number>;
  /** The offset at which the sheet is fully off screen; null when a drag may not dismiss it. */
  dismissedOffset: number | null;
  position: number;
  velocity: number;
  /**
   * Where the drag began (a detent, or where a finger caught the sheet): a
   * release moving back toward it cancels (FR37). Every drag has one, so it
   * is required: leaving it out cannot skip the cancel.
   */
  start: number;
}): SheetRelease {
  if (detents.length === 0) {
    throw new RangeError('resolveSheetRelease needs at least one detent');
  }
  const positions =
    dismissedOffset == null ? [...detents] : [...detents, dismissedOffset];
  // Below the slowest projected speed the release is where it was let go.
  const projectedVelocity =
    Math.abs(velocity) < sheet.release.minProjectionSpeed ? 0 : velocity;
  const choice = selectSnapPoint(positions, {
    position,
    velocity: projectedVelocity,
    rate: PROJECTION_RATE,
  });
  const isFast = Math.abs(velocity) >= sheet.release.fastSpeed;
  let index = choice.index;
  if (isFast) {
    // A flick goes at least to the next position beyond where it is.
    const tolerance = sheet.release.detentTolerance;
    let next = -1;
    if (velocity > 0) {
      next = positions.findIndex(p => p > position + tolerance);
    } else {
      for (let i = positions.length - 1; i >= 0 && next === -1; i -= 1) {
        if (positions[i] < position - tolerance) {
          next = i;
        }
      }
    }
    if (next !== -1 && (velocity > 0 ? next > index : next < index)) {
      index = next;
    }
  }
  // spec:AST-094 FR37: a release whose velocity points back toward where
  // the drag began cancels, whatever the travel so far, to the detent nearest
  // that start. A cancel commits nothing, so it never dismisses: a drag begun
  // where a finger caught the sheet on its way to gone returns to a detent.
  if (velocity !== 0 && Math.sign(velocity) === Math.sign(start - position)) {
    index = nearestIndex(detents, start);
  }
  if (dismissedOffset != null && index === detents.length) {
    // GUESS (spec:AST-094 FR2): a slow dismissal plays `SHEET_DETENT_SPRING`.
    // None of the measured releases that dismissed had its spring read;
    // MEASUREMENTS.md's M-SH09 (drags released past the dismiss boundary,
    // their release spring read) will confirm or replace it.
    return {
      kind: 'dismiss',
      index: -1,
      offset: dismissedOffset,
      projected: choice.projected,
      spring: isFast ? SHEET_DISMISS_SWIPE_SPRING : SHEET_DETENT_SPRING,
    };
  }
  return {
    kind: 'detent',
    index,
    offset: positions[index],
    projected: choice.projected,
    spring: isFast ? SHEET_RELEASE_FAST_SPRING : SHEET_DETENT_SPRING,
  };
}

// Today's rule, which a Material variant may replace. The release is judged
// where the sheet would come to rest: its position plus the distance a
// surface moving at the finger's speed travels while it decelerates at 0.998
// per ms. A gesture shorter than the travel floor projects nothing.
const DEFAULT_DECELERATION_RATE = 0.998;
const DEFAULT_PROJECTION_MS =
  DEFAULT_DECELERATION_RATE / (1 - DEFAULT_DECELERATION_RATE);
const DEFAULT_PROJECTION_MIN_TRAVEL = 48; // px traveled during the gesture
/** Past this fraction of the shortest detent's height below it, a release dismisses. */
export const DEFAULT_DISMISS_OVERSHOOT_RATIO = 0.4;

/**
 * Where a sheet released under a mouse
 * settles: today's rule. A downward release projected past the dismiss line
 * (`DEFAULT_DISMISS_OVERSHOOT_RATIO` of the shortest detent's height below
 * it) dismisses; any other settles on the detent nearest its projection in
 * the drag's direction, never back past the detent it started from. The
 * spring is unused there: these releases run on the theme's timing.
 *
 * @example
 * ```
 * // Detents at 0 and 300 px, the shortest showing 340 px; a 120 px drag
 * // down from 300 px released at 600 px/s: projected 719 px, past the
 * // dismiss line at 436 px.
 * resolveDefaultRelease({
 *   detents: [0, 300],
 *   shortestDetentHeight: 340,
 *   dismissible: true,
 *   position: 420,
 *   velocity: 600,
 *   travel: 120,
 *   direction: 1,
 *   startOffset: 300,
 * }); // {kind: 'dismiss', offset: 640, …}
 * ```
 */
export function resolveDefaultRelease({
  detents,
  shortestDetentHeight,
  dismissible,
  position,
  velocity,
  travel,
  direction,
  startOffset,
}: {
  /** Detent offsets, ascending (the tallest first). */
  detents: ReadonlyArray<number>;
  /** How much of the sheet the shortest detent shows, px. */
  shortestDetentHeight: number;
  /** Whether a drag may dismiss the sheet. */
  dismissible: boolean;
  position: number;
  /**
   * The release velocity, px/s: the velocity tracker's at the lift, the one
   * estimate every pointer reads (`spec:AST-100` FR2, FR4); 0 after a still
   * pointer.
   */
  velocity: number;
  /** How far the gesture traveled, px. */
  travel: number;
  /** The drag's direction: 1 down, -1 up, 0 none. */
  direction: number;
  /** The detent offset the drag started from. */
  startOffset: number;
}): SheetRelease {
  if (detents.length === 0) {
    throw new RangeError('resolveDefaultRelease needs at least one detent');
  }
  const maxOffset = detents[detents.length - 1];
  const dismissLine =
    maxOffset + shortestDetentHeight * DEFAULT_DISMISS_OVERSHOOT_RATIO;
  const projected =
    travel > DEFAULT_PROJECTION_MIN_TRAVEL
      ? position + (velocity / 1000) * DEFAULT_PROJECTION_MS
      : position;
  if (direction > 0 && projected > dismissLine) {
    return dismissible
      ? {
          kind: 'dismiss',
          index: -1,
          offset: maxOffset + shortestDetentHeight,
          projected,
          spring: SHEET_DETENT_SPRING,
        }
      : {
          kind: 'detent',
          index: detents.length - 1,
          offset: maxOffset,
          projected,
          spring: SHEET_DETENT_SPRING,
        };
  }
  const offset = resolveSettleOffset(
    Math.min(Math.max(projected, 0), maxOffset),
    [...detents],
    direction,
    startOffset,
  );
  return {
    kind: 'detent',
    index: detents.indexOf(offset),
    offset,
    projected,
    spring: SHEET_DETENT_SPRING,
  };
}

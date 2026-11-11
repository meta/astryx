// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file swipeRelease.ts
 * @input The UIKit constants table (motion/uikit/swipeActions.ts)
 * @output Exports resolveRelease (where a swipe-action release lands: closed,
 *   open, or the outermost entry fires), confirmPoint (where a full swipe
 *   confirms) and confirmedOffset
 * @position Pure pieces of a row's swipe actions, beside useSwipeAction;
 *   tested by swipeRelease.test.ts against the UIKit lab's releases
 *
 * A UIKit list row fires its outermost action only from a confirmed full swipe.
 * The finger dragged past the confirm point, and is still past it when it
 * lifts, at any speed. A swipe that confirmed and then backed out closes the
 * row. Any other release goes by its speed first. One at `releaseVelocity` or
 * faster goes the way it moves: open when opening, closed when closing. A
 * slower one goes by where it is, against `openFraction` of the open width. So
 * a flick opens the row even from a short drag, closes it from anywhere, and
 * never fires. Travel and velocity here are logical: measured toward the side
 * being uncovered, whatever the writing direction.
 */

import {swipeActions} from '../motion/uikit/swipeActions';

/** What a swipe does (`createSwipe`'s `behavior`). */
export type SwipeReleaseBehavior = 'reveal' | 'commit';

/** Where a release lands. */
export type SwipeRelease = 'closed' | 'open' | 'perform';

/**
 * Where a release lands. `travel` (px, ≥ 0) and `velocity` (px/s) are logical:
 * positive toward the side being uncovered. `isConfirmed`: the finger is past
 * the confirm point as it lifts. `wasConfirmed`: it was past it at some point
 * during this swipe. A confirmed release fires the outermost entry, whatever
 * its velocity. Under `commit`, nothing else fires and nothing rests. A swipe
 * that confirmed and backed out closes under either model. Otherwise, under
 * `reveal`, a release at `releaseVelocity` or faster opens the row if it is
 * opening, and closes it if it is closing. A slower one opens it past
 * `openFraction` of its open width, and closes it short of that.
 */
export function resolveRelease({
  travel,
  velocity,
  openWidth,
  isConfirmed,
  wasConfirmed,
  behavior,
}: {
  travel: number;
  velocity: number;
  openWidth: number;
  isConfirmed: boolean;
  wasConfirmed: boolean;
  behavior: SwipeReleaseBehavior;
}): SwipeRelease {
  if (isConfirmed) {
    return 'perform';
  }
  if (behavior === 'commit' || wasConfirmed) {
    return 'closed';
  }
  if (velocity >= swipeActions.releaseVelocity) {
    return 'open';
  }
  if (velocity <= -swipeActions.releaseVelocity) {
    return 'closed';
  }
  return travel >= swipeActions.openFraction * openWidth ? 'open' : 'closed';
}

/**
 * The swipe at which a full swipe confirms. It is `confirmFraction` of the way
 * from the open width to the confirmation offset, and never short of the open
 * width. The confirmation offset is the row width less `confirmInset`.
 */
export function confirmPoint(openWidth: number, rowWidth: number): number {
  const confirmAt = rowWidth - swipeActions.confirmInset;
  return Math.max(
    openWidth,
    openWidth + (confirmAt - openWidth) * swipeActions.confirmFraction,
  );
}

/** The row's offset once a full swipe has confirmed (UIKit's `confirmationThreshold`). */
export function confirmedOffset(rowWidth: number): number {
  return rowWidth - swipeActions.confirmInset;
}

// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file chatStreamScrollChannel.ts
 * @input The stream scroll that runs on a scroll container
 * @output What other Chat modules read from and write through that stream
 *   scroll: whether it follows the newest message, its position shift and
 *   follow stop, and the position it reads on each scroll event
 * @position Internal to Chat. The stream scroll stays the one writer of the
 *   position, and a windowed list reads no layout on the scroll path.
 */
import {setScrollAnchoringOff} from '../privateAttributes/scrollAnchoring.stylex';
import {sharedWeakMap} from '../utils/sharedRealm';

// The scrollers whose stream scroll follows the newest message now, kept in
// step with each hook's lock.
const following = new WeakSet<Element>();

/**
 * Whether the stream scroll on `scroller` follows its newest message now, as
 * its lock says.
 */
export function isFollowingNewest(scroller: Element): boolean {
  return following.has(scroller);
}

/**
 * Marks the lock on the scroller: anchoring is off while the stream scroll
 * follows, and `isFollowingNewest` reads the mark.
 */
export function markFollowing(el: Element, locked: boolean): void {
  setScrollAnchoringOff(el, locked);
  if (locked) {
    following.add(el);
  } else {
    following.delete(el);
  }
}

/** The writes a windowed list makes through the stream scroll. */
export interface ChatStreamScrollShift {
  /**
   * Moves the position by `delta` px. The stream scroll does not read the
   * move as the reader's, and a spring in flight moves with it.
   */
  shiftBy: (delta: number) => void;
  /** Stops following, as the reader's scroll up does. */
  unlock: () => void;
}

/** The stream scroll on each scroll container. */
export const streamScrollShifts = sharedWeakMap<Element, ChatStreamScrollShift>(
  'chat/shift',
  1,
);

/** Listeners for the position the stream scroll reads for a scroll event. */
export const streamScrollPositions = sharedWeakMap<
  Element,
  Set<(top: number) => void>
>('chat/position', 1);

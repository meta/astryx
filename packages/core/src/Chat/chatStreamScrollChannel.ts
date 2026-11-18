// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file chatStreamScrollChannel.ts
 * @input The stream scroll that runs on a scroll container
 * @output What other Chat modules read from and write through that stream
 *   scroll: whether it follows the newest message, a position shift and a
 *   follow stop, and the position it reads on each scroll event
 * @position Internal to Chat. The stream scroll stays the one writer of the
 *   position, and a windowed list reads no layout on the scroll path. Only a
 *   windowed list imports the shift, the stop and the subscription, so a page
 *   without one carries none of them.
 */
import type {RefObject} from 'react';
import {setScrollAnchoringOff} from '../privateAttributes/scrollAnchoring.stylex';
import {sharedWeakMap} from '../utils/sharedRealm';

/** What the stream scroll on one scroll container shares. */
interface ChatStreamScrollChannel {
  /** Whether the stream scroll follows its newest message now. */
  following?: boolean;
  /**
   * The position the stream scroll last saw or set. A scroll event above it
   * is the reader's.
   */
  last?: RefObject<number>;
  /** The position of a spring in flight. */
  spring?: RefObject<number | undefined>;
  /** Whether a spring is in flight. */
  animating?: RefObject<boolean>;
  /** Stops following, as the reader's scroll up does. */
  unlock?: () => void;
  /**
   * Listeners for the position the stream scroll reads for a scroll event,
   * and whether it lands at the end of the scroll range.
   */
  positions?: Set<(top: number, isAtEnd: boolean) => void>;
}

const channels = sharedWeakMap<Element, ChatStreamScrollChannel>(
  'chat/stream',
  1,
);

/** The channel of the stream scroll on `scroller`. */
export function channelOf(scroller: Element): ChatStreamScrollChannel {
  let channel = channels.get(scroller);
  if (channel === undefined) {
    channel = {};
    channels.set(scroller, channel);
  }
  return channel;
}

/** Whether the stream scroll on `scroller` follows its newest message now. */
export function isFollowingNewest(scroller: Element): boolean {
  return channels.get(scroller)?.following === true;
}

/**
 * Marks the lock on the scroller: anchoring is off while the stream scroll
 * follows, and `isFollowingNewest` reads the mark.
 */
export function markFollowing(el: Element, locked: boolean): void {
  setScrollAnchoringOff(el, locked);
  channelOf(el).following = locked;
}

/**
 * Moves the position by `delta` px. The stream scroll does not read the move
 * as the reader's, and a spring in flight moves with it.
 */
export function shiftStreamScroll(scroller: HTMLElement, delta: number): void {
  const {last, spring, animating} = channelOf(scroller);
  if (last != null && animating?.current && spring?.current !== undefined) {
    spring.current += delta;
  }
  scroller.scrollTop += delta;
  if (last != null) {
    last.current = scroller.scrollTop;
  }
}

/** Stops the stream scroll on `scroller` from following. */
export function unlockStreamScroll(scroller: Element): void {
  channels.get(scroller)?.unlock?.();
}

/**
 * Calls `listener` with the position the stream scroll on `scroller` reads
 * for each scroll event. Returns the unsubscribe.
 */
export function subscribeStreamScroll(
  scroller: Element,
  listener: (top: number, isAtEnd: boolean) => void,
): () => void {
  const channel = channelOf(scroller);
  const positions = (channel.positions ??= new Set());
  positions.add(listener);
  return () => {
    positions.delete(listener);
  };
}

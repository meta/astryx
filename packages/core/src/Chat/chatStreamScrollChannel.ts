// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file chatStreamScrollChannel.ts
 * @input The stream scroll that runs on a scroll container, and a windowed
 *   list on the same container
 * @output The stream scroll's position shift and follow stop, and the
 *   listeners for the position it reads on each scroll event, by scroll
 *   container
 * @position Internal to Chat. The stream scroll stays the one writer of the
 *   position, and the list reads no layout on the scroll path. ChatLayout
 *   loads only these two maps; the list's helpers live beside the list.
 */
import {sharedWeakMap} from '../utils/sharedRealm';

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
export const streamScrollPositionListeners = sharedWeakMap<
  Element,
  Set<(top: number) => void>
>('chat/position', 1);

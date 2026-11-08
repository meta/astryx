// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useLongPress.ts
 * @input Long-press options: onLongPress callback, disabled, delayMs, moveCancelPx
 * @output Touch handlers to spread onto an element, plus the same detection
 *   driven by hand for a caller already observing pointer events
 * @position Core hook for long-press invocation; used by ContextMenu and by
 *   `useMenuPress` for the held-finger menu open
 *
 * SYNC: When modified, update the hooks barrel /packages/core/src/hooks/index.ts
 * and the detector it wraps, /packages/core/src/hooks/longPressDetector.ts
 */

// iOS Safari sends no `contextmenu` event on a long press. So a long press is
// the only touch way to open a surface at the press point.
//
// A caller can spread the touch handlers, or call `start`, `moveTo` and
// `cancel` from its own pointer events, as `useMenuPress` does. Both ways use
// the hold time, movement tolerance and timer of createLongPressDetector. So a
// long press means the same thing on a context menu and on a menu trigger.
//
// The defaults come from the long-press recognizer. The recognizer measures
// its tolerance as a distance, as UIKit does. This hook measures it on each
// axis. The context menu's own movement allowance is a guess and is not
// measured yet (AST-094).
//
// The hold is a deadline on the touch events' own clock (longPressDetector.ts).

import {useCallback, useEffect, useState} from 'react';
import {
  createLongPressDetector,
  type LongPressTolerance,
} from './longPressDetector';
import {useIsomorphicLayoutEffect} from './useIsomorphicLayoutEffect';

export type {LongPressTolerance};

export interface UseLongPressOptions {
  /** Fired with the touch start point once the press is held for `delayMs`. */
  onLongPress: (point: {x: number; y: number}) => void;
  /** When true, touch handlers are inert. */
  disabled?: boolean;
  /** Hold duration before the press fires, in ms. Defaults to 500. */
  delayMs?: number;
  /** Movement past this distance (px, either axis) cancels the press. Defaults to 10. */
  moveCancelPx?: number;
}

export interface UseLongPressHandlers {
  onTouchStart: (e: React.TouchEvent) => void;
  onTouchMove: (e: React.TouchEvent) => void;
  /**
   * The lift. Pass the event, so a press it is stamped past (its timer held
   * back by a busy page) still reports first. Spreading the handlers does.
   */
  onTouchEnd: (e?: React.TouchEvent) => void;
  onTouchCancel: (e?: React.TouchEvent) => void;
  /**
   * Begin detection at a point, for a caller driving this from its own
   * pointer events rather than the touch handlers above.
   */
  start: (point: {x: number; y: number}) => void;
  /**
   * Report the pointer's new position. Past `moveCancelPx` the press is off.
   * Returns whether a press is still pending, so a caller running its own
   * state machine can react to the cancellation in the same step.
   */
  moveTo: (point: {x: number; y: number}) => boolean;
  /** Drop any pending press (a lift, a cancel, or the gesture moving on). */
  cancel: () => void;
}

/**
 * @internal The handlers with a per-press tolerance on `start`, for a core
 * caller that decides it as the press starts (useMenuPress's trigger). Not in
 * the hooks entry: the public `useLongPress` takes its tolerance from
 * `moveCancelPx`.
 */
export interface LongPressDetectorHandlers extends Omit<
  UseLongPressHandlers,
  'start'
> {
  start: (
    point: {x: number; y: number},
    tolerance?: LongPressTolerance,
  ) => void;
}

export function useLongPress(
  options: UseLongPressOptions,
): UseLongPressHandlers {
  const {start, ...handlers} = useLongPressDetector(options);
  // The public start takes only the point. A per-press tolerance stays
  // internal to its core caller.
  const startAt = useCallback(
    (point: {x: number; y: number}) => start(point),
    [start],
  );
  return {...handlers, start: startAt};
}

/** @internal useLongPress with a per-press tolerance (LongPressDetectorHandlers). */
export function useLongPressDetector(
  options: UseLongPressOptions,
): LongPressDetectorHandlers {
  const [detector] = useState(() => createLongPressDetector(options));
  // The detector reads only committed options. A render that React discards
  // never reaches it.
  useIsomorphicLayoutEffect(() => {
    detector.setOptions(options);
  });
  // The detector's pending timer ends with the component.
  useEffect(() => detector.cancel, [detector]);

  return {
    onTouchStart: detector.touchStart,
    onTouchMove: detector.touchMove,
    onTouchEnd: detector.touchEnd,
    onTouchCancel: detector.touchEnd,
    start: detector.start,
    moveTo: detector.moveTo,
    cancel: detector.cancel,
  };
}

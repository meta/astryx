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
 */

// iOS Safari sends no `contextmenu` event on a long press. So a long press is
// the only touch way to open a surface at the press point.
//
// A caller can spread the touch handlers, or call `start`, `moveTo` and
// `cancel` from its own pointer events, as `useMenuPress` does. Both ways use
// this hook's hold time, movement tolerance and timer, so a long press means
// the same thing on a context menu and on a menu trigger.
//
// The defaults come from the long-press recognizer. The recognizer measures
// its tolerance as a distance, as UIKit does. This hook measures it on each
// axis. The context menu's own movement allowance is a guess and is not
// measured yet (AST-094).

import {useCallback, useEffect, useRef} from 'react';
import {
  LONG_PRESS_ALLOWABLE_MOVEMENT_PX,
  LONG_PRESS_DURATION_MS,
} from '../motion/uikit/longPress';

// The long-press numbers have one source, shared with the gesture
// recognizers (motion/uikit/longPress.ts).
const DEFAULT_DELAY_MS = LONG_PRESS_DURATION_MS;
const DEFAULT_MOVE_CANCEL_PX = LONG_PRESS_ALLOWABLE_MOVEMENT_PX;

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

/**
 * @internal A press's own movement tolerance, for a core caller that decides
 * it as the press starts (useMenuPress's trigger). Not in the hooks entry.
 */
export interface LongPressTolerance {
  moveCancelPx?: number;
}

export interface UseLongPressHandlers {
  onTouchStart: (e: React.TouchEvent) => void;
  onTouchMove: (e: React.TouchEvent) => void;
  onTouchEnd: () => void;
  onTouchCancel: () => void;
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
  const {
    onLongPress,
    disabled = false,
    delayMs = DEFAULT_DELAY_MS,
    moveCancelPx = DEFAULT_MOVE_CANCEL_PX,
  } = options;

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startRef = useRef<{x: number; y: number} | null>(null);
  // The press in progress's tolerance, when its caller chose one at start.
  const pressToleranceRef = useRef<LongPressTolerance | null>(null);
  // Keep the latest callback without re-creating handlers on every render.
  const onLongPressRef = useRef(onLongPress);
  onLongPressRef.current = onLongPress;

  const clear = useCallback(() => {
    if (timerRef.current != null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    startRef.current = null;
  }, []);

  const start = useCallback(
    (point: {x: number; y: number}, tolerance?: LongPressTolerance) => {
      if (disabled) {
        return;
      }
      // Clear a stale timer first, then record the start point. The clear
      // also sets startRef to null.
      clear();
      startRef.current = {x: point.x, y: point.y};
      pressToleranceRef.current = tolerance ?? null;
      timerRef.current = setTimeout(() => {
        const from = startRef.current;
        if (from == null) {
          return;
        }
        onLongPressRef.current({x: from.x, y: from.y});
      }, delayMs);
    },
    [disabled, delayMs, clear],
  );

  const moveTo = useCallback(
    (point: {x: number; y: number}): boolean => {
      const from = startRef.current;
      if (from == null) {
        return false;
      }
      // This press's own tolerance when its caller chose one, on either axis.
      const limit = pressToleranceRef.current?.moveCancelPx ?? moveCancelPx;
      if (
        Math.abs(point.x - from.x) > limit ||
        Math.abs(point.y - from.y) > limit
      ) {
        clear();
        return false;
      }
      return true;
    },
    [moveCancelPx, clear],
  );

  const onTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (disabled) {
        return;
      }
      if (e.touches.length !== 1) {
        clear();
        return;
      }
      const touch = e.touches[0];
      start({x: touch.clientX, y: touch.clientY});
    },
    [disabled, clear, start],
  );

  const onTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (startRef.current == null) {
        return;
      }
      if (e.touches.length !== 1) {
        clear();
        return;
      }
      const touch = e.touches[0];
      moveTo({x: touch.clientX, y: touch.clientY});
    },
    [clear, moveTo],
  );

  useEffect(() => clear, [clear]);

  return {
    onTouchStart,
    onTouchMove,
    onTouchEnd: clear,
    onTouchCancel: clear,
    start,
    moveTo,
    cancel: clear,
  };
}

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
 *
 * Detects a single-finger long-press: fires `onLongPress` with the press
 * start point after `delayMs`. Cancels if the finger moves past
 * `moveCancelPx` on either axis (treated as a scroll/drag), lifts, or the
 * touch is cancelled. The pending timer is also cleared on unmount. The
 * default duration and tolerance are the long-press recognizer's
 * (motion/uikit/longPress.ts); the recognizer measures its tolerance as a
 * distance, as UIKit does, and this hook on each axis, as ContextMenu's
 * measured hold and the menu trigger's released behavior do.
 *
 * Two ways in, one detector. Spread the touch handlers onto an element, or —
 * when the caller already runs its own pointer-event machine, as
 * `useMenuPress` does — call `start`, `moveTo` and `cancel` from it. Either
 * way the hold duration, the movement tolerance and the timer are this
 * hook's, so a long press cannot come to mean one thing on a context menu
 * and another on a menu trigger.
 *
 * Motivation: iOS Safari never synthesizes a `contextmenu` event on
 * long-press, so long-press is the only touch affordance for opening
 * cursor-positioned surfaces.
 */

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

export function useLongPress(
  options: UseLongPressOptions,
): UseLongPressHandlers {
  const {
    onLongPress,
    disabled = false,
    delayMs = DEFAULT_DELAY_MS,
    moveCancelPx = DEFAULT_MOVE_CANCEL_PX,
  } = options;

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startRef = useRef<{x: number; y: number} | null>(null);
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
    (point: {x: number; y: number}) => {
      if (disabled) {
        return;
      }
      // Clear any stale timer first, THEN record the start point — clearing
      // also nulls startRef, so order matters.
      clear();
      startRef.current = {x: point.x, y: point.y};
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
      if (
        Math.abs(point.x - from.x) > moveCancelPx ||
        Math.abs(point.y - from.y) > moveCancelPx
      ) {
        // Treat as a scroll/drag, not a long-press.
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
        // Multi-touch cancels any pending long-press.
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
        // Multi-touch cancels the pending long-press.
        clear();
        return;
      }
      const touch = e.touches[0];
      moveTo({x: touch.clientX, y: touch.clientY});
    },
    [clear, moveTo],
  );

  // Cancel any pending long-press timer on unmount.
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

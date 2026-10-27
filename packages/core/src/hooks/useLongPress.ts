// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useLongPress.ts
 * @input Long-press options: onLongPress callback, disabled, delayMs,
 *   moveCancelPx, later stages of the same hold
 * @output Touch handlers to spread onto an element, plus the same detection
 *   driven by hand for a caller already observing pointer events; the
 *   detector itself (createLongPressDetector) for a caller with its own clock
 * @position Core hook for long-press invocation; used by `useMenuPress` for
 *   the held-finger menu open, and (as createLongPressDetector, on the gesture
 *   arena's clock) by ContextMenu's press recognizer
 *
 * SYNC: When modified, update the hooks barrel /packages/core/src/hooks/index.ts
 *
 * Detects a single-finger long-press: fires `onLongPress` with the press
 * start point after `delayMs`. Cancels if the finger travels farther than
 * `moveCancelPx` from where it landed (treated as a scroll/drag), lifts, or
 * the touch is cancelled. The pending timer is also cleared on unmount. The
 * defaults are the long-press recognizer's (motion/uikit/longPress.ts).
 *
 * Three ways in, one detector. Spread the touch handlers onto an element, or —
 * when the caller already runs its own pointer-event machine, as
 * `useMenuPress` does — call `start`, `moveTo` and `cancel` from it, or —
 * when the caller keeps its own clock, as a gesture recognizer does — create
 * the detector with `createLongPressDetector` and a scheduler. Every way the
 * hold duration, the movement tolerance and the deadlines are this module's,
 * so a long press cannot come to mean one thing on a context menu and another
 * on a menu trigger.
 *
 * A hold can go on to later stages (`stages`): each fires once the finger has
 * stayed that long from the start, still within `moveCancelPx`, after the
 * long press itself (a context menu claims the finger at its long press and
 * shows its menu at a later stage). Deadlines count from the press's start, so
 * a caller that passes the touch's own time keeps them on it.
 *
 * Motivation: iOS Safari never synthesizes a `contextmenu` event on
 * long-press, so long-press is the only touch affordance for opening
 * cursor-positioned surfaces.
 */

import {useCallback, useEffect, useRef, useState} from 'react';
import {
  LONG_PRESS_ALLOWABLE_MOVEMENT_PX,
  LONG_PRESS_DURATION_MS,
} from '../motion/uikit/longPress';

// The long-press numbers have one source, shared with the gesture
// recognizers (motion/uikit/longPress.ts).
const DEFAULT_DELAY_MS = LONG_PRESS_DURATION_MS;
const DEFAULT_MOVE_CANCEL_PX = LONG_PRESS_ALLOWABLE_MOVEMENT_PX;

/** A later stage of the same hold. */
export interface LongPressStage {
  /** When it fires, ms from the press's start (after `delayMs`). */
  delayMs: number;
  /** Fired with the start point while the finger is still down and near it. */
  onStage: (point: {x: number; y: number}) => void;
}

/**
 * The clock a detector runs on: `performance.now()` and window timers by
 * default, or a gesture arena's (its event clock and timers).
 */
export interface LongPressScheduler {
  /** The current time, ms. */
  now(): number;
  /** Run `callback` at `deadline` (ms on `now`'s clock); returns its cancel. */
  setTimer(deadline: number, callback: () => void): () => void;
}

const WINDOW_SCHEDULER: LongPressScheduler = {
  now: () => performance.now(),
  setTimer: (deadline, callback) => {
    const timer = setTimeout(
      callback,
      Math.max(deadline - performance.now(), 0),
    );
    return () => clearTimeout(timer);
  },
};

export interface LongPressDetectorOptions {
  /** Fired with the start point once the press is held for `delayMs`. */
  onLongPress: (point: {x: number; y: number}) => void;
  /** Hold duration before the press fires, in ms. Defaults to 500. */
  delayMs?: number;
  /**
   * Travel farther than this distance (px) from where the press began
   * cancels it, as UIKit's `allowableMovement`. Defaults to 10.
   */
  moveCancelPx?: number;
  /** Later stages of the same hold, in order. */
  stages?: ReadonlyArray<LongPressStage>;
  /**
   * Measure the drift on each axis instead of as a distance, as
   * UIContextMenuInteraction does (motion/uikit/contextMenu.ts: an (11, 11)
   * drift still opens its menu). @default false, a distance
   */
  isPerAxis?: boolean;
  /** The clock; `performance.now()` and window timers by default. */
  scheduler?: LongPressScheduler;
}

/** The long-press detector, driven by hand. */
export interface LongPressDetector {
  /**
   * Begin detection at a point. `time` is when the press started on the
   * scheduler's clock (an event's timestamp); the deadlines count from it.
   * Defaults to now.
   */
  start(
    point: {x: number; y: number},
    time?: number,
    tolerance?: LongPressTolerance,
  ): void;
  /**
   * Report the pointer's new position. Past `moveCancelPx` the press is off.
   * Returns whether a press is still tracked.
   */
  moveTo(point: {x: number; y: number}): boolean;
  /** Drop any press (a lift, a cancel, or the gesture moving on). */
  cancel(): void;
}

/**
 * The detector useLongPress runs on, for a caller with its own clock (a
 * gesture recognizer passes its arena's scheduler). `read` is called for the
 * current options at every step, so they can change between presses.
 */
export function createLongPressDetector(
  read: () => LongPressDetectorOptions,
): LongPressDetector {
  let from: {x: number; y: number} | null = null;
  // The press in progress's tolerance, when its caller chose one at start.
  let pressTolerance: LongPressTolerance | null = null;
  let cancelTimer: (() => void) | null = null;
  const cancel = () => {
    cancelTimer?.();
    cancelTimer = null;
    from = null;
  };
  const start = (
    point: {x: number; y: number},
    time?: number,
    tolerance?: LongPressTolerance,
  ) => {
    cancel();
    pressTolerance = tolerance ?? null;
    const options = read();
    const scheduler = options.scheduler ?? WINDOW_SCHEDULER;
    const origin = time ?? scheduler.now();
    const steps = [options.delayMs ?? DEFAULT_DELAY_MS].concat(
      (options.stages ?? []).map(stage => stage.delayMs),
    );
    from = {x: point.x, y: point.y};
    const arm = (index: number) => {
      if (index >= steps.length) {
        return;
      }
      cancelTimer = scheduler.setTimer(origin + steps[index], () => {
        cancelTimer = null;
        if (from == null) {
          return;
        }
        const at = {x: from.x, y: from.y};
        const current = read();
        if (index === 0) {
          current.onLongPress(at);
        } else {
          current.stages?.[index - 1]?.onStage(at);
        }
        // A callback may have ended the press.
        if (from != null) {
          arm(index + 1);
        }
      });
    };
    arm(0);
  };
  const moveTo = (point: {x: number; y: number}): boolean => {
    if (from == null) {
      return false;
    }
    const options = read();
    // This press's own tolerance when its caller chose one at start.
    const limit =
      pressTolerance?.moveCancelPx ??
      options.moveCancelPx ??
      DEFAULT_MOVE_CANCEL_PX;
    const dx = Math.abs(point.x - from.x);
    const dy = Math.abs(point.y - from.y);
    // On either axis, as documented (ContextMenu's measured hold, the menu
    // trigger's released behavior); a distance with `isPerAxis: false`.
    if (
      options.isPerAxis === false
        ? Math.hypot(dx, dy) > limit
        : Math.max(dx, dy) > limit
    ) {
      // Treat as a scroll/drag, not a long-press.
      cancel();
      return false;
    }
    return true;
  };
  return {start, moveTo, cancel};
}

/** A press's own movement tolerance, for a caller that decides it as the press starts. */
export interface LongPressTolerance {
  moveCancelPx?: number;
}

export interface UseLongPressOptions {
  /** Fired with the touch start point once the press is held for `delayMs`. */
  onLongPress: (point: {x: number; y: number}) => void;
  /** When true, touch handlers are inert. */
  disabled?: boolean;
  /** Hold duration before the press fires, in ms. Defaults to 500. */
  delayMs?: number;
  /**
   * Travel farther than this distance (px) from where the press began
   * cancels it, as UIKit's `allowableMovement`. Defaults to 10.
   */
  moveCancelPx?: number;
  /** Later stages of the same hold, in order (each after `delayMs`). */
  stages?: ReadonlyArray<LongPressStage>;
}

export interface UseLongPressHandlers {
  onTouchStart: (e: React.TouchEvent) => void;
  onTouchMove: (e: React.TouchEvent) => void;
  onTouchEnd: () => void;
  onTouchCancel: () => void;
  /**
   * Begin detection at a point, for a caller driving this from its own
   * pointer events rather than the touch handlers above. `time` is when the
   * press started (`performance.now()` clock); defaults to now.
   */
  start: (
    point: {x: number; y: number},
    time?: number,
    tolerance?: LongPressTolerance,
  ) => void;
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
  // Keep the latest options without re-creating handlers on every render.
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const [detector] = useState(() =>
    createLongPressDetector(() => optionsRef.current),
  );

  const start = useCallback(
    (
      point: {x: number; y: number},
      time?: number,
      tolerance?: LongPressTolerance,
    ) => {
      if (optionsRef.current.disabled === true) {
        return;
      }
      detector.start(point, time, tolerance);
    },
    [detector],
  );

  const onTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (optionsRef.current.disabled === true) {
        return;
      }
      if (e.touches.length !== 1) {
        // Multi-touch cancels any pending long-press.
        detector.cancel();
        return;
      }
      const touch = e.touches[0];
      start({x: touch.clientX, y: touch.clientY});
    },
    [detector, start],
  );

  const onTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (e.touches.length !== 1) {
        // Multi-touch cancels the pending long-press.
        detector.cancel();
        return;
      }
      const touch = e.touches[0];
      detector.moveTo({x: touch.clientX, y: touch.clientY});
    },
    [detector],
  );

  // Cancel any pending long-press timer on unmount.
  useEffect(() => detector.cancel, [detector]);

  return {
    onTouchStart,
    onTouchMove,
    onTouchEnd: detector.cancel,
    onTouchCancel: detector.cancel,
    start,
    moveTo: detector.moveTo,
    cancel: detector.cancel,
  };
}

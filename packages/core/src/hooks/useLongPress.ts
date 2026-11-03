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
//
// The hold is a deadline on the touch events' timestamps, on the clock of the
// touch's own window. A busy main thread can delay the timer past the
// deadline. A touch stamped after the deadline then reports the press before
// it acts.

import {useCallback, useEffect, useRef} from 'react';
import {
  LONG_PRESS_ALLOWABLE_MOVEMENT_PX,
  LONG_PRESS_DURATION_MS,
} from '../motion/uikit/longPress';

// The long-press numbers have one source, shared with the gesture
// recognizers (motion/uikit/longPress.ts).
const DEFAULT_DELAY_MS = LONG_PRESS_DURATION_MS;
const DEFAULT_MOVE_CANCEL_PX = LONG_PRESS_ALLOWABLE_MOVEMENT_PX;

/** The part of a window's performance timeline a press reads. */
type EventClock = Pick<Performance, 'now'>;

function clockOf(e: React.TouchEvent): EventClock | null {
  const view = e.view as unknown as {performance?: EventClock} | null;
  return (
    view?.performance ??
    (typeof performance === 'undefined' ? null : performance)
  );
}

/**
 * An event's time on its window's clock. jsdom stamps events with
 * `Date.now()`. The hook reads the age of such a stamp on that clock, so a
 * frozen system time keeps the hold's length. A stamp nearer `Date.now()` than
 * the window's clock is that kind of stamp.
 */
function timeOn(
  clock: EventClock | null,
  timeStamp: number | undefined,
): number | undefined {
  // A stamp of 0 means the event carries no time, so the hold falls back to
  // the full delay on the page's timer.
  if (timeStamp == null || !Number.isFinite(timeStamp) || timeStamp <= 0) {
    return undefined;
  }
  if (
    clock != null &&
    Math.abs(Date.now() - timeStamp) < Math.abs(clock.now() - timeStamp)
  ) {
    return clock.now() - (Date.now() - timeStamp);
  }
  return timeStamp;
}

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
  const {
    onLongPress,
    disabled = false,
    delayMs = DEFAULT_DELAY_MS,
    moveCancelPx = DEFAULT_MOVE_CANCEL_PX,
  } = options;

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startRef = useRef<{x: number; y: number} | null>(null);
  // The pending press's deadline and clock, when it started from a touch.
  const deadlineRef = useRef<number | null>(null);
  const clockRef = useRef<EventClock | null>(null);
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
    deadlineRef.current = null;
    clockRef.current = null;
  }, []);

  const fire = useCallback(() => {
    const from = startRef.current;
    if (from == null) {
      return;
    }
    clear();
    onLongPressRef.current({x: from.x, y: from.y});
  }, [clear]);

  // A touch stamped at or past the deadline: the finger was down for the
  // whole delay, so the press reports before the touch acts.
  const fireIfDue = useCallback(
    (e: React.TouchEvent | undefined) => {
      const deadline = deadlineRef.current;
      const eventTime =
        e == null ? undefined : timeOn(clockRef.current, e.timeStamp);
      if (deadline != null && eventTime != null && eventTime >= deadline) {
        fire();
      }
    },
    [fire],
  );

  const begin = useCallback(
    (
      point: {x: number; y: number},
      tolerance: LongPressTolerance | undefined,
      started: {at: number; clock: EventClock} | undefined,
    ) => {
      if (disabled) {
        return;
      }
      // Clear a stale timer first, then record the start point. The clear
      // also sets startRef to null.
      clear();
      startRef.current = {x: point.x, y: point.y};
      pressToleranceRef.current = tolerance ?? null;
      const clock = started?.clock ?? null;
      const deadline = started == null ? null : started.at + delayMs;
      clockRef.current = clock;
      deadlineRef.current = deadline;
      // Wait only for the rest of the hold, so a touch handled late does not
      // lengthen it, and never past the delay.
      const remaining =
        clock == null || deadline == null
          ? delayMs
          : Math.min(delayMs, Math.max(0, deadline - clock.now()));
      // A late timer yields to queued input once, so a lift stamped before
      // the deadline still cancels the press. The gesture arena does the same.
      const run = (mayYield: boolean) => {
        timerRef.current = null;
        if (
          mayYield &&
          clock != null &&
          deadline != null &&
          clock.now() > deadline
        ) {
          timerRef.current = setTimeout(() => run(false), 0);
          return;
        }
        fire();
      };
      timerRef.current = setTimeout(() => run(true), remaining);
    },
    [disabled, delayMs, clear, fire],
  );

  const start = useCallback(
    (point: {x: number; y: number}, tolerance?: LongPressTolerance) =>
      begin(point, tolerance, undefined),
    [begin],
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
        // A second finger ends the press, unless the press was already due.
        fireIfDue(e);
        clear();
        return;
      }
      const touch = e.touches[0];
      const clock = clockOf(e);
      const at = timeOn(clock, e.timeStamp);
      begin(
        {x: touch.clientX, y: touch.clientY},
        undefined,
        clock == null || at == null ? undefined : {at, clock},
      );
    },
    [disabled, clear, begin, fireIfDue],
  );

  const onTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (startRef.current == null) {
        return;
      }
      fireIfDue(e);
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
    [clear, moveTo, fireIfDue],
  );

  const onTouchEnd = useCallback(
    (e?: React.TouchEvent) => {
      fireIfDue(e);
      clear();
    },
    [clear, fireIfDue],
  );

  useEffect(() => clear, [clear]);

  return {
    onTouchStart,
    onTouchMove,
    onTouchEnd,
    onTouchCancel: onTouchEnd,
    start,
    moveTo,
    cancel: clear,
  };
}

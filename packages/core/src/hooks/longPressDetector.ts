// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file longPressDetector.ts
 * @input The long-press numbers (motion/uikit/longPress.ts) and touch events
 * @output createLongPressDetector(): one long press at a time, timed on the
 *   touch events' clock, with no React. A press that fires claims the press
 *   that is down (utils/pressClaim.ts).
 * @position Internal; the core of useLongPress and useLongPressDetector
 *   (useLongPress.ts). Not in the hooks entry.
 *
 * SYNC: When modified, update /packages/core/src/hooks/useLongPress.ts
 */

import {
  LONG_PRESS_ALLOWABLE_MOVEMENT_PX,
  LONG_PRESS_DURATION_MS,
} from '../motion/uikit/longPress';
import {clockOf, timeOn, type EventClock} from '../utils/inputAge';
import {claimPress} from '../utils/pressClaim';

// The hold is a deadline on the touch events' timestamps, on the clock of the
// touch's own window. A busy main thread can delay the timer past the
// deadline. A touch stamped after the deadline then reports the press before
// it acts. A press started by hand from a point has no stamp, so its page
// timer waits the full delay.

// The long-press numbers have one source, shared with the gesture
// recognizers (motion/uikit/longPress.ts).
const DEFAULT_DELAY_MS = LONG_PRESS_DURATION_MS;
const DEFAULT_MOVE_CANCEL_PX = LONG_PRESS_ALLOWABLE_MOVEMENT_PX;

/** @internal What a detector reads at each start, move and fire. */
export interface LongPressDetectorOptions {
  /** Fired with the start point once the press is held for `delayMs`. */
  onLongPress: (point: {x: number; y: number}) => void;
  /** When true, a start does nothing. */
  disabled?: boolean;
  /** Hold duration before the press fires, in ms. Defaults to 500. */
  delayMs?: number;
  /** Movement past this distance (px, either axis) cancels the press. Defaults to 10. */
  moveCancelPx?: number;
}

/**
 * @internal A press's own movement tolerance, for a core caller that decides
 * it as the press starts (useMenuPress's trigger).
 */
export interface LongPressTolerance {
  moveCancelPx?: number;
}

/**
 * @internal The part of a touch event a detector reads, React's or the DOM's.
 */
export interface LongPressTouchEvent {
  readonly touches: {
    readonly length: number;
    readonly [index: number]: {
      readonly clientX: number;
      readonly clientY: number;
    };
  };
  readonly timeStamp: number;
  readonly view?: unknown;
}

/** @internal One detector: start a press, report its touches, or drop it. */
export interface LongPressDetector {
  /** Begin detection at a point, dropping any press still pending. */
  start: (
    point: {x: number; y: number},
    tolerance?: LongPressTolerance,
  ) => void;
  /** A touch started: one finger begins a press, a second one ends it. */
  touchStart: (event: LongPressTouchEvent) => void;
  /** A touch moved: past the tolerance the press is off. */
  touchMove: (event: LongPressTouchEvent) => void;
  /** The lift or the cancel. A press it is stamped past reports first. */
  touchEnd: (event?: LongPressTouchEvent) => void;
  /**
   * Report the pointer's new position. Past the tolerance the press is off.
   * Returns whether a press is still pending.
   */
  moveTo: (point: {x: number; y: number}) => boolean;
  /** Drop any pending press (a lift, a cancel, or the gesture moving on). */
  cancel: () => void;
  /** Whether a press is in progress (started and not dropped). */
  isPending: () => boolean;
  /** The options the next start, move and fire read. */
  setOptions: (options: LongPressDetectorOptions) => void;
}

/** @internal A long-press detector with no React (see LongPressDetector). */
export function createLongPressDetector(
  initial: LongPressDetectorOptions,
): LongPressDetector {
  let options = initial;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let from: {x: number; y: number} | null = null;
  // Null for a press started by hand. It has no stamp.
  let deadline: number | null = null;
  let clock: EventClock | null = null;
  let pressTolerance: LongPressTolerance | null = null;

  const cancel = () => {
    if (timer != null) {
      clearTimeout(timer);
      timer = null;
    }
    from = null;
    deadline = null;
    clock = null;
  };

  const fire = () => {
    const at = from;
    if (at == null) {
      return;
    }
    cancel();
    // The press acted, so its lift is not a tap: a box under the finger adds
    // no click of its own.
    claimPress();
    options.onLongPress({x: at.x, y: at.y});
  };

  // A touch stamped at or past the deadline: the finger was down for the
  // whole delay, so the press reports before the touch acts.
  const fireIfDue = (event: LongPressTouchEvent | undefined) => {
    const eventTime =
      event == null ? undefined : timeOn(clock, event.timeStamp);
    if (deadline != null && eventTime != null && eventTime >= deadline) {
      fire();
    }
  };

  const begin = (
    point: {x: number; y: number},
    tolerance: LongPressTolerance | undefined,
    started: {at: number; clock: EventClock} | undefined,
  ) => {
    if (options.disabled === true) {
      return;
    }
    cancel();
    const delayMs = options.delayMs ?? DEFAULT_DELAY_MS;
    from = {x: point.x, y: point.y};
    pressTolerance = tolerance ?? null;
    const pressClock = started?.clock ?? null;
    const pressDeadline = started == null ? null : started.at + delayMs;
    clock = pressClock;
    deadline = pressDeadline;
    // Wait only for the rest of the hold. A touch handled late then keeps its
    // length, and the wait never passes the delay.
    const remaining =
      pressClock == null || pressDeadline == null
        ? delayMs
        : Math.min(delayMs, Math.max(0, pressDeadline - pressClock.now()));
    // A late timer yields to queued input once, so a lift stamped before the
    // deadline still cancels the press. The gesture arena does the same.
    const run = (mayYield: boolean) => {
      timer = null;
      if (
        mayYield &&
        pressClock != null &&
        pressDeadline != null &&
        pressClock.now() > pressDeadline
      ) {
        timer = setTimeout(() => run(false), 0);
        return;
      }
      fire();
    };
    timer = setTimeout(() => run(true), remaining);
  };

  const moveTo = (point: {x: number; y: number}): boolean => {
    const at = from;
    if (at == null) {
      return false;
    }
    // This press's own tolerance when its caller chose one, on either axis.
    const limit =
      pressTolerance?.moveCancelPx ??
      options.moveCancelPx ??
      DEFAULT_MOVE_CANCEL_PX;
    if (Math.abs(point.x - at.x) > limit || Math.abs(point.y - at.y) > limit) {
      cancel();
      return false;
    }
    return true;
  };

  return {
    start(point, tolerance) {
      begin(point, tolerance, undefined);
    },
    touchStart(event) {
      if (options.disabled === true) {
        return;
      }
      if (event.touches.length !== 1) {
        // A second finger ends the press, unless the press was already due.
        fireIfDue(event);
        cancel();
        return;
      }
      const touch = event.touches[0];
      const touchClock = clockOf(event);
      const at = timeOn(touchClock, event.timeStamp);
      begin(
        {x: touch.clientX, y: touch.clientY},
        undefined,
        touchClock == null || at == null ? undefined : {at, clock: touchClock},
      );
    },
    touchMove(event) {
      if (from == null) {
        return;
      }
      fireIfDue(event);
      if (from == null) {
        return;
      }
      if (event.touches.length !== 1) {
        cancel();
        return;
      }
      const touch = event.touches[0];
      moveTo({x: touch.clientX, y: touch.clientY});
    },
    touchEnd(event) {
      fireIfDue(event);
      cancel();
    },
    moveTo,
    cancel,
    isPending: () => from != null,
    setOptions(next) {
      options = next;
    },
  };
}

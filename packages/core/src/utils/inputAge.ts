// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file inputAge.ts
 * @input An input's time stamp, and its event or the node it landed on
 * @output clockOf, timeOn and msSinceInput: the clock of the window that
 *   stamped an input, its time on that clock, and how long ago it happened
 * @position Internal utility. The content-touch delay (utils/pressFeedback.ts,
 *   gestures/PressTracker.ts) and the long-press hold
 *   (hooks/longPressDetector.ts) count from the touch with it.
 */

import {isDocument, isNode} from './nodeType';

/**
 * The part of a window's performance timeline an input's age reads, with
 * the time origin that converts an epoch stamp.
 */
export type EventClock = Pick<Performance, 'now' | 'timeOrigin'>;

/**
 * The clock of the window that stamped an input: an event's `view`, or the
 * window of the node it landed on. A same-origin iframe's clock or a popup's
 * starts later than the page's. With neither, the clock is this window's.
 */
export function clockOf(source: unknown): EventClock | null {
  const view = isNode(source)
    ? (isDocument(source) ? source : source.ownerDocument)?.defaultView
    : (source as {view?: unknown} | null | undefined)?.view;
  return (
    (view as {performance?: EventClock} | null | undefined)?.performance ??
    (typeof performance === 'undefined' ? null : performance)
  );
}

/**
 * An event's time on its window's clock. jsdom stamps events with
 * `Date.now()`. Such a stamp keeps its age on that clock, so a frozen system
 * time keeps a delay's length. A stamp nearer `Date.now()` than the window's
 * clock is that kind of stamp.
 */
export function timeOn(
  clock: EventClock | null,
  timeStamp: number | undefined,
): number | undefined {
  // A stamp of 0 means the event carries no time, so a delay falls back to
  // its full length on the page's timer.
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

/**
 * How long ago the input stamped `time` happened, on the clock of the window
 * that stamped it (`clockOf(source)`). A busy main thread runs a listener
 * late. An input with no time, or a time ahead of now, counts as now.
 */
export function msSinceInput(time: number, source?: unknown): number {
  const clock = clockOf(source);
  const at = timeOn(clock, time);
  return clock == null || at == null ? 0 : Math.max(0, clock.now() - at);
}

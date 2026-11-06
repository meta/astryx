// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file inputAge.ts
 * @input An input's time on the page's clock: an event's `timeStamp`, or a
 *   gesture touch's `time`
 * @output msSinceInput: how long ago that input happened
 * @position Internal utility. The content-touch delay counts from the touch
 *   with it, in utils/pressFeedback.ts and gestures/PressTracker.ts.
 */

/**
 * How long ago the input at `time` happened, on the page's clock
 * (`performance.now()`, the base of `event.timeStamp`). A busy main thread
 * runs a listener late. A time that is not on that clock counts as now: zero,
 * one ahead of now, or an epoch time such as a synthetic event's.
 */
export function msSinceInput(time: number): number {
  const now =
    typeof performance === 'undefined' ? Date.now() : performance.now();
  return time > 0 && time <= now ? now - time : 0;
}

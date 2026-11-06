// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file inputAge.ts
 * @input An input's time and the node it landed on: an event's `timeStamp`
 *   and target, or a gesture touch's `time` and target
 * @output msSinceInput: how long ago that input happened, on the clock of the
 *   window that stamped it
 * @position Internal utility. The content-touch delay counts from the touch
 *   with it, in utils/pressFeedback.ts and gestures/PressTracker.ts.
 */

import {isDocument, isNode} from './nodeType';

/**
 * How long ago the input at `time` happened. The window of `target`, the node
 * the input landed on, stamped `time` on its own clock (`performance.now()`,
 * the base of `event.timeStamp`). A same-origin iframe's clock or a popup's
 * starts later than the page's. With no target, the clock is this window's.
 * A busy main thread runs a listener late. A time off that clock counts as
 * now: zero, one ahead of now, or an epoch time, as a DOM emulator stamps it.
 */
export function msSinceInput(time: number, target?: unknown): number {
  const now = clockOf(target)?.now() ?? Date.now();
  return time > 0 && time <= now ? now - time : 0;
}

/** The clock of the window that `target` belongs to, else this window's. */
function clockOf(target: unknown): Performance | undefined {
  const doc = isDocument(target)
    ? target
    : isNode(target)
      ? target.ownerDocument
      : null;
  return (
    doc?.defaultView?.performance ??
    (typeof performance === 'undefined' ? undefined : performance)
  );
}

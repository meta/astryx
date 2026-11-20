// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file eventTrust.ts
 * @input An event
 * @output isUserAgentEvent: whether the browser itself sent the event; and
 *   __setEventTrustForTest, the unit tests' stand-in
 * @position Internal to utils/clickGuard.ts, and not exported from the
 *   package: the guard's one trust read. jsdom never sends a trusted event,
 *   so the guard's unit tests name the events that stand in for the
 *   browser's own.
 */

const readIsTrusted = (event: Event): boolean => event.isTrusted;

let readTrust = readIsTrusted;

/** Whether the browser sent `event`, not a page's `dispatchEvent` or `click()`. */
export function isUserAgentEvent(event: Event): boolean {
  return readTrust(event);
}

/**
 * Tests only: names the events that stand in for the browser's own; `null`
 * restores the real read.
 */
export function __setEventTrustForTest(
  read: ((event: Event) => boolean) | null,
): void {
  readTrust = read ?? readIsTrusted;
}

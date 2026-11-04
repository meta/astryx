// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file isFocusDetached.ts
 * @input The document's current active element
 * @output Whether focus is currently "detached": on nothing in particular
 * @position Utility, exported from utils/index.ts; used by overlay triggers
 *   (e.g. DateInput, DateTimeInput) that return focus to their control when the
 *   overlay closes, but only when the dismiss did not already move focus
 *   somewhere the user chose. Apart from focusReturn.ts so the utils barrel
 *   does not reach focusForLastInput: an overlay loaded with import() that
 *   uses it then keeps it out of the chunk it shares with eager code.
 */

/**
 * True when focus rests on nothing in particular — no active element, or the
 * document body / root element.
 *
 * An overlay (popover, calendar, dropdown) that restores focus to its trigger
 * on close should do so ONLY when this is true. A native `popover="auto"`
 * light-dismiss fires its close synchronously with the pointer event that
 * moved focus, so by the time the close handler runs, focus has already
 * landed on whatever the user clicked — another field, a button, anywhere.
 * Restoring focus unconditionally would yank it back and fight that click.
 * The one case the browser leaves unresolved is Escape or a click on
 * non-focusable empty space, which drops focus to the body; that is exactly
 * when the trigger should reclaim it.
 */
export function isFocusDetached(doc: Document = document): boolean {
  const active = doc.activeElement;
  return (
    active == null || active === doc.body || active === doc.documentElement
  );
}

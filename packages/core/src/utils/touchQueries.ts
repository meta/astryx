// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file touchQueries.ts
 * @input Nothing: plain strings
 * @output TOUCH_QUERY, the media query for a coarse primary pointer; and
 *   IOS_SUPPORTS_QUERY with isIosWebKit, the iOS WebKit engine check
 * @position The dependency-free half of touchPresentation.ts, for code that
 *   must load without React or the theme: the motion foundation, which
 *   Node-side specs and browser proofs load without a StyleX compile.
 *   touchPresentation.ts re-exports it beside the hook and the parts that
 *   read the theme.
 */

/** The primary pointer is coarse: touch behaviours. */
export const TOUCH_QUERY = '(pointer: coarse)';

/**
 * The engine is WebKit on iOS or iPadOS: the only one that implements
 * `-webkit-touch-callout`. For a style iOS WebKit requires, never a
 * behaviour; isIosWebKit reads it for an engine workaround a record names.
 */
export const IOS_SUPPORTS_QUERY = '(-webkit-touch-callout: none)';

/**
 * Whether `view`'s engine is iOS WebKit, by IOS_SUPPORTS_QUERY. Only for an
 * engine workaround a record names (`spec:AST-013` FR6): the selection
 * lock's inline style, and the gesture host's presented hit testing. False
 * where `CSS.supports` is missing (jsdom has `CSS.escape` only).
 */
export function isIosWebKit(
  view:
    | {CSS?: Partial<Pick<typeof CSS, 'supports'>>}
    | null
    | undefined = globalThis,
): boolean {
  return view?.CSS?.supports?.(IOS_SUPPORTS_QUERY) === true;
}

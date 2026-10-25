// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file touchQueries.ts
 * @input Nothing: plain strings
 * @output TOUCH_QUERY, the media query for a coarse primary pointer
 * @position The dependency-free half of touchPresentation.ts, for code that
 *   must load without React or the theme: the motion foundation, which
 *   Node-side specs and browser proofs load without a StyleX compile.
 *   touchPresentation.ts re-exports it beside the hook and the parts that
 *   read the theme.
 */

/** The primary pointer is coarse: touch behaviours. */
export const TOUCH_QUERY = '(pointer: coarse)';

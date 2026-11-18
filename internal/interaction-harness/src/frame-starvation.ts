// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file frame-starvation.ts
 * @input Nothing
 * @output `FRAME_STARVATION_MS`, the gap between two frames past which a page
 *   counts as starved
 * @position A leaf module. ./frames.ts re-exports it, and ./touch.ts reads it
 *   too. ./frames.ts imports ./touch.ts, so the constant lives apart from both.
 */

/**
 * A gap between two frames the page drew, ms, past which the page counts as
 * starved: about three frames at 60 Hz.
 */
export const FRAME_STARVATION_MS = 50;

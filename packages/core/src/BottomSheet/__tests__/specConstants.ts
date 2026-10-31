// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file specConstants.ts
 * @input Nothing: plain values
 * @output END_HOLD_MS, the animator's end-state hold, for the browser specs
 * @position Internal to BottomSheet's browser specs
 *
 * The browser specs load in Node, where the animator cannot be imported at
 * runtime: it reads the touch presentation, whose compact definition comes
 * with the theme's StyleX variables, which only compile in a bundle.
 * specConstants.test.ts keeps these values equal to the source's.
 */

/** The keyframes hold the end state this long after a curve ends (motion/animator). */
export const END_HOLD_MS = 60_000;

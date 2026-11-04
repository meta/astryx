// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file popover.ts
 * @input Nothing; data only
 * @output Exports `popover`: the shape a popover grows out of and shrinks
 *   back into as it is presented and dismissed
 * @position The popover domain of the UIKit constants table (motion/uikit).
 *   These are internal constants, not motion roles.
 *
 * UIPopoverPresentationController with its adaptation turned off (`.none`,
 * so it stays a popover on iPhone), read from UIKit on the iOS 26.2
 * simulator. The popover view grows out of the point where it meets its
 * source (the bottom centre of the source for a popover below it). Its scale,
 * its length away from the source and its opacity move together, with the
 * edge that meets the source held in place. Lengths are in pt (CSS px).
 *
 * Every leaf carries one or more `@source`; GUESS values also carry the
 * `@measure` task that will confirm or replace them. uikit.test.ts enforces
 * both.
 *
 * SYNC: When modified, update /packages/core/src/motion/MEASUREMENTS.md
 */

export const popover = {
  /**
   * The uniform scale the popover grows from and shrinks back to, about the
   * point where it meets its source.
   * @source measured: UIKit lab (injected host app), iOS 26.2 simulator,
   *   iPhone 17 Pro, CASpringAnimation dump on the popover view, Oct 23
   *   2026: an additive `transform` animation from scale 0.01 to identity on
   *   the present spring, and from identity back to 0.01 on the dismiss
   *   spring; per-frame presentation frames keep the popover's top edge on
   *   the source's bottom edge and its centre on the source's centre line
   *   (scale 0.02, 0.32, 0.67, 0.88, 0.98, 1.01, 1 at 50 ms steps)
   */
  collapsedScale: 0.01,
  /**
   * The popover's length away from its source when it starts to grow and
   * when it has shrunk back. For a popover below its source, it is the
   * height. The box grows from this length to its own together with the
   * scale, whatever its size.
   * @source measured: UIKit lab (injected host app), iOS 26.2 simulator,
   *   iPhone 17 Pro, CASpringAnimation dump on the popover view, Oct 23
   *   2026: an additive `bounds.size` animation from height −153 for a
   *   253 pt popover and from −433 for a 533 pt one, both starting at 100 pt,
   *   with `position` moving by half of it so the top edge stays put; the
   *   dismiss animates back to the same 100 pt
   */
  collapsedLengthPx: 100,
} as const;

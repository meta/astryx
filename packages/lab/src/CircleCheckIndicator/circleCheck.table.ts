// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file circleCheck.table.ts
 * @input UIKit measurements on the iOS 26.2 simulator
 * @output Exports `circleCheckTable`: the circle's geometry at two text sizes
 *   (pt)
 * @position Internal to CircleCheckIndicator; circleCheck.stylex.ts mirrors it
 *
 * The circle is a Lab component, so its measurements live beside it. Core's
 * UIKit table holds only what Core's own components play.
 */

/**
 * UIKit's multiple-selection circle, in a table row's edit mode
 * (UITableViewCellEditControl) and a list's `.multiselect()` accessory. It is
 * the SF Symbols `circle` and `checkmark.circle.fill` in a 25.67 pt control at
 * the Large text size. It grows and thickens with the text size. Lengths are
 * in pt.
 */
export const circleCheckTable = {
  /** At the Large text size, the default. */
  large: {
    /**
     * The circle's outer diameter.
     * @source measured: UIKit lab (injected host app), iOS 26.2 simulator,
     *   iPhone 17 Pro, view frames and 3× pixels read (table edit mode and
     *   list multiselect, light and dark), Oct 24 2026
     */
    diameter: 21.8,
    /**
     * The empty circle's stroke; its interior is clear.
     * @source measured: UIKit lab (injected host app), iOS 26.2 simulator,
     *   iPhone 17 Pro, 3× pixels read, Oct 24 2026
     */
    stroke: 1.54,
    /**
     * The white checkmark's ink box in the filled circle, square.
     * @source measured: UIKit lab (injected host app), iOS 26.2 simulator,
     *   iPhone 17 Pro, 3× pixels read, Oct 24 2026
     */
    checkSize: 9,
    /**
     * The checkmark's stroke.
     * @source measured: UIKit lab (injected host app), iOS 26.2 simulator,
     *   iPhone 17 Pro, 3× pixels read, Oct 24 2026
     */
    checkStroke: 1.35,
    /**
     * How far below the circle's centre the checkmark's ink sits.
     * @source measured: UIKit lab (injected host app), iOS 26.2 simulator,
     *   iPhone 17 Pro, 3× pixels read, Oct 24 2026
     */
    checkOffsetY: 1,
  },
  /** At the xSmall text size, the smallest. */
  xSmall: {
    /**
     * The circle's outer diameter.
     * @source measured: UIKit lab (injected host app), iOS 26.2 simulator,
     *   iPhone 17 Pro, view frames and 3× pixels read at the xSmall text
     *   size, Oct 24 2026
     */
    diameter: 18,
    /**
     * The empty circle's stroke.
     * @source measured: UIKit lab (injected host app), iOS 26.2 simulator,
     *   iPhone 17 Pro, 3× pixels read at the xSmall text size, Oct 24 2026
     */
    stroke: 1.27,
    /**
     * The checkmark's ink box, square.
     * @source measured: UIKit lab (injected host app), iOS 26.2 simulator,
     *   iPhone 17 Pro, 3× pixels read at the xSmall text size, Oct 24 2026
     */
    checkSize: 8,
  },
} as const;

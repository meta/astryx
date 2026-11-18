// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file uikitTabBar.ts
 * @input Nothing; data only
 * @output Exports `tabBar`: the iOS 26 floating tab bar's geometry, its
 *   badge, and the selection lens's springs and values.
 * @position TabBar's own UIKit values, beside the component that reads them;
 *   read by its touch presentation and tabBarModel.ts
 *
 * SYNC: When modified, update tabBarModel.ts and uikitTabBar.test.ts.
 */

/**
 * Every value was read from a stock UITabBarController on the iOS 26.2
 * simulator, iPhone 17 Pro (402 × 874 pt, bottom safe area 34 pt). The
 * controller held four UITabs and a UISearchTab, each a UINavigationController
 * over a long table. The sources were the bar's view tree, its presentation
 * frames every frame, the springs UIKit attached, and HID touches. Geometry is
 * in points, in the bar's own coordinates unless a value says otherwise.
 * Springs keep UIKit's terms (response in seconds, damping ratio). No value is
 * a motion role: each plays as measured.
 */

/**
 * UITabBar on iOS 26 (floating, Liquid Glass).
 */
export const tabBar = {
  /**
   * The capsule that holds the items: 62 pt tall.
   * @source measured: UIKit lab (injected host app), iOS 26.2 simulator,
   *   iPhone 17 Pro, `_UITabBarPlatterView` frame 290 × 62 at (21, 791),
   *   Oct 23 2026
   */
  barHeight: 62,
  /**
   * The capsule's distance from the screen's leading and trailing edges, and
   * from its bottom edge. The capsule sits 13 pt inside the 34 pt home
   * indicator area.
   * @source measured: UIKit lab (injected host app), iOS 26.2 simulator, iPhone
   *   17 Pro, `_UITabBarPlatterView` at x 21 and y 791 + 62 = 853 on an 874 pt
   *   screen, Oct 23 2026
   */
  barInset: 21,
  /**
   * Without a search tab the capsule is no wider than 16 + 86 pt per tab. It is
   * centred when that is narrower than the screen allows: 188 pt with two tabs,
   * 274 with three. Four tabs reach the 360 pt an iPhone 17 Pro allows.
   * @source measured: UIKit lab (injected host app), iOS 26.2 simulator, iPhone
   *   17 Pro, `_UITabBarPlatterView` 188 pt at x 107 (two tabs) and 274 pt at x
   *   64 (three tabs), 360 pt at x 21 (four and five tabs), Oct 24 2026
   */
  naturalWidth: {base: 16, perTab: 86},
  /**
   * Every item, and the resting lens over the selected one, has one width. For
   * n tabs in a capsule P pt wide it is 1.0659 × P ÷ n + 0.0436 × P − 14.61.
   * That is 98 for four tabs in 360 pt, and 76 with the search tab's 290 pt.
   * The first and last items sit `itemInset` from the capsule's edges and the
   * others are spread evenly between them, so neighbours overlap.
   * @source measured: UIKit lab (injected host app), iOS 26.2 simulator, iPhone
   *   17 Pro, `_UITabButton` frames in eight layouts (two to five tabs, with
   *   and without the search tab): least-squares fit, within 1 pt of every row;
   *   one-letter labels give the same widths, a label wider than ~60 pt widens
   *   every item (not modelled), Oct 24 2026
   */
  itemWidth: {perSlot: 1.0659, perBar: 0.0436, offset: -14.61},
  /**
   * @source measured: UIKit lab (injected host app), iOS 26.2 simulator,
   *   iPhone 17 Pro, `_UITabButton` 54 pt tall at y 795, Oct 23 2026
   */
  itemHeight: 54,
  /**
   * @source measured: UIKit lab (injected host app), iOS 26.2 simulator,
   *   iPhone 17 Pro, items at y 795 in the capsule at y 791, the first at
   *   x 25 in the capsule at x 21, Oct 23 2026
   */
  itemInset: 4,
  /**
   * The icon's box, centred in the item 20 pt below its top. SF Symbols render
   * 25 to 29 pt tall and 25 to 33 pt wide in the stock bar.
   * @source measured: UIKit lab (injected host app), iOS 26.2 simulator, iPhone
   *   17 Pro, `UIImageView` frames (33.3 × 28, 27 × 25, 33.3 × 29.3, 25.3 ×
   *   24.7, centres 19.7 to 20 pt below the item's top), Oct 23 2026
   */
  iconSize: 28,
  /**
   * @source measured: UIKit lab (injected host app), iOS 26.2 simulator,
   *   iPhone 17 Pro, icon centres at y 814.7 to 815 for items at y 795,
   *   Oct 23 2026
   */
  iconCenterY: 20,
  /**
   * The label: 10 pt, medium; the selected look is semibold. Its 12 pt box
   * starts 35 pt below the item's top.
   * @source measured: UIKit lab (injected host app), iOS 26.2 simulator,
   *   iPhone 17 Pro, `.SFUI-Medium 10.0` / `.SFUI-Semibold 10.0`, label
   *   frames 12 pt tall at y 830, Oct 23 2026
   */
  labelSize: 10,
  /**
   * @source measured: UIKit lab (injected host app), iOS 26.2 simulator,
   *   iPhone 17 Pro, label frames at y 830 for items at y 795, Oct 23 2026
   */
  labelTop: 35,

  badge: {
    /**
     * The badge's height (a 55 ÷ 3 pt capsule), and its minimum width: a
     * one-character value is a circle, "12" is 21.33 wide.
     * @source measured: UIKit lab (injected host app), iOS 26.2 simulator,
     *   iPhone 17 Pro, `_UIBarBadgeView` 18.33 × 18.33 for "1", "3" and "!",
     *   21.33 × 18.33 for "12", corner radius 9.17, Oct 23 2026
     */
    height: 18.333,
    /**
     * Horizontal padding around the text (the label sits 4 pt in, 2 pt down).
     * @source measured: UIKit lab (injected host app), iOS 26.2 simulator,
     *   iPhone 17 Pro, badge at x 140.67, its label at x 144.67, Oct 23 2026
     */
    paddingInline: 4,
    /**
     * The text: 12 pt, medium, white on the system red.
     * @source measured: UIKit lab (injected host app), iOS 26.2 simulator,
     *   iPhone 17 Pro, badge label `SF Medium 12` (weight 0.23), white, fill
     *   systemRed (1, 0.220, 0.235) light / (1, 0.259, 0.271) dark,
     *   Oct 24 2026
     */
    fontSize: 12,
    /**
     * Where it sits: its leading edge 9 pt after the item's centre, its top
     * 2 pt below the item's top (over the icon's top-trailing corner).
     * @source measured: UIKit lab (injected host app), iOS 26.2 simulator,
     *   iPhone 17 Pro, badge at (140.67, 797) on the item centred at 131.67
     *   with its top at 795, Oct 23 2026
     */
    offsetX: 9,
    /**
     * @source measured: UIKit lab (injected host app), iOS 26.2 simulator,
     *   iPhone 17 Pro, badge top 797, item top 795, Oct 23 2026
     */
    offsetY: 2,
    /**
     * Setting, changing or clearing the value never animates.
     * @source measured: UIKit lab (injected host app), iOS 26.2 simulator,
     *   iPhone 17 Pro, `UITab.badgeValue` nil → "1" → "12" → "!" → nil at
     *   1 s intervals, per-frame badge frames and opacity, Oct 23 2026
     */
    animates: false,
  },

  /**
   * The lens travelling to a landing finger, and the slide of a selection set
   * without a finger (keys, the app). Response 0.40 s, damping ratio 0.85, the
   * same spring as the segmented control's selection.
   * @source measured: UIKit lab (injected host app), iOS 26.2 simulator, iPhone
   *   17 Pro, UIViewSpringAnimationBehavior (dampingRatio 0.85, response 0.4)
   *   attached at touch-down, Oct 23 2026
   * @source measured: UIKit lab (injected host app), iOS 26.2 simulator, iPhone
   *   17 Pro, least-squares fit of the lens's per-frame position in the bar's
   *   coordinates: a press travelling 137 pt (rms 0.84 pt) and three
   *   programmatic changes (rms 0.28 to 0.77 pt), Oct 23 2026
   */
  lensTravel: {response: 0.4, dampingRatio: 0.85},
  /**
   * The lens chasing a dragging finger.
   * @source measured: UIKit lab (injected host app), iOS 26.2 simulator,
   *   iPhone 17 Pro, UIViewSpringAnimationBehavior tracking response 0.15,
   *   damping ratio 1, and a spring-chasing-the-finger fit of the lens over
   *   a 600 ms drag (rms 0.83 pt) and a 150 ms drag (rms 1.6 pt),
   *   Oct 23 2026
   */
  lensTrack: {response: 0.15, dampingRatio: 1},
  /**
   * The lens settling onto the committed item after the finger lifts,
   * starting from its velocity on screen.
   * @source measured: UIKit lab (injected host app), iOS 26.2 simulator,
   *   iPhone 17 Pro, UIViewSpringAnimationBehavior (dampingRatio 1,
   *   response 0.5) attached at the lift, and a fit of the settle after a
   *   drag released at 1500 pt/s (rms 0.67 pt), Oct 23 2026
   */
  lensSettle: {response: 0.5, dampingRatio: 1},
  /**
   * The lift, as one progress from rest (0) to lifted (1). The lens's outset,
   * its resting fill fading out and the magnification all follow it, on the
   * press and on the release alike.
   * @source measured: UIKit lab (injected host app), iOS 26.2 simulator, iPhone
   *   17 Pro, UIViewSpringAnimationBehavior (dampingRatio 1, response 0.25)
   *   attached at touch-down and at the lift; the fill's opacity fits it with
   *   rms 0.0004 (press) and 0.0013 (release), the outset with rms 0.2 pt, Oct
   *   23 2026
   */
  lift: {response: 0.25, dampingRatio: 1},
  /**
   * How far the lifted lens grows past the item on every side, in the bar's
   * own coordinates: 76 × 54 becomes 92 × 70.
   * @source measured: UIKit lab (injected host app), iOS 26.2 simulator,
   *   iPhone 17 Pro, the lens held still for 1 s: 91.9 × 70.15 in the
   *   bar's coordinates (96.4 × 73.6 on screen under the flex), Oct 23 2026
   */
  liftOutset: 8,
  /**
   * The selected copy of the items under the lifted lens grows by this
   * factor about each item's centre (the copy outside the lens does not).
   * @source measured: UIKit lab (injected host app), iOS 26.2 simulator,
   *   iPhone 17 Pro, the selected `_UITabButton`'s scale reads 1.16 while
   *   held and follows 1 + 0.16 × the lift progress (1.0990 at a progress
   *   of 0.619, 1.1356 at 0.848), Oct 23 2026
   */
  liftMagnification: 1.16,
  /**
   * While a finger is on the bar the whole capsule grows about its centre
   * by this factor (290 × 62 becomes 304.1 × 65.0).
   * @source measured: UIKit lab (injected host app), iOS 26.2 simulator,
   *   iPhone 17 Pro, `_UITabBarPlatterView` 304.14 × 65.02 while held,
   *   Oct 23 2026
   */
  flexScale: 1.0488,
  /**
   * The flex growing while the finger is down.
   * @source measured: UIKit lab (injected host app), iOS 26.2 simulator,
   *   iPhone 17 Pro, UIViewSpringAnimationBehavior tracking damping ratio
   *   0.625, response 0.314; the capsule's scale fits it with rms 0.00009,
   *   Oct 23 2026
   */
  flexPress: {response: 0.314, dampingRatio: 0.625},
  /**
   * The flex relaxing after the lift.
   * @source measured: UIKit lab (injected host app), iOS 26.2 simulator,
   *   iPhone 17 Pro, UIViewSpringAnimationBehavior (dampingRatio 0.6,
   *   response 0.36); the capsule's scale fits it with rms 0.0002,
   *   Oct 23 2026
   */
  flexRelease: {response: 0.36, dampingRatio: 0.6},
  /**
   * Past the first or last item's centre the lens rubber-bands with UIKit's
   * formula (c = 0.55) over this dimension. A finger 60 pt past the last item
   * leaves the lens 8 pt past it.
   * @source measured: UIKit lab (injected host app), iOS 26.2 simulator, iPhone
   *   17 Pro, a drag held 60 pt past the last item: the lens rests 7.98 pt past
   *   its centre, Oct 23 2026
   */
  lensEdgeDimension: 10.5,
} as const;

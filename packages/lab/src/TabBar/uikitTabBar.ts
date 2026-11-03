// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file uikitTabBar.ts
 * @input Nothing; data only
 * @output Exports `tabBar`: the iOS 26 floating tab bar's geometry, its
 *   badge, and the selection lens's springs and values. Also the bar's
 *   minimize, accessory and search motion.
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
 *
 * Open measurements: a value whose source is a guess names its task with
 * `@measure`.
 * - M-TB1, the minimize glass morph. On a stock UITabBarController with
 *   `.onScrollDown` over a long list, scroll down past the trigger, back to the
 *   top, and tap the circle. Read from 60 fps video what the screen shows
 *   between the bar and the circle (the platter's outline, the items' opacity
 *   or blur, the lens).
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
  /**
   * Minimize on scroll (`tabBarMinimizeBehavior = .onScrollDown`): how far
   * the content scrolls down, from where the downward scroll started, before
   * the bar collapses into its minimized circle. A scroll back up does not
   * expand it; reaching the top does (and a tap on the circle).
   * @source measured: UIKit lab (injected host app), iOS 26.2 simulator,
   *   iPhone 17 Pro, slow drags: minimized after 65 pt of content scroll from
   *   the top and after 66.3 pt starting at offset 384; a slow 137 pt and a
   *   coasting 760 pt reverse scroll mid-content did not expand, Oct 24 2026
   */
  minimizeDistance: 66,
  /**
   * The minimized bar: a circle this wide at the leading end, concentric with
   * the bar's leading cap. It sits 7 pt in from the bar's leading and bottom
   * edges. It holds the selected tab's icon in the selected colour.
   * @source measured: UIKit lab (injected host app), iOS 26.2 simulator, iPhone
   *   17 Pro, the minimized `_UITabBarPlatterView` 48 × 48 at (28, 798) under a
   *   bar at (21, 791), with tab 1 or tab 3 selected; its one `_UITabButton`
   *   holds only the selected icon, tinted, Oct 24 2026
   */
  minimizedSize: 48,
  /**
   * The lens travelling into the minimized circle (its centre).
   * @source measured: UIKit lab (injected host app), iOS 26.2 simulator,
   *   iPhone 17 Pro, least-squares fit of the lens's per-frame x as it
   *   collapsed from tab 3 to the leading circle (rms 0.8 pt), Oct 24 2026
   */
  collapseTravel: {response: 0.4, dampingRatio: 0.85},
  /**
   * The lens's size between the item and the circle, both ways; the
   * platter contracts and grows on it too.
   * @source measured: UIKit lab (injected host app), iOS 26.2 simulator,
   *   iPhone 17 Pro, least-squares fits of the lens's per-frame width:
   *   76 to 48 collapsing (rms 0.7 pt) and 48 to 98 expanding (rms
   *   0.15 pt), Oct 24 2026
   */
  collapseSize: {response: 0.6, dampingRatio: 0.85},
  /**
   * The tab items fading while the glass morphs between the bar and the
   * circle, and the selected copy inside the lens with them.
   * @source GUESS — UIKit morphs the glass on its compositor: layer
   *   properties only show the circles appearing in one frame at the start
   *   and the bar's items, lens and platter disappearing in one frame
   *   0.75 s later (iOS 26.2 simulator, Oct 24 2026), so what a person sees
   *   in between is still to be read from video
   * @measure M-TB1
   */
  minimizeFade: {response: 0.25, dampingRatio: 1},
  /**
   * With a search tab (`UISearchTab`) the bar's tabs share a narrower capsule.
   * The search tab is a circle as tall as the bar, this far after the capsule
   * at the trailing end (290 + 8 + 62 = 360). Minimized, it shrinks to
   * `minimizedSize` about its centre, and its glyph does not change.
   * @source measured: UIKit lab (injected host app), iOS 26.2 simulator, iPhone
   *   17 Pro, the platter at (21, 791, 290 × 62) and the search circle at (319,
   *   791, 62 × 62) with three and four tabs; minimized, the search circle at
   *   (326, 798, 48 × 48) with its 28 pt glyph unchanged, Oct 24 2026
   */
  searchGap: 8,
  /**
   * The search tab selected: the bar collapses to the leading circle, and the
   * search field sits inline in the bar's row. The field sits this far after
   * the circle and is concentric with the trailing cap (88 to 374 beside a
   * circle ending at 76).
   * @source measured: UIKit lab (injected host app), iOS 26.2 simulator, iPhone
   *   17 Pro, UISearchTab with and without automaticallyActivatesSearch: the
   *   inline field at (88, 798, 286 × 48) beside the leading circle at (28,
   *   798), Oct 24 2026
   */
  searchFieldGap: 12,
  /**
   * The active search field, above the keyboard, sits this far from the
   * screen's edges. At the trailing end it leaves room for the 48 pt cancel
   * button and the gap before it. The field spans 8 to 338, and the button is
   * centred at 370.
   * @source measured: UIKit lab (injected host app), iOS 26.2 simulator, iPhone
   *   17 Pro, the active field at (8, 483, 330 × 48) and the cancel button
   *   centred at (370, 507), Oct 24 2026
   */
  searchActive: {inset: 8, cancelSize: 48, cancelGap: 8},
  /**
   * The search field's glass between its inline and active places (x and
   * width). On activation it starts with this inward width velocity, in pt/s.
   * The glass squashes as it starts to move: 286 → 255 → 260 → 279 → … → 330.
   * @source measured: UIKit lab (injected host app), iOS 26.2 simulator, iPhone
   *   17 Pro, a joint fit of the field's per-frame width activating from the
   *   expanded bar and from the minimized bar (rms 1.3 pt), Oct 24 2026
   */
  searchMorph: {response: 0.244, dampingRatio: 1.108},
  /**
   * @source measured: UIKit lab (injected host app), iOS 26.2 simulator,
   *   iPhone 17 Pro, the same joint fit's initial width velocity, Oct 24 2026
   */
  searchSquashVelocity: -3424,
  /**
   * Active, the search field sits above the software keyboard, its bottom
   * this far over the keyboard's top (531 over 539).
   * @source measured: UIKit lab (injected host app), iOS 26.2 simulator,
   *   iPhone 17 Pro, UISearchTab with a UISearchController: the active field
   *   at (8, 483, 330 × 48) over the keyboard's top at 539, Oct 24 2026
   */
  searchKeyboardGap: 8,
  /**
   * Active, the search circle is the field's cancel button. At the minimized
   * circle's place it appears this long after the tap (opacity 0 → 1 within a
   * frame).
   * @source measured: UIKit lab (injected host app), iOS 26.2 simulator, iPhone
   *   17 Pro, the cancel button (a 48 pt UIButton in its own platter) at (326,
   *   798) with opacity 0 until 0.12–0.13 s after the tap, Oct 24 2026
   */
  searchCancelDelay: 0.12,
  /**
   * Pressed, the cancel button grows from the minimized size to this,
   * about its centre (48 → 63.65), on `searchCancelPress`.
   * @source measured: UIKit lab (injected host app), iOS 26.2 simulator,
   *   iPhone 17 Pro, the cancel button's per-frame size from the touch
   *   (48 → 49.5 → 52.2 → 58.2 → … → 63.65), Oct 24 2026
   */
  searchCancelPressedSize: 63.65,
  /**
   * The cancel button's press, to `searchCancelPressedSize`.
   * @source measured: UIKit lab (injected host app), iOS 26.2 simulator,
   *   iPhone 17 Pro, a fit of the cancel button's per-frame size from the
   *   touch (rms 0.6 pt), Oct 24 2026
   */
  searchCancelPress: {response: 0.145, dampingRatio: 0.746},
  /**
   * Released, the cancel button shrinks back to the minimized size with a
   * wobble (63.65 → 43.6 → 49.2 → 48).
   * @source measured: UIKit lab (injected host app), iOS 26.2 simulator,
   *   iPhone 17 Pro, the cancel button's per-frame size from the release
   *   (rms 0.03 pt), Oct 24 2026
   */
  searchCancelReturn: {response: 0.399, dampingRatio: 0.374},
  /**
   * The bottom accessory (`UITabBarController.bottomAccessory`, Music's mini
   * player): a capsule this tall, as wide as the bar and this far above it.
   * Minimized, it sits inline between the circle and the bar's trailing end,
   * `accessoryGap` after the circle and concentric with the trailing cap.
   * @source measured: UIKit lab (injected host app), iOS 26.2 simulator, iPhone
   *   17 Pro, four tabs: the accessory at (21, 735, 360 × 48) over a bar at
   *   (21, 791); minimized at (84, 798, 290 × 48) beside the circle at (28,
   *   798), and (84, 798, 234 × 48) ending 8 pt before the search circle, Oct
   *   24 2026
   */
  accessoryHeight: 48,
  /**
   * @source measured: UIKit lab (injected host app), iOS 26.2 simulator,
   *   iPhone 17 Pro, 8 pt between the accessory and the bar (735 + 48 to
   *   791) and between the minimized circle and the inline accessory (76 to
   *   84), Oct 24 2026
   */
  accessoryGap: 8,
  /**
   * The accessory moving down inline as the bar minimizes: its x, y and
   * width on one spring.
   * @source measured: UIKit lab (injected host app), iOS 26.2 simulator,
   *   iPhone 17 Pro, a joint least-squares fit of the accessory's per-frame
   *   x, y and width collapsing (rms 0.94 pt), Oct 24 2026
   */
  accessoryCollapse: {response: 0.405, dampingRatio: 0.745},
  /**
   * The accessory moving back up as the bar expands.
   * @source measured: UIKit lab (injected host app), iOS 26.2 simulator,
   *   iPhone 17 Pro, a joint least-squares fit of the accessory's per-frame
   *   x, y and width expanding (rms 1.1 pt), Oct 24 2026
   */
  accessoryExpand: {response: 0.329, dampingRatio: 0.731},
} as const;

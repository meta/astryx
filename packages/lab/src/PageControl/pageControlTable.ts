// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file pageControlTable.ts
 * @input Nothing; data only
 * @output Exports `pageControl`: UIPageControl's measured geometry, alphas,
 *   tap and scrub rules, indicator window, fades and jog past the edge
 * @position PageControl's own measured table; only PageControl reads it
 *
 * The values come from a stock UIPageControl on the iOS 26.2 simulator.
 * Geometry is in points. Touch motion stays internal, with no theme role.
 *
 * SYNC: When modified, update pageControlModel.ts.
 */

/** UIPageControl on iOS 26. */
export const pageControl = {
  /**
   * Diameter of one page indicator.
   * @source measured: UIKit lab, iPhone 17 Pro simulator, Oct 23 2026. A
   *   5-page control: indicator dots 9.67 pt.
   */
  indicatorSize: 9.67,
  /**
   * Space between neighbouring indicators.
   * @source measured: UIKit lab, iPhone 17 Pro simulator, Oct 23 2026. A
   *   5-page control: the indicator strip is 80.3 pt wide, 5 × 9.67 + 4 × 8.
   */
  indicatorSpacing: 8,
  /**
   * Space between the strip and the control's leading and trailing edges.
   * @source measured: UIKit lab, iPhone 17 Pro simulator, Oct 23 2026. A
   *   5-page control 108.3 pt wide around an 80.3 pt strip.
   */
  horizontalPadding: 14,
  /**
   * The control's height.
   * @source measured: UIKit lab, iPhone 17 Pro simulator, Oct 23 2026.
   *   intrinsicContentSize 108.3 × 25.67 at 5 pages and 161.3 × 25.67 at 50.
   */
  height: 25.67,
  /**
   * The control is never wider than this, however many pages: past it the
   * indicators scroll in a window (size(forNumberOfPages: 50) is 903.3 pt).
   * @source measured: UIKit lab, iPhone 17 Pro simulator, Oct 23 2026.
   *   intrinsicContentSize capped at 161.3 pt wide at 50 pages.
   */
  maxWidth: 161.3,
  /**
   * Opacity of the current page's indicator, of the indicator colour.
   * @source measured: UIKit lab, iPhone 17 Pro simulator, Oct 23 2026. The
   *   default tint renders the current indicator white α 1 in light and dark
   *   (#FFFFFF over black).
   */
  currentIndicatorAlpha: 1,
  /**
   * Opacity of every other page's indicator, of the indicator colour.
   * @source measured: UIKit lab, iPhone 17 Pro simulator, Oct 23 2026. The
   *   default tint renders the other indicators white α 0.45 in light and dark
   *   (#737373 over black).
   */
  otherIndicatorAlpha: 0.45,
  /**
   * A tap on the trailing side of the current page's indicator moves one
   * page forward. A tap on the leading side moves one back. The control
   * reports the change when the finger lifts.
   * @source measured: UIKit lab, iPhone 17 Pro simulator, Oct 23 2026. HID
   *   taps on a 5-page control: valueChanged at the lift, about 70–90 ms after
   *   the touch, one page per tap.
   */
  tapStep: 1,
  /**
   * How far a finger travels from where it landed before the control
   * scrubs: from then on the page is the indicator under the finger.
   * Movement alone starts it; holding first changes nothing.
   * @source measured: UIKit lab, iPhone 17 Pro simulator, Oct 24 2026. HID
   *   drags across 5- and 50-page controls, from a still touch and after an
   *   800 ms hold. The first page change comes at 16.3 and 16.7 pt.
   */
  scrubStartDistance: 16,
  /**
   * While scrubbing, the page switches at the midpoint between two
   * indicators' centres: one page per indicator pitch (9.67 + 8 pt), the
   * same going back.
   * @source measured: UIKit lab, iPhone 17 Pro simulator, Oct 24 2026. A
   *   5-page control: changes at x 192.3, 210.3, 229.0 against midpoints 192.3,
   *   210.2, 227.8 between indicator centres.
   */
  scrubSwitchPoint: 0.5,
  /**
   * A finger held on the control turns it interactive after this many
   * milliseconds, moving or not. Then the platter shows, and the other
   * indicators dim to `interactingOtherIndicatorAlpha`.
   * @source measured: UIKit lab, iPhone 17 Pro simulator, Oct 24 2026. The
   *   indicators' contentsMultiplyColor animations start 153–160 ms after
   *   touch-down, interactionState 2.
   */
  interactionDelayMs: 155,
  /**
   * Opacity of the indicators other than the current one while a finger is
   * on the control.
   * @source measured: UIKit lab, iPhone 17 Pro simulator, Oct 24 2026. Held
   *   control: the other indicators' tint alpha 0.25.
   */
  interactingOtherIndicatorAlpha: 0.25,
  /**
   * At most this many indicator slots show. Past it the row is a window
   * that moves only when the current page would land in a shrunk slot.
   * @source measured: UIKit lab, iPhone 17 Pro simulator, Oct 24 2026. A
   *   50-page control at pages 0, 10, 25 and 49: ten slots on the 17.67 pt
   *   pitch, centred on the control.
   */
  visibleSlots: 10,
  /**
   * Where pages continue past the window, its last two slots on that side
   * shrink to these diameters, outermost last; the slots beyond show
   * nothing.
   * @source measured: UIKit lab, iPhone 17 Pro simulator, Oct 24 2026. A
   *   50-page control: edge indicators 7.33 and 4.31 pt (scale 0.7588 and
   *   0.4461).
   */
  edgeIndicatorSizes: [7.33, 4.31],
  /**
   * When the window moves, every indicator slides to its new slot and
   * takes its new size on this spring.
   * @source measured: UIKit lab, iPhone 17 Pro simulator, Oct 24 2026. A
   *   50-page control at page 10 tapped to 11: UIView spring dampingRatio 1,
   *   response 0.15 (tracking), the strip sliding 17.67 pt in about 0.2 s.
   */
  windowSlide: {response: 0.15, dampingRatio: 1},
  /**
   * The window starts to move this many milliseconds after the page changes;
   * the new current indicator lights first, in its shrunk slot.
   * @source measured: UIKit lab, iPhone 17 Pro simulator, Oct 24 2026. A
   *   50-page control at page 10 tapped to 11: the strip starts to slide about
   *   50 ms after valueChanged.
   */
  windowSlideDelayMs: 50,
  /**
   * After a tap, the indicator that stops being current fades to the
   * other indicators' opacity over this many milliseconds, on `fadeOutCurve`.
   * @source measured: UIKit lab, iPhone 17 Pro simulator, Oct 24 2026. Taps:
   *   contentsMultiplyColor CABasicAnimation 0.125 s.
   */
  tapFadeOutMs: 125,
  /**
   * After any other page change (scrubbing, or the app setting the page),
   * the indicator that stops being current fades over this many
   * milliseconds.
   * @source measured: UIKit lab, iPhone 17 Pro simulator, Oct 24 2026.
   *   Programmatic currentPage changes and scrubs: contentsMultiplyColor
   *   CABasicAnimation 0.25 s.
   */
  fadeOutMs: 250,
  /**
   * The curve of both fades out.
   * @source measured: UIKit lab, iPhone 17 Pro simulator, Oct 24 2026. The
   *   fade's timing function control points (0, 0, 0.58, 1).
   */
  fadeOutCurve: [0, 0, 0.58, 1],
  /**
   * Any other opacity change takes this many milliseconds: a switch. Such
   * changes are the new current indicator lighting, the platter showing, and
   * the others dimming under a finger and recovering at the lift.
   * @source measured: UIKit lab, iPhone 17 Pro simulator, Oct 24 2026.
   *   contentsMultiplyColor and opacity CABasicAnimations 0.015625 s.
   */
  switchMs: 15.625,
  /**
   * The curve of those switches.
   * @source measured: UIKit lab, iPhone 17 Pro simulator, Oct 24 2026. The
   *   switch's timing function control points (0.42, 0, 0.58, 1).
   */
  switchCurve: [0.42, 0, 0.58, 1],
  /**
   * Past the window's edge, while scrubbing toward the last page, the
   * control steps pages on its own. The rate is this many pages per second
   * for each point the finger is past the content's edge.
   * @source measured: UIKit lab, iPhone 17 Pro simulator, Oct 24 2026. A
   *   50-page control scrubbed right at 40 pt/s. Intervals ran from 266 ms at
   *   19 pt past the content edge to 66 ms at 76 pt. A least-squares fit gives
   *   0.173 pages/s per pt.
   */
  jogRatePerPoint: 0.173,
  /**
   * The same toward the first page, where the run is slower.
   * @source measured: UIKit lab, iPhone 17 Pro simulator, Oct 24 2026. A
   *   50-page control scrubbed left: the steps settled at 10 pages/s 77 pt past
   *   the content edge, where the rightward rate gives 13.3.
   */
  jogRatePerPointBackward: 0.13,
  /**
   * The fastest the control steps pages past the window's edge, pages per
   * second.
   * @source measured: UIKit lab, iPhone 17 Pro simulator, Oct 24 2026. A
   *   50-page control held 108 pt past the content edge: one page every 61–71
   *   ms.
   */
  jogMaxRate: 15,
} as const;

// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file picker.ts
 * @input Nothing; data only
 * @output `picker`, UIPickerView's measured constants, and
 *   `registerPickerTable`, which makes the tap spin's duration a motion role
 * @position The picker domain of the UIKit table (motion/uikit); read by
 *   DateInput's wheelPhysics.ts, wheelStrip.ts and PickerWheel.tsx
 *
 * Lengths are pt at UIKit's scale, times ms and velocities pt/ms. Every leaf
 * carries one `@source`, as uikit.test.ts enforces.
 *
 * SYNC: When modified, update motion/MEASUREMENTS.md and PickerWheel.tsx.
 */

import {registerMotionTable} from '../roles';

export const picker = {
  geometry: {
    /**
     * Row pitch: rows sit at k × 32 pt in each column's table.
     * @source measured: UIKit lab (injected host app), iOS 26.2 simulator,
     *   iPhone 17 Pro, UIPickerView table offsets and cell frames, Oct 23 2026
     */
    rowHeight: 32,
    /**
     * The picker's height (its intrinsic content size).
     * @source measured: UIKit lab (injected host app), iOS 26.2 simulator,
     *   iPhone 17 Pro, UIPickerView frame, Oct 23 2026
     */
    height: 216,
    /**
     * d of the rubber band past the first or last row. The column's table view
     * is 291 pt tall in a 216 pt picker. With c = 0.55, scroll.rubberBand's
     * formula puts 10, 50 and 110 pt of finger travel past the end at 5.4, 25.1
     * and 50.1 pt. The measured values are 5.3, 25 and 50.
     * @source measured: UIKit lab (injected host app), iOS 26.2 simulator,
     *   iPhone 17 Pro, UIPickerTableView frame and offsets during drags
     *   20, 60 and 120 pt past the last row, Oct 23 2026
     */
    rubberBandDimension: 291,
  },
  release: {
    /**
     * The speed at which a coast ends. The scroll view projects the target at
     * offset + (v − this) × r ÷ (1 − r), with r = scroll.decelerationRate
     * .normal. That gives 461.33, 502.67 and 266.67 pt for v = 0.9334, 1.0162
     * and 0.5436, all three to 0.3 pt. The coast onto the row it snaps to keeps
     * the release velocity. It re-solves the rate so that the speed reaches
     * this exactly at that row, where it stops. Two coasts fit it to 0.4 and
     * 0.3 pt RMS, ending within 30 ms of the measured end.
     * @source measured: UIKit lab (injected host app), iOS 26.2 simulator,
     *   iPhone 17 Pro, scrollViewWillEndDragging targets and per-frame
     *   offsets to rest, Oct 23 2026
     */
    stopSpeed: 0.0089,
    /**
     * Below this release speed (pt/ms, a scroll view's release velocity), a
     * release inside the rows carries no velocity. The wheel then snaps to the
     * nearest row instead of coasting. Past the first or last row the velocity
     * is kept, however small (0.0816 kept). A pause before the lift does not
     * zero it: the velocity changes only when the finger moves.
     * @source measured: UIKit lab (injected host app), iOS 26.2 simulator,
     *   iPhone 17 Pro, steady 100 pt drags mid-list lifted while moving: zeroed
     *   at 100 to 250 pt/s both ways, passed from 260 pt/s (0.2577 the
     *   smallest velocity handed on); a 300 pt/s drag held still 300 ms
     *   still coasted, Oct 23 2026
     */
    minimumSpeed: 0.25,
  },
  /**
   * A release without velocity, or a coast already on a row, eases onto the
   * nearest row exponentially. Each millisecond it covers this fraction of the
   * distance left: e^(−0.011 t), done in about 0.3 s. Snaps of 4, 6 and 8 pt
   * fit 0.0099, 0.0107 and 0.0123.
   * @source measured: UIKit lab (injected host app), iOS 26.2 simulator,
   *   iPhone 17 Pro, per-frame offsets after three slow releases between
   *   rows, Oct 23 2026
   */
  snapRate: 0.011,
  tapSpin: {
    /**
     * A tap on a row turns the wheel onto it in this long (setContentOffset
     * animated), on Core Animation's ease-in-ease-out (timing.curves.move). The
     * row is selected on arrival. A tap on the band's row does nothing.
     * @source measured: UIKit lab (injected host app), iOS 26.2 simulator,
     *   iPhone 17 Pro, per-frame offsets after a tap two rows below the band
     *   (6.8, 25.1, 50.2, 75.4, 93.7 % at 50 ms steps, arriving at 300 ms;
     *   the same with Reduce Motion and Prefer Cross-Fade on), Oct 23 2026
     */
    durationMs: 300,
  },
  selectionTick: {
    /**
     * One selection haptic per row whose centre reaches the band's centre,
     * at most one per this interval. Not during a tap's spin.
     * @source measured: UIKit lab (injected host app), iOS 26.2 simulator,
     *   iPhone 17 Pro, selectionChangedAtLocation: and the feedback
     *   generator's minimum interval (0.040 s) logged during drags and
     *   coasts, Oct 23 2026
     */
    minimumIntervalMs: 40,
  },
} as const;

/**
 * Registers the tap spin's duration as an internal motion role,
 * `picker.tapSpin.durationMs`. Every other value stays an internal measured
 * constant. The tap spin is the measured reference: the wheel's turns play
 * `springs.settle`, and its bounce at an end is `scroll.bounce`. A page that
 * plays no picker motion ships no picker registry. The module registers its
 * own table at import (one idempotent in-memory write, no DOM).
 */
export function registerPickerTable(): void {
  registerMotionTable('picker', picker, {roles: ['tapSpin.durationMs']});
}

registerPickerTable();

// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file list.ts
 * @input `timing` (the press clocks the touch press model measured)
 * @output Exports `list`: the clocks and curves of UITableView and
 *   UICollectionView list cells (the cell highlight's release)
 * @position The list domain of the UIKit constants table (motion/uikit);
 *   read by the row press layer (utils/rowPressLayer.ts,
 *   `rowPressLayerStyles.cell`) through its build-time mirror,
 *   `cellPressConsts` in utils/rowPressLayer.stylex.ts
 *
 * Every leaf carries one or more `@source`; GUESS values also carry the
 * `@measure` task that will confirm or replace them (MEASUREMENTS.md, M-LI
 * rows). uikit.test.ts enforces both. Durations are in ms; curves are
 * cubic-bézier control points [x1, y1, x2, y2].
 *
 * SYNC: When modified, update:
 * - /packages/core/src/motion/MEASUREMENTS.md
 * - /packages/core/src/utils/rowPressLayer.stylex.ts (`cellPressConsts`
 *   mirrors the cell release; interactionOverlay.cell.test.ts checks it)
 */

import {timing} from './timing';

export const list = {
  highlight: {
    /**
     * After the finger lifts, a cell's highlight leaves over this long:
     * UIKit's deselect cross-fade, the clock the row's release fades over;
     * the touch press model ends the press when that fade does.
     * @source measured: Settings and Contacts, iOS 26.2, simulator driven
     *   with real HID touches at 60 fps (PRESS_FADE_MS,
     *   packages/core/src/utils/pressGesture.ts, 2026-10-06)
     */
    releaseMs: timing.press.highlightOutMs,
    /**
     * The release's curve: an ease-out that spends the whole clock fading
     * (strength ≈ 0.2 at the midpoint), the curve the touch press model
     * shipped with.
     * @source GUESS — the curve the touch press model shipped with (the
     *   overlay's release, utils/interactionOverlay.stylex.ts), chosen to read as a deselect
     *   cross-fade, not read from UIKit; the curve Core Animation attaches to
     *   the cell's deselect is to be read
     * @measure M-LI01
     */
    releaseCurve: timing.press.highlightOutCurve,
  },
} as const;

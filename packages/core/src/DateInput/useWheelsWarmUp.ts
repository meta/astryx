// Copyright (c) Meta Platforms, Inc. and affiliates.
'use client';

/**
 * @file useWheelsWarmUp.ts
 * @input Whether the sheet holding the month/year wheels is open
 * @output Exports `useWheelsWarmUp`: true once the open sheet has settled and
 *   the main thread is idle, so the hidden wheels lay out before the toggle
 * @position Internal hook of the pickers' touch layer (datePickerTouch.ts)
 *
 * WebKit builds a layer for every wheel row in the commit that shows them.
 * Built inside the toggle's commit, that cost the fade's first frames.
 *
 * SYNC: When modified, update useWheelsWarmUp.test.tsx and
 * MonthYearToggle.interaction.browser.spec.ts.
 */

import {useEffect, useState} from 'react';

/**
 * How long the sheet's present motion (`springs.sheetPresent`) takes to
 * settle, in milliseconds. A constant, not a table read, so the pickers ship
 * none of the springs table's other rows. The test pins it to the spring.
 */
export const SHEET_SETTLE_MS = 506;

/** The longest an idle callback may wait before the wheels warm anyway. */
const IDLE_TIMEOUT_MS = 300;

/**
 * True once the sheet has been open for its present motion's settling
 * duration and the main thread has gone idle; false while it is closed. The
 * caller then shows the hidden wheels at opacity 0, still inert, so the
 * toggle's commit only changes opacity.
 *
 * @example
 * ```
 * const isWheelsWarm = useWheelsWarmUp(isSheetOpen && isTouch);
 * ```
 */
export function useWheelsWarmUp(isSheetOpen: boolean): boolean {
  const [isWarm, setIsWarm] = useState(false);
  // Synchronizes with the browser's clock and idle time. The wheels warm after
  // the sheet's present motion settles and the main thread goes idle. Closing
  // the sheet cancels both and cools them.
  useEffect(() => {
    if (!isSheetOpen) {
      return undefined;
    }
    let idle: number | null = null;
    const warm = () => {
      setIsWarm(true);
    };
    const timer = window.setTimeout(() => {
      idle =
        typeof window.requestIdleCallback === 'function'
          ? window.requestIdleCallback(warm, {timeout: IDLE_TIMEOUT_MS})
          : window.setTimeout(warm, 0);
    }, SHEET_SETTLE_MS);
    return () => {
      // Cooled for the next opening, which waits for its own settle.
      setIsWarm(false);
      window.clearTimeout(timer);
      if (idle != null) {
        if (typeof window.cancelIdleCallback === 'function') {
          window.cancelIdleCallback(idle);
        } else {
          window.clearTimeout(idle);
        }
      }
    };
  }, [isSheetOpen]);
  return isSheetOpen && isWarm;
}

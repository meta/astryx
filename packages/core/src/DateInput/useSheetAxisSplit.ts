// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useSheetAxisSplit.ts
 * @input A horizontally paging element's ref
 * @output useSheetAxisSplit: keeps a bottom sheet's touch and pointer
 *   listeners off the drags that belong to the element
 * @position Internal behavior hook, used by MonthPager.tsx
 *
 * A JavaScript pan raises no `pointercancel`, so without this the sheet would
 * take a sideways drag on the calendar. The split is UIDatePicker's in a sheet.
 *
 * SYNC: When modified, update DateInputTouch.test.tsx.
 */

import {useEffect} from 'react';

import {UIKIT_GESTURES} from '../motion/uikit/gestures';

/**
 * The travel, on either axis, at which a drag on the grid is decided. UIKit
 * begins both the sheet's pan and the grid's at the pan's hysteresis.
 *
 * @source measured: UIKit lab, iOS 26.2 simulator, `.date` `.inline` in a
 *   medium-detent sheet, 100 pt drags from the grid at 45°, 47.5°, 50°,
 *   52.5° and 55°, slow and fast, three each, logged per touch sample
 *   (motion/MEASUREMENTS.md M-DP01), Oct 25 2026: every drag was decided on
 *   the first sample where |dx| or |dy| reached 10 pt; the grid took it when
 *   |dx| had (first samples (10.0, 11.0), (10.7, 12.7)) and the sheet when
 *   only |dy| had ((9.7, 11.3), (8.0, 10.3))
 */
const DECISION_TRAVEL = UIKIT_GESTURES.pan.hysteresis.value;

/**
 * Keeps the sheet off the drags on `ref`'s element that UIKit gives the grid,
 * and off every move before the decision.
 *
 * A drag is decided on the first move where either axis travels
 * `DECISION_TRAVEL`. It is the element's if the sideways travel has reached
 * it, else the sheet's. The moves before the decision reach neither, so the
 * sheet's own 8 px promotion cannot start first.
 *
 * @example
 * ```
 * useSheetAxisSplit(viewportRef);
 * ```
 */
export function useSheetAxisSplit(
  ref: React.RefObject<HTMLElement | null>,
  {isEnabled = true}: {isEnabled?: boolean} = {},
): void {
  // Synchronizes with the element's touch and pointer events.
  useEffect(() => {
    const element = ref.current;
    if (element == null || !isEnabled) {
      return undefined;
    }
    // null while the direction is still undecided.
    let claimed: boolean | null = null;
    let originX = 0;
    let originY = 0;

    const begin = (x: number, y: number) => {
      originX = x;
      originY = y;
      claimed = null;
    };

    /**
     * Whether a move at (x, y) is kept from the sheet: until the decision,
     * and after it when the drag is the element's. Decides once.
     */
    const isKept = (x: number, y: number): boolean => {
      if (claimed == null) {
        const dx = Math.abs(x - originX);
        const dy = Math.abs(y - originY);
        if (Math.max(dx, dy) < DECISION_TRAVEL) {
          return true;
        }
        claimed = dx >= DECISION_TRAVEL;
      }
      return claimed;
    };

    const onTouchStart = (event: TouchEvent) => {
      const touch = event.touches[0];
      begin(touch?.clientX ?? 0, touch?.clientY ?? 0);
    };
    const onTouchMove = (event: TouchEvent) => {
      const touch = event.touches[0];
      if (touch != null && isKept(touch.clientX, touch.clientY)) {
        event.stopPropagation();
      }
    };
    const onPointerDown = (event: PointerEvent) => {
      if (event.pointerType === 'touch' && event.isPrimary) {
        begin(event.clientX, event.clientY);
      }
    };
    const onPointerMove = (event: PointerEvent) => {
      if (
        event.pointerType === 'touch' &&
        event.isPrimary &&
        isKept(event.clientX, event.clientY)
      ) {
        event.stopPropagation();
      }
    };
    // The end of a gesture carries no interpretation: it propagates, and
    // resets the sheet's bookkeeping.
    const onEnd = () => {
      claimed = null;
    };

    // In the bubble phase, these run before the sheet's listener on its body.
    // They are passive, so nothing here cancels a default action.
    element.addEventListener('pointerdown', onPointerDown, {passive: true});
    element.addEventListener('pointermove', onPointerMove, {passive: true});
    element.addEventListener('touchstart', onTouchStart, {passive: true});
    element.addEventListener('touchmove', onTouchMove, {passive: true});
    element.addEventListener('touchend', onEnd, {passive: true});
    element.addEventListener('touchcancel', onEnd, {passive: true});
    return () => {
      element.removeEventListener('pointerdown', onPointerDown);
      element.removeEventListener('pointermove', onPointerMove);
      element.removeEventListener('touchstart', onTouchStart);
      element.removeEventListener('touchmove', onTouchMove);
      element.removeEventListener('touchend', onEnd);
      element.removeEventListener('touchcancel', onEnd);
    };
  }, [ref, isEnabled]);
}

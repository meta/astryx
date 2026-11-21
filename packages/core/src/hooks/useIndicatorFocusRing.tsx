// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useIndicatorFocusRing.tsx
 * @input A ref to the element wrapping only the indicator
 * @output Focus handlers that draw the standard ring on the indicator itself
 * @position Used by controls whose focusable input is visually hidden
 *
 * SYNC: When modified, update:
 * - /packages/core/src/hooks/index.ts (exports)
 */

// The owner draws the ring on the indicator's own element, at focus time:
// - Only that element can shape the ring, because `outline` follows its
//   `border-radius`.
// - A theme can replace the indicator, and a replacement can drop any prop.
//   If the indicator drew the ring, such a replacement would have no visible
//   focus. No type can make it keep the props.
// - The ring is an inline style, not a class. React replaces `className` on
//   re-render, but it updates `style` per property, so the outline stays.
// - The handler checks `:focus-visible`, not focus. This keeps the browser's
//   heuristic, including `focus({focusVisible: true})`.

import {useCallback, useMemo} from 'react';
import type {FocusEvent, RefObject} from 'react';
import {
  FOCUS_OUTLINE_PARTS,
  FOCUS_OUTLINE_PARTS_NONE,
} from '../utils/focusOutline.stylex';

export interface UseIndicatorFocusRingReturn {
  /** Spread onto the element that owns the focusable input. */
  focusProps: {
    onFocus: (event: FocusEvent<HTMLElement>) => void;
    onBlur: () => void;
  };
}

/**
 * Draw the standard focus ring on the indicator inside `containerRef`, shaped
 * by whatever that indicator actually is.
 *
 * @param containerRef - Wraps ONLY the indicator, so its single element child
 *   is unambiguously the thing to ring, whatever a theme renders there.
 * @param isDisabled - Skip the ring; a disabled control is not focusable.
 *
 * @example
 * ```
 * const indicatorRef = useRef<HTMLSpanElement>(null);
 * const {focusProps} = useIndicatorFocusRing(indicatorRef, isDisabled);
 * <div {...focusProps}>
 *   <input type="checkbox" />
 *   <span ref={indicatorRef}><Indicator state="checked" /></span>
 * </div>
 * ```
 */
export function useIndicatorFocusRing(
  containerRef: RefObject<HTMLElement | null>,
  isDisabled = false,
): UseIndicatorFocusRingReturn {
  const paint = useCallback(
    (on: boolean) => {
      // The container holds only the indicator, so its first child is the
      // target. A later sibling can never become the target.
      const indicator = containerRef.current?.firstElementChild;
      if (indicator instanceof HTMLElement) {
        Object.assign(
          indicator.style,
          on ? FOCUS_OUTLINE_PARTS : FOCUS_OUTLINE_PARTS_NONE,
        );
      }
    },
    [containerRef],
  );

  const onFocus = useCallback(
    (event: FocusEvent<HTMLElement>) => {
      if (isDisabled) {
        return;
      }
      const target = event.target;
      if (target instanceof HTMLElement && !target.matches(':focus-visible')) {
        return;
      }
      paint(true);
    },
    [isDisabled, paint],
  );

  const onBlur = useCallback(() => paint(false), [paint]);

  return useMemo(() => ({focusProps: {onFocus, onBlur}}), [onFocus, onBlur]);
}

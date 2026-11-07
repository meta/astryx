// Copyright (c) Meta Platforms, Inc. and affiliates.
'use client';

/**
 * @file useChevronDip.ts
 * @input The title button, and the Reduced Motion policy
 *   (motion/reducedMotion.ts)
 * @output Exports `useChevronDip`: a callback ref for the title button, and
 *   `dip`, which the toggle's handler calls before it changes the state
 * @position Internal hook of TouchDateField.tsx and TouchDateTimeField.tsx
 *
 * Under reduced motion on a touch screen the chevron does not turn. It dips
 * instead (playReducedMotionDip), and the turn lands at the dip's middle.
 *
 * SYNC: When modified, update MonthYearToggle.interaction.browser.spec.ts.
 */

import {useCallback, useEffect, useRef} from 'react';
import {
  playReducedMotionDip,
  reducedMotionFade,
  type ReducedMotionDip,
} from '../motion/reducedMotion';

/** The title chevron's Reduced Motion dip. */
export interface ChevronDip {
  /** A callback ref for the title button. */
  ref: (element: Element | null) => void;
  /**
   * The toggle's handler calls this before it changes the state. Under
   * reduced motion on a touch screen, the chevron dips, and its turn lands at
   * the dip's middle. Otherwise it does nothing.
   */
  dip: () => void;
}

/**
 * The title chevron's Reduced Motion dip. The ref sits on the button because
 * a registry Icon does not forward one, and the dip finds the icon inside it.
 *
 * @example
 * ```
 * const chevron = useChevronDip();
 * const toggle = () => {
 *   chevron.dip();
 *   setIsWheelOpen(!isWheelOpen);
 * };
 * ```
 */
export function useChevronDip(): ChevronDip {
  const elementRef = useRef<Element | null>(null);
  const dipRef = useRef<ReducedMotionDip | null>(null);
  const dip = useCallback(() => {
    const icon =
      elementRef.current?.querySelector<HTMLElement>('.astryx-icon') ?? null;
    const fade = reducedMotionFade(icon);
    if (
      icon == null ||
      fade == null ||
      fade.duration === 0 ||
      typeof icon.animate !== 'function'
    ) {
      return;
    }
    const style = getComputedStyle(icon);
    // A second change within a dip restarts it from the glyph's presented
    // opacity.
    const from = dipRef.current == null ? 1 : Number(style.opacity);
    // The chevron keeps the turn it shows until the dip's middle: an inline
    // transform holds it over the styles of the new state.
    const shown = style.transform;
    dipRef.current?.cancel();
    icon.style.transform = shown;
    dipRef.current = playReducedMotionDip(
      icon,
      fade,
      () => {
        icon.style.transform = '';
      },
      from,
    );
  }, []);
  // Synchronizes with the dip's animation: it does not outlive the title.
  useEffect(() => () => dipRef.current?.cancel(), []);
  const ref = useCallback((element: Element | null) => {
    elementRef.current = element;
  }, []);
  return {ref, dip};
}

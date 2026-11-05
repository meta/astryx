// Copyright (c) Meta Platforms, Inc. and affiliates.
'use client';

/**
 * @file useChevronDip.ts
 * @input Whether the month/year wheels show, and the Reduced Motion policy
 *   (motion/reducedMotion.ts)
 * @output Exports `useChevronDip`: a callback ref for the title button whose
 *   chevron dips to transparent and back under reduced motion on a touch
 *   screen
 * @position Internal hook of TouchDateField.tsx and TouchDateTimeField.tsx
 *
 * Under reduced motion the chevron must not turn. On a touch screen it dips
 * instead, and its styles apply the turn at the dip's middle.
 *
 * SYNC: When modified, update MonthYearToggle.interaction.browser.spec.ts.
 */

import {useEffect, useRef} from 'react';
import {useIsomorphicLayoutEffect} from '../hooks/useIsomorphicLayoutEffect';
import {reducedMotionFade} from '../motion/reducedMotion';
import {reducedMotionFadeConsts} from '../motion/reducedMotion.stylex';

/**
 * A callback ref for the title button. Under reduced motion on a touch screen,
 * its chevron dips to transparent and back each time `state` changes. The ref
 * sits on the button because a registry Icon does not forward one.
 *
 * @example
 * ```
 * const dipRef = useChevronDip(isWheelOpen);
 * return <button ref={dipRef}><Icon icon="chevronDown" /></button>;
 * ```
 */
export function useChevronDip(
  state: boolean,
): (element: Element | null) => void {
  const elementRef = useRef<Element | null>(null);
  const stateRef = useRef(state);
  const dipRef = useRef<Animation | null>(null);
  // Synchronizes the chevron's Web Animation with `state`: each change dips
  // it once.
  useIsomorphicLayoutEffect(() => {
    if (stateRef.current === state) {
      return;
    }
    stateRef.current = state;
    const element = elementRef.current?.querySelector('.astryx-icon') ?? null;
    const fade = reducedMotionFade(element);
    if (
      element == null ||
      fade == null ||
      fade.duration === 0 ||
      typeof element.animate !== 'function'
    ) {
      return;
    }
    // A second change within the dip restarts it from the glyph's presented
    // opacity, read before the running dip is cancelled. Only this case reads
    // style. The fixed curve keeps the dip's middle on the turn's fixed
    // delay (half the policy's duration) even when a theme retunes
    // `timing.curves.move`.
    const running = dipRef.current;
    const from =
      running != null && running.playState === 'running'
        ? Number(getComputedStyle(element).opacity)
        : 1;
    running?.cancel();
    dipRef.current = element.animate(
      [{opacity: from}, {opacity: 0}, {opacity: 1}],
      {duration: fade.duration, easing: reducedMotionFadeConsts.easing},
    );
  }, [state]);
  // Synchronizes with the dip's animation: it does not outlive the title.
  useEffect(
    () => () => {
      dipRef.current?.cancel();
    },
    [],
  );
  return element => {
    elementRef.current = element;
  };
}

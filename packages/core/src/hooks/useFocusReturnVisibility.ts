// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useFocusReturnVisibility.ts
 * @input Uses the shared interaction-modality tracker
 * @output Preserves returned focus while suppressing pointer-only focus rings
 * @position Internal focus-return policy for adaptive overlays
 */

import {useCallback, useState, type RefObject} from 'react';
import {useInteractionModalityTracking} from '../utils/interactionModality';

/**
 * Pass the overlay's element ref so the ring follows the last input in that
 * element's own document (a same-origin iframe, a Document Picture-in-Picture
 * window), not the page's.
 */
export function useFocusReturnVisibility(
  elementRef?: RefObject<Element | null>,
) {
  const [isFocusRingSuppressed, setIsFocusRingSuppressed] = useState(false);

  const readModality = useInteractionModalityTracking(elementRef);

  const prepareFocusReturn = useCallback(() => {
    setIsFocusRingSuppressed(readModality() === 'pointer');
  }, [readModality]);

  const resetFocusReturn = useCallback(() => {
    setIsFocusRingSuppressed(false);
  }, []);

  const onFocusReturnTargetFocus = useCallback(() => {
    if (readModality() === 'keyboard') {
      setIsFocusRingSuppressed(false);
    }
  }, [readModality]);

  return {
    isFocusRingSuppressed,
    onFocusReturnTargetFocus,
    prepareFocusReturn,
    resetFocusReturn,
  };
}

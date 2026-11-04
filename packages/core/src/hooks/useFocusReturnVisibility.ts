// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useFocusReturnVisibility.ts
 * @input The component's shared interaction-modality tracking
 * @output Preserves returned focus while suppressing pointer-only focus rings
 * @position Internal focus-return policy for adaptive overlays
 */

import {useCallback, useState} from 'react';
import type {InteractionModalityTracking} from '../utils/interactionModality';

/**
 * Pass the component's one modality tracking (its `ref` attached to the
 * overlay's element or trigger) so the ring follows the last input in that
 * element's own document (a same-origin iframe, a Document Picture-in-Picture
 * window), not the page's.
 */
export function useFocusReturnVisibility({
  readModality,
}: Pick<InteractionModalityTracking, 'readModality'>) {
  const [isFocusRingSuppressed, setIsFocusRingSuppressed] = useState(false);

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

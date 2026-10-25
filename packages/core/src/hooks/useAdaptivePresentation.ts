// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useAdaptivePresentation.ts
 * @input Uses the shared SSR-safe media-query hook and the touch
 *   presentation's compact-touch query
 * @output Resolves popover/bottom-sheet presentation policy
 * @position Internal overlay policy shared across component families
 */

import {
  COMPACT_TOUCH_QUERY,
  useCompactDefinition,
} from '../utils/touchPresentation';
import {useMediaQuery} from './useMediaQuery';

export type AdaptivePresentation = 'popover' | 'bottom-sheet' | 'adaptive';
export type ResolvedAdaptivePresentation = Exclude<
  AdaptivePresentation,
  'adaptive'
>;

// A sheet needs both a compact viewport and a coarse primary pointer: tablets
// and large touch displays stay anchored, phones in either orientation get
// the sheet. Compact is the active theme's definition (spec:AST-012 FR9);
// this constant is its value at the default width points.
export const COMPACT_TOUCH_PRESENTATION_QUERY = COMPACT_TOUCH_QUERY;

export function useAdaptivePresentation(
  presentation: AdaptivePresentation,
): ResolvedAdaptivePresentation {
  const isCompactTouch = useMediaQuery(
    useCompactDefinition().coarsePointerQuery,
  );
  return presentation === 'adaptive'
    ? isCompactTouch
      ? 'bottom-sheet'
      : 'popover'
    : presentation;
}

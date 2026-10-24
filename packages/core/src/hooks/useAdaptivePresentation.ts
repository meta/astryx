// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useAdaptivePresentation.ts
 * @input Uses the shared SSR-safe media-query hook and the touch
 *   presentation's compact-touch query
 * @output Resolves popover/bottom-sheet presentation policy
 * @position Internal overlay policy shared across component families
 */

import {COMPACT_TOUCH_QUERY} from '../utils/touchPresentation';
import {useMediaQuery} from './useMediaQuery';

export type AdaptivePresentation = 'popover' | 'bottom-sheet' | 'adaptive';
export type ResolvedAdaptivePresentation = Exclude<
  AdaptivePresentation,
  'adaptive'
>;

// A sheet needs both a compact viewport and a coarse primary pointer: tablets
// and large touch displays stay anchored, phones in either orientation get
// the sheet. The query is the shared touch presentation's
// (utils/touchPresentation.ts).
export const COMPACT_TOUCH_PRESENTATION_QUERY = COMPACT_TOUCH_QUERY;

export function useAdaptivePresentation(
  presentation: AdaptivePresentation,
): ResolvedAdaptivePresentation {
  const isCompactTouch = useMediaQuery(COMPACT_TOUCH_PRESENTATION_QUERY);
  return presentation === 'adaptive'
    ? isCompactTouch
      ? 'bottom-sheet'
      : 'popover'
    : presentation;
}

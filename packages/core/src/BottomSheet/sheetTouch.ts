// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file sheetTouch.ts
 * @input utils/touchPresentation's readTouchPresentation and the theme's
 *   default compact definition
 * @output readTouchPresentation(): the touch presentation now, for a decision
 *   a BottomSheet takes at one moment (a release, a present, the dim)
 * @position Internal to BottomSheet
 *
 * The sheet's touch decisions key on the primary pointer alone (a finger:
 * `isTouch`); the compact half of the answer is read against the default
 * definition, which none of them consults.
 */

import {DEFAULT_COMPACT_DEFINITION} from '../theme/themeAdaptations';
import {
  readTouchPresentation as readPresentation,
  type TouchPresentation,
} from '../utils/touchPresentation';

export function readTouchPresentation(): TouchPresentation {
  return readPresentation(
    typeof window === 'undefined' ? null : window,
    DEFAULT_COMPACT_DEFINITION,
  );
}

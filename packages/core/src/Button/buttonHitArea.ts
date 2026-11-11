// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file buttonHitArea.ts
 * @input Uses createSharedContext and the touch hit-area options type
 * @output Exports ButtonHitAreaContext, the touch hit-area options a Button
 *   passes to useTouchHitArea, and BUTTON_HIT_AREA, their default
 * @position Internal to Core. A Core part that renders a Button and needs a
 *   different band, such as InputClearButton, provides its own options.
 */

import {createSharedContext} from '../utils/sharedContext';
import type {TouchHitAreaOptions} from '../utils/touchHitArea';

// The band is on the content wrapper, so a band tap lands on a descendant.
// Button's content never paints past its box, so such a tap nearer a
// neighbour is the neighbour's, not this button's.
export const BUTTON_HIT_AREA: TouchHitAreaOptions = {
  ownsDescendantTouches: false,
};

export const ButtonHitAreaContext = createSharedContext<TouchHitAreaOptions>(
  'ButtonHitAreaContext',
  1,
  BUTTON_HIT_AREA,
);
ButtonHitAreaContext.displayName = 'ButtonHitAreaContext';

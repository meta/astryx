// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file touchEndMark.ts
 * @input The click guard's arm for a touch whose touchend it cancels
 * @output Whether the release in flight is a touch whose touchend the click
 *   guard cancels, for the gesture counter
 * @position Internal leaf module. The click guard writes the mark and the
 *   gesture counter reads it, so neither module imports the other and
 *   neither entry pulls in the other's code
 */

import {sharedState} from './sharedRealm';

// Shared through the realm, so a second copy of Core reads the same mark.
const mark = sharedState('utils/touch-end-mark/state', 1, () => ({
  isSet: false,
}));

/** Marks that the click guard cancels the touchend of the release in flight. */
export function markTouchEndCancelled(): void {
  mark.isSet = true;
}

/** Whether the click guard cancels the touchend of the release in flight. */
export function isTouchEndCancelled(): boolean {
  return mark.isSet;
}

/** Clears the mark when a new press begins. */
export function clearTouchEndMark(): void {
  mark.isSet = false;
}

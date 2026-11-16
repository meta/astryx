// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file switchTouchPart.tsx
 * @input The shared touch modules (the animator, the gesture host) through
 *   useSwitchTouch
 * @output `SwitchTouch`, Switch's touch part
 * @position Loaded only through the touch loader (createTouchPart in
 *   Switch.tsx), after first paint. No other module imports it
 */

import {
  useSwitchTouch,
  type SwitchTouchOptions,
  type SwitchTouchParts,
} from './useSwitchTouch';

interface SwitchTouchProps {
  readonly parts: SwitchTouchParts;
  readonly options: SwitchTouchOptions;
}

/**
 * Switch's touch presentation: the thumb drag and its springs. It renders
 * nothing. It mounts once the part has loaded.
 */
export function SwitchTouch({parts, options}: SwitchTouchProps): null {
  useSwitchTouch(parts, options);
  return null;
}

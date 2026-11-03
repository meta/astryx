// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file menuScrollView.ts
 * @input The shared native-scroll probe
 * @output Exports isInScrollView, whether a menu trigger is in a scroll view
 * @position Internal to the menu press model; only its touch model reads it.
 *   DropdownMenu passes it to the trigger half, so a press under the pointer
 *   model does not bundle the probe.
 */

import {createNativeScrollProbe} from '../gestures/nativeScroll';

/**
 * Whether a control is inside a scroll view, by the shared native-scroll
 * probe: a scroller with room that is not beyond a fixed ancestor. A control
 * in a fixed bar (a top bar, a tab bar, a toolbar) is not.
 */
export function isInScrollView(control: Element): boolean {
  return createNativeScrollProbe(control).isInsideScroller;
}

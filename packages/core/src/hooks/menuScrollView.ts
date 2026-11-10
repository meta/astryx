// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file menuScrollView.ts
 * @input Core's scroll-view question (utils/scrollView.ts)
 * @output Exports isInScrollView, whether a menu trigger is in a scroll view
 * @position Internal to the menu press model; only its touch model reads it.
 *   DropdownMenu and the public useMenuPress pass it to the trigger half. A
 *   menu that never presses a trigger does not bundle it.
 */

import {isInsideScrollView} from '../utils/scrollView';

/**
 * Whether a control is inside a scroll view: a scroller with room that is not
 * beyond a fixed ancestor. A control in a fixed bar (a top bar, a tab bar, a
 * toolbar) is not. It is the native-scroll probe's answer, without the
 * gesture core in the bundle.
 */
export function isInScrollView(control: Element): boolean {
  return isInsideScrollView(control);
}

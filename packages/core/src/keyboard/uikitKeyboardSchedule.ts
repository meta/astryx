// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file uikitKeyboardSchedule.ts
 * @input The UIKit table's keyboard frame spring (`KEYBOARD_SPRING`) and the
 *   spring solver. From the keyboard riders: the duration UIKit's keyboard
 *   notifications report, and their focus checks. From the layout guide: its
 *   field check
 * @output createUIKitKeyboardSchedule: when and how the keyboard moves in
 *   Safari on iOS, with the spring's progress and the guide's focus rules there
 * @position Part of the touch runtime (utils/touchRuntimeModules.tsx), which
 *   publishes it. The keyboard riders register it with the layout guide. No
 *   module on a page's first load imports it. It imports the spring's table
 *   and the solver the runtime's animator already uses
 *
 * SYNC: When modified, update /packages/core/src/keyboard/README.md
 */

import {solveSpring} from '../motion/spring';
import {KEYBOARD_SPRING} from '../motion/uikit/springs';
import type {
  KeyboardFocusChecks,
  KeyboardFocusRules,
  UIKitKeyboardSchedule,
} from './keyboardLayoutGuide';
import type {KeyboardProgressCurve} from './keyboardModel';

/**
 * What a keyboard rider gives the schedule from modules the page's first load
 * already holds, so the runtime's chunk shares none of them.
 */
export interface UIKitKeyboardScheduleInputs {
  /** How long UIKit's keyboard notifications say the keyboard moves, ms. */
  readonly notificationMs: number;
  /** Whether the focused element, read inside open shadow roots, may keep a keyboard up. */
  readonly mayKeepKeyboard: (doc: Document) => boolean;
  /** Whether `value` is an element, from this window or another one. */
  readonly isElement: (value: unknown) => value is Element;
}

// The keyboard's progress, 0 to 1, on its spring released at rest.
const spring = solveSpring(KEYBOARD_SPRING, {from: 0, to: 1});

// Only WebKit on iOS and iPadOS supports `-webkit-touch-callout`, and its
// keyboard is UIKit's. The check reads a capability, never the user agent.
function hasUIKitKeyboard(win: Window): boolean {
  const css = (win as Window & {readonly CSS?: Partial<typeof CSS>}).CSS;
  return (
    typeof css?.supports === 'function' &&
    css.supports('-webkit-touch-callout', 'none')
  );
}

// Safari keeps the keyboard up for a field inside a frame, a custom element or
// an open shadow root. When focus moves to one of these, the guide waits for
// focus to settle there. It decides about the hide at the focus event, or on
// the next task. Safari's focusout names no related target when focus moves
// into a frame, so a blur to nothing waits too.
function uikitFocusRules(
  win: Window,
  hide: (blurAt: number) => void,
  {hidesField}: KeyboardFocusChecks,
  {mayKeepKeyboard: keepsKeyboard, isElement}: UIKitKeyboardScheduleInputs,
): KeyboardFocusRules {
  let pendingAt: number | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  // Focus that moves into a frame blurs this window, and its document keeps
  // focus. A surface can park focus on its own element first, so the active
  // element does not show the frame.
  let windowBlurred = false;
  // Blur does not bubble, so this listener hears only the window's own blur.
  const onWindowBlur = () => {
    windowBlurred = true;
  };
  const stopWaiting = () => {
    if (timer != null) {
      clearTimeout(timer);
      timer = null;
    }
    win.removeEventListener('blur', onWindowBlur);
  };
  const mayKeepKeyboard = () => keepsKeyboard(win.document);
  const settle = () => {
    stopWaiting();
    const blurAt = pendingAt;
    const intoFrame = windowBlurred && win.document.hasFocus();
    pendingAt = null;
    windowBlurred = false;
    if (blurAt != null && !intoFrame && !mayKeepKeyboard()) {
      hide(blurAt);
    }
  };
  return {
    focused: () => {
      settle();
      return mayKeepKeyboard();
    },
    blurred: (next, blurAt) => {
      if (next != null && (!isElement(next) || !hidesField(next))) {
        return false;
      }
      stopWaiting();
      pendingAt = blurAt;
      windowBlurred = false;
      win.addEventListener('blur', onWindowBlur);
      timer = setTimeout(settle, 0);
      return true;
    },
    dispose: () => {
      stopWaiting();
      pendingAt = null;
      windowBlurred = false;
    },
  };
}

/**
 * Safari on iOS reports the keyboard's show once, as UIKit's keyboard starts
 * up, and its hide only once the keyboard is down. So content rides UIKit's
 * keyboard spring from the show's report. On hide it rides from the blur that
 * takes the keyboard down, as a prediction that Safari's later report
 * confirms. A hide nothing predicted rides from the report. Safari reports the
 * keyboard with its accessory bar in one height.
 */
export function createUIKitKeyboardSchedule(
  inputs: UIKitKeyboardScheduleInputs,
): UIKitKeyboardSchedule {
  const {notificationMs} = inputs;
  const span = notificationMs / 1000;
  // UIKit's keyboard moves on one spring, up and down. Core Animation cuts it
  // at the duration the keyboard notifications report, so it lands there.
  const curve: KeyboardProgressCurve = {
    durationMs: notificationMs,
    progress: t => (t <= 0 ? 0 : t >= span ? 1 : spring.value(t)),
  };
  return {
    curve,
    showReportLagMs: 0,
    hideReportLagMs: 0,
    hideAfterBlurMs: 0,
    appliesTo: hasUIKitKeyboard,
    focusRules: (win, hide, checks) =>
      uikitFocusRules(win, hide, checks, inputs),
  };
}

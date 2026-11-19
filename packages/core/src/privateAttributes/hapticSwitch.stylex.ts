// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file privateAttributes/hapticSwitch.stylex.ts
 * @input The hidden switch a label's tap haptic plays through
 * @output markHapticSwitch, which marks that switch, and isHapticSwitch,
 *   which reads the mark
 * @position Owner module of the private haptic-switch attribute
 *   (`architecture:public-component-api` INV23): the only file that writes
 *   its name. gestures/haptics.ts marks its hidden switch; the click guard
 *   skips that switch without importing the haptics module, so a gesture
 *   that only guards clicks carries no haptics code
 *   (`architecture:react-component-runtime` INV13). No package entry
 *   exports it.
 */

const HAPTIC_SWITCH = 'data-astryx-haptic-switch';

/** Marks the hidden switch a label's tap haptic plays through. */
export function markHapticSwitch(element: Element): void {
  element.setAttribute(HAPTIC_SWITCH, '');
}

/** Whether `target` is that hidden switch. */
export function isHapticSwitch(target: EventTarget | null): boolean {
  return target instanceof Element && target.hasAttribute(HAPTIC_SWITCH);
}

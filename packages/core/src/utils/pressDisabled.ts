// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file pressDisabled.ts
 * @input An element
 * @output `isDisabledControl`: whether an element is a disabled control, so a
 *   press on it performs no action
 * @position The one disabled-control check that press feedback
 *   (../gestures/haptics) and the hover layers' touch trigger
 *   (../Layer/useTouchTrigger) share, so the two never disagree about a
 *   control. It lives outside the gesture code, which a public import that
 *   uses no gesture never carries (architecture:react-component-runtime
 *   INV13).
 */

/**
 * Whether `element` is a disabled control: `aria-disabled="true"`, or a form
 * control the browser counts as `:disabled` (a disabled fieldset's controls
 * included). A disabled control performs no action, so it gives no press
 * feedback (spec:AST-094 FR23), and a tap on it opens its reason instead
 * (component:Tooltip FR5).
 */
export function isDisabledControl(element: Element): boolean {
  if (element.getAttribute('aria-disabled') === 'true') {
    return true;
  }
  try {
    return element.matches(':disabled');
  } catch {
    return false;
  }
}

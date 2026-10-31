// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file focusReturn.ts
 * @input The shared interaction modality.
 * @output A focus move whose ring follows the last input.
 * @position Utility; used by overlays (BottomSheet, Dialog, DropdownMenu) that
 *   move focus programmatically. isFocusDetached lives in isFocusDetached.ts.
 */

import {
  getInteractionModality,
  type InteractionModality,
} from './interactionModality';

/**
 * Move focus programmatically so its ring follows the last input
 * (`architecture:interaction-modality` INV1). After pointer input the browser's
 * focus option keeps the element from matching `:focus-visible`, which is the
 * one way to reach an element the overlay does not render: the consumer's
 * autofocus target, the control that opened a Dialog, or a menu trigger the
 * caller renders. Pass `options` (for example `preventScroll`) as to `focus()`.
 *
 * `modality` defaults to the page's last input. A caller moving focus inside a
 * second document (a same-origin iframe, a Document Picture-in-Picture window)
 * passes that document's, which it tracks with `trackInteractionModalityIn`.
 *
 * Make sure modality tracking is active (`useInteractionModalityTracking()`)
 * in the component that calls this.
 */
export function focusForLastInput(
  element: HTMLElement,
  options?: FocusOptions,
  modality: InteractionModality = getInteractionModality(),
): void {
  // A text-entry field paints its own focus treatment to show where typing
  // goes, and an extra blur there can run validation or mark it touched. The
  // field's own window: one in an iframe or a Picture-in-Picture window is
  // never an instance of the page's constructors.
  const view = element.ownerDocument.defaultView ?? window;
  const isTextEntry =
    element instanceof view.HTMLInputElement ||
    element instanceof view.HTMLTextAreaElement ||
    element instanceof view.HTMLSelectElement ||
    element.isContentEditable;
  if (isTextEntry || modality !== 'pointer') {
    if (options === undefined) {
      element.focus();
    } else {
      element.focus(options);
    }
    return;
  }
  // Focusing the element that already has focus does nothing, so a ring the
  // browser already drew would stay. WebKit draws one when its own focus
  // restoration (a dialog's close, a popover's hide) moves focus itself, so
  // clear that focus first.
  if (element.matches(':focus-visible')) {
    element.blur();
  }
  element.focus({...options, focusVisible: false});
}

// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file nodeType.ts
 * @input A value that may be a DOM node from any window
 * @output isNode, isElement, isHTMLElement, isDocument and isShadowRoot:
 *   type guards that hold for a node from any window; and the `<dialog>`
 *   display checks that the layer runtime and the focus trap share
 * @position Shared DOM checks for code that handles nodes and events from
 *   another window's document, such as a same-origin iframe's or a popup's
 *
 * Each check reads the node type or namespace, not `instanceof`. A node from
 * another window belongs to that window's realm, where `instanceof` against
 * this window's classes is false. An element moved into another window's
 * document keeps the realm it was made in.
 */

/** Whether `value` is a DOM node, from this window or another one. */
export function isNode(value: unknown): value is Node {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as {nodeType?: unknown}).nodeType === 'number'
  );
}

/** Whether `value` is an element, from this window or another one. */
export function isElement(value: unknown): value is Element {
  return isNode(value) && value.nodeType === 1;
}

/** Whether `value` is a document, from this window or another one. */
export function isDocument(value: unknown): value is Document {
  return isNode(value) && value.nodeType === 9;
}

/** Whether `value` is a shadow root, from this window or another one. */
export function isShadowRoot(value: unknown): value is ShadowRoot {
  return isNode(value) && value.nodeType === 11 && 'host' in value;
}

/**
 * Whether `value` is an HTML element, from this window or another one. The
 * namespace decides, so an element moved between windows' documents passes.
 */
export function isHTMLElement(value: unknown): value is HTMLElement {
  return (
    isElement(value) && value.namespaceURI === 'http://www.w3.org/1999/xhtml'
  );
}

/** Whether `element` is shown as a popover (`:popover-open`). */
export function isShownAsPopover(element: Element): boolean {
  try {
    return element.matches(':popover-open');
  } catch {
    // An engine without the pseudo-class has no popovers to be shown as.
    return false;
  }
}

/**
 * Whether `dialog` is in the top layer: open, or shown as a popover. A
 * non-modal Drawer is shown with `showPopover()` and never sets `open`.
 */
export function isDialogShown(dialog: HTMLDialogElement): boolean {
  return dialog.open || isShownAsPopover(dialog);
}

/**
 * Whether `dialog` stays closed while the page displays it in flow. Such a
 * dialog has a box, and its content renders and takes focus. A closed dialog
 * with `display: none` has no box and displays nothing.
 */
export function isDisplayedWhileClosed(dialog: HTMLDialogElement): boolean {
  return !isDialogShown(dialog) && dialog.getClientRects().length > 0;
}

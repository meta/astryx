// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file cutText.tsx
 * @input The anchor keyboard focus reached, the element whose text a box may
 *   cut short, and the focused element
 * @output Exports `cutTextFor`, which measures that text, and
 *   `UndescribedTooltip`, which shows it in full
 * @position Loaded by Text/cutTextOnKeyboardFocus.tsx after the page's first
 *   paint, so neither the measurement nor the tooltip is in a page's first
 *   load
 */

import {UndescribedTooltip} from '../Tooltip/Tooltip';

/** Whether a box clips its content. */
function overflows(element: Element): boolean {
  const box =
    element.clientWidth ||
    (element instanceof HTMLElement ? element.offsetWidth : 0);
  return box > 0 && element.scrollWidth > box;
}

/** Whether an element is visually hidden: a screen-reader-only label. */
function isVisuallyHidden(element: Element): boolean {
  const style = element.ownerDocument.defaultView?.getComputedStyle(element);
  return (
    style != null &&
    style.position === 'absolute' &&
    ((style.clip !== '' && style.clip !== 'auto') ||
      (style.clipPath !== '' && style.clipPath !== 'none'))
  );
}

// A field and its value: an input, or a widget that shows a chosen value (a
// Selector's combobox). Its value is not the component's text.
const FIELD_SELECTOR =
  'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="combobox"], [role="listbox"], [role="searchbox"], [role="spinbutton"], [role="slider"], [role="textbox"]';

/**
 * Whether an element is left out of the measured text: hidden, a hidden copy
 * (ToggleButton's bold-width reservation), visually hidden, or a field, whose
 * value clips inside its own box and is not the cut text.
 */
function isLeftOut(element: Element): boolean {
  return (
    element.closest(`[hidden], [aria-hidden="true"], ${FIELD_SELECTOR}`) !=
      null || isVisuallyHidden(element)
  );
}

/** Whether text is cut: its box, or a box inside it that a reader sees, clips it. */
function isTextCut(element: HTMLElement): boolean {
  return (
    overflows(element) ||
    [...element.querySelectorAll('*')].some(
      child => !isLeftOut(child) && overflows(child),
    )
  );
}

/**
 * The text a sighted reader sees, without hidden, visually hidden and field
 * text: the label or heading itself.
 */
function visibleText(root: HTMLElement): string {
  let text = '';
  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      text += node.textContent ?? '';
    } else if (node instanceof Element && !isLeftOut(node)) {
      node.childNodes.forEach(walk);
    }
  };
  walk(root);
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * Whether a caller's tooltip already describes the anchor (a Button's
 * `tooltip` prop or a wrapping Tooltip). Its tooltip replaces this one, so one
 * tooltip shows at one spot.
 */
function hasCallerTooltip(anchor: HTMLElement): boolean {
  const ids = anchor.getAttribute('aria-describedby')?.split(/\s+/) ?? [];
  return ids.some(
    id =>
      id !== '' &&
      anchor.ownerDocument.getElementById(id)?.getAttribute('role') ===
        'tooltip',
  );
}

/**
 * The text keyboard focus on `target` should show for `anchor`: `measured`'s
 * text when a box cuts it short, focus is inside the anchor, and no caller
 * tooltip describes the anchor; otherwise `null`.
 */
export function cutTextFor(
  anchor: HTMLElement,
  measured: HTMLElement,
  target: Element,
): string | null {
  // React delivers focus from a portal (a header's filter popover) to the
  // anchor's handlers; only focus inside the anchor counts.
  if (!anchor.contains(target) || hasCallerTooltip(anchor)) {
    return null;
  }
  const text = visibleText(measured);
  return text !== '' && isTextCut(measured) ? text : null;
}

export {UndescribedTooltip};

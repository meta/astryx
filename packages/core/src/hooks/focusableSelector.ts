// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file focusableSelector.ts
 * @input None (a plain CSS selector string constant)
 * @output Exports FOCUSABLE_SELECTOR, isDisabledWithin, preferTabStops,
 *   isVisiblyFocusable and getFocusableElements
 * @position Internal utility; the canonical CSS selector for focusable
 *   elements, shared by focus-management hooks (e.g. useFocusTrap) so the
 *   selector isn't duplicated across components/hooks. The focus trap and
 *   focus return judge reachability with the same check. Not exported from the
 *   public barrel — internal implementation detail.
 */

import {isDialogShown, isDisplayedWhileClosed} from '../utils/nodeType';

/**
 * Canonical CSS selector for commonly focusable elements. Includes the
 * tabbable natives (button/link/input/select/textarea/[tabindex]) plus
 * editable and media elements the browser also puts in the tab order —
 * contenteditable, media with controls, iframe, and an open <details>'s
 * <summary> — which a naive selector misses, letting Tab escape a trap whose
 * only interactive content is (e.g.) a contenteditable composer (infra-8).
 *
 * This is the canonical focusable selector; prefer importing it here over
 * re-declaring the string so behavior stays consistent across hooks.
 */
export const FOCUSABLE_SELECTOR =
  'button:not([disabled]), a[href], area[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]):not([disabled]), [contenteditable]:not([contenteditable="false"]), audio[controls], video[controls], iframe, details > summary:first-child';

/**
 * Whether `element` is disabled inside `container`: it, or an ancestor up to
 * `container`, has `aria-disabled="true"`. Popover skips such an element when
 * it picks initial focus. Tab still reaches it.
 */
export function isDisabledWithin(
  element: Element,
  container: Element,
): boolean {
  const disabled = element.closest('[aria-disabled="true"]');
  return disabled != null && container.contains(disabled);
}

/**
 * `elements` with tab stops first, each group in document order. Inside a
 * composite widget with a roving tab stop (a grid, a toolbar), the member
 * that holds `tabindex="0"` comes before the members that hold `-1`.
 */
export function preferTabStops<T extends Element>(
  elements: ReadonlyArray<T>,
): T[] {
  // A browser's querySelectorAll returns document order. jsdom can group a
  // selector list's matches by selector. Sort them here.
  const inDocumentOrder = [...elements].sort((a, b) =>
    a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1,
  );
  const isTabStop = (element: T) => element.getAttribute('tabindex') !== '-1';
  return [
    ...inDocumentOrder.filter(isTabStop),
    ...inDocumentOrder.filter(element => !isTabStop(element)),
  ];
}

/**
 * Whether an element is currently perceivable/focusable — excludes ones hidden
 * via `display:none`/`visibility:hidden` or inside an `inert`/`hidden` subtree,
 * which the browser skips for Tab, and ones inside an `aria-hidden="true"`
 * subtree, which sighted-keyboard users could Tab to while AT skips them
 * (WCAG 4.1.2 — focusable content must be exposed to assistive tech).
 */
export function isVisiblyFocusable(el: HTMLElement): boolean {
  if (el.hasAttribute('inert') || el.closest('[inert]')) {
    return false;
  }
  if (el.hidden || el.closest('[hidden]')) {
    return false;
  }
  // A closed <dialog> that the page does not display renders nothing, so
  // nothing inside it can take focus.
  for (
    let dialog = el.closest('dialog');
    dialog != null;
    dialog = dialog.parentElement?.closest('dialog') ?? null
  ) {
    if (!isDialogShown(dialog) && !isDisplayedWhileClosed(dialog)) {
      return false;
    }
  }
  // closest() matches the element itself as well as any ancestor.
  if (el.closest('[aria-hidden="true"]')) {
    return false;
  }
  // offsetParent is null for display:none (and fixed elements); pair with a
  // visibility check via getComputedStyle when available.
  if (typeof window !== 'undefined' && window.getComputedStyle) {
    const style = window.getComputedStyle(el);
    if (style.visibility === 'hidden' || style.display === 'none') {
      return false;
    }
  }
  return true;
}

/**
 * Get all focusable elements within a container.
 *
 * Exported for menus that place their own Tab stops inside a trapped layer
 * (DropdownMenu's header and footer), so they judge reachability exactly as
 * the trap does. Not re-exported from the package's `hooks` entry.
 */
export function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
  ).filter(isVisiblyFocusable);
}

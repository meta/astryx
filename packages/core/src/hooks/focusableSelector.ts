// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file focusableSelector.ts
 * @input None (a plain CSS selector string constant)
 * @output Exports FOCUSABLE_SELECTOR, isDisabledWithin, isTabStop and
 *   preferTabStops
 * @position Internal utility; the canonical CSS selector for focusable
 *   elements, shared by focus-management hooks (e.g. useFocusTrap) so the
 *   selector isn't duplicated across components/hooks. Not exported from the
 *   public barrel — internal implementation detail.
 */

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
 * Whether the browser's Tab order includes `element`. A negative `tabindex`
 * takes any element out of it, a button or a link included: a roving group's
 * other members hold `tabindex="-1"`. FOCUSABLE_SELECTOR keeps such a button
 * or link, so callers that walk Tab stops filter with this.
 */
export function isTabStop(element: Element): boolean {
  const value = element.getAttribute('tabindex');
  return value == null || !(Number.parseInt(value, 10) < 0);
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
  return [
    ...inDocumentOrder.filter(isTabStop),
    ...inDocumentOrder.filter(element => !isTabStop(element)),
  ];
}

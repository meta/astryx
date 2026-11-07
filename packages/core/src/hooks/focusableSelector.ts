// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file focusableSelector.ts
 * @input None (a plain CSS selector string constant)
 * @output Exports FOCUSABLE_SELECTOR, isDisabledWithin and preferTabStops
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
 * `elements` with tab stops first, each group in document order. Inside a
 * composite widget with a roving tab stop (a grid, a toolbar), the member
 * that holds `tabindex="0"` comes before the members that hold `-1`.
 */
export function preferTabStops<T extends Element>(
  elements: ReadonlyArray<T>,
): T[] {
  const isTabStop = (element: T) => element.getAttribute('tabindex') !== '-1';
  return [
    ...elements.filter(isTabStop),
    ...elements.filter(element => !isTabStop(element)),
  ];
}

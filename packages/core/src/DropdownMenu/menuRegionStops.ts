// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file menuRegionStops.ts
 * @input The focus trap's own reachability test (getFocusableElements)
 * @output `tabbablesIn`, `focusRegionControl`, `moveRegionsTab`: the Tab stops
 *   of a header or footer region and the walk through a menu with regions,
 *   with a named radio group as one stop
 * @position Internal; used by DropdownMenu (the root menu's header and footer)
 *   and DropdownMenuSubMenu (a sub-menu's header and footer).
 *
 * A menu with a header or footer is a dialog: Tab and Shift+Tab walk the
 * header's controls, the menu as one stop, then the footer's controls, and
 * wrap at either end.
 */
import type React from 'react';
import {getFocusableElements} from '../hooks/useFocusTrap';

/**
 * The elements Tab reaches inside a header or footer region, in order. Hidden
 * controls (`hidden`, `display: none`, `visibility: hidden`, inert or
 * aria-hidden subtrees) are not reachable, judged by the popover focus trap's
 * own test so the two never disagree about where Tab can go.
 */
export function tabbablesIn(region: HTMLElement | null): HTMLElement[] {
  if (region == null) {
    return [];
  }
  return getFocusableElements(region).filter(
    element => element.tabIndex >= 0 && !isInsideHiddenWrapper(element, region),
  );
}

/**
 * Whether a `display: none` ancestor between the element and its region hides
 * it — a control in a wrapper hidden at some widths, say. The trap's test reads
 * only the element's own display.
 */
function isInsideHiddenWrapper(
  element: HTMLElement,
  region: HTMLElement,
): boolean {
  if (typeof window === 'undefined' || !window.getComputedStyle) {
    return false;
  }
  for (
    let node = element.parentElement;
    node != null && node !== region.parentElement;
    node = node.parentElement
  ) {
    if (window.getComputedStyle(node).display === 'none') {
      return true;
    }
  }
  return false;
}

/**
 * Collapse each named radio group to the one Tab stop a browser gives it: the
 * focused radio, else the checked one, else the first radio moving forward or
 * the last moving backward. The stop takes the group's first position.
 */
function collapseRadioGroups(
  elements: HTMLElement[],
  active: Element | null,
  isBackward: boolean,
): HTMLElement[] {
  const groups = new Map<string, HTMLInputElement[]>();
  const groupKey = (el: HTMLElement): string | null =>
    el instanceof HTMLInputElement &&
    el.getAttribute('type') === 'radio' &&
    el.name !== ''
      ? `${el.form?.id ?? ''}\u0000${el.name}`
      : null;
  for (const el of elements) {
    const key = groupKey(el);
    if (key != null) {
      const members = groups.get(key) ?? [];
      members.push(el as HTMLInputElement);
      groups.set(key, members);
    }
  }
  const placed = new Set<string>();
  const result: HTMLElement[] = [];
  for (const el of elements) {
    const key = groupKey(el);
    if (key == null) {
      result.push(el);
      continue;
    }
    if (placed.has(key)) {
      continue;
    }
    placed.add(key);
    const members = groups.get(key) ?? [];
    const stop =
      members.find(radio => radio === active) ??
      members.find(radio => radio.checked) ??
      (isBackward ? members[members.length - 1] : members[0]);
    result.push(stop);
  }
  return result;
}

/**
 * Move focus to a Tab stop in the dialog. Reports whether focus actually
 * arrived, so a caller can fall back to the menu instead of stranding focus on
 * the page.
 */
export function focusRegionControl(element: HTMLElement): boolean {
  element.focus();
  return element.ownerDocument.activeElement === element;
}

/**
 * Handle Tab in a menu with a header or footer: move to the next stop of the
 * header's controls, the menu as one stop, then the footer's controls,
 * wrapping at either end. The key is handled in full, so a document-level
 * focus trap never reads it a second time. A row, or a row of an open
 * flyout below this menu, counts as the menu's stop; with no other stop,
 * focus stays in the menu (`isFromFlyout`: a flyout that has just closed
 * itself hands the focus back to the menu's own stop).
 */
export function moveRegionsTab(
  event: React.KeyboardEvent,
  menu: HTMLElement | null,
  header: HTMLElement | null,
  footer: HTMLElement | null,
  isFromFlyout = false,
): void {
  if (menu == null) {
    return;
  }
  event.preventDefault();
  event.stopPropagation();
  const active = document.activeElement;
  // A named radio group is one stop, as the browser's own Tab order has it.
  const cycle = collapseRadioGroups(
    [...tabbablesIn(header), menu, ...tabbablesIn(footer)],
    active,
    event.shiftKey,
  );
  if (cycle.length === 1) {
    // Nothing else to reach: focus stays in the menu. From a flyout that has
    // just closed itself, that is the menu's own stop.
    if (isFromFlyout) {
      menu.focus();
    }
    return;
  }
  const menuIndex = cycle.indexOf(menu);
  let index = menu.contains(active)
    ? menuIndex
    : cycle.findIndex(
        element => element === active || element.contains(active),
      );
  if (index < 0) {
    index = menuIndex;
  }
  const step = event.shiftKey ? -1 : 1;
  const next = cycle[(index + step + cycle.length) % cycle.length];
  if (!focusRegionControl(next)) {
    menu.focus();
  }
}

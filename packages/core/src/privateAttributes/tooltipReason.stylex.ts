// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file privateAttributes/tooltipReason.stylex.ts
 * @input An element; FOCUSABLE_SELECTOR
 * @output setTooltipReason, which marks or unmarks an element as covered by a
 *   reason tooltip, and isCoveredByTooltipReason, which reads whether an
 *   element is inside one or is the wrapper of one field
 * @position Owner module of the private tooltip-reason attribute: the only
 *   file that writes its name or its selector. useTooltip writes it on a
 *   reason tooltip's trigger and reads it for every other tooltip. No package
 *   entry exports it.
 */

import {FOCUSABLE_SELECTOR} from '../hooks/focusableSelector';

const SELECTOR = '[data-astryx-tooltip-reason]';

/** Marks `element` as a control a reason tooltip covers, or unmarks it. */
export function setTooltipReason(element: HTMLElement, isOn: boolean): void {
  if (isOn) {
    element.setAttribute('data-astryx-tooltip-reason', '');
  } else {
    element.removeAttribute('data-astryx-tooltip-reason');
  }
}

/**
 * Whether a reason tooltip covers `element`: it is, or is inside, a marked
 * control, or it is the wrapper of one marked field (a Tooltip around a field
 * that shows a reason). A wrapper of a larger region, with another control
 * outside the marked one, is not covered.
 */
export function isCoveredByTooltipReason(element: Element): boolean {
  if (element.closest(SELECTOR) != null) {
    return true;
  }
  const marks = element.querySelectorAll(SELECTOR);
  if (marks.length !== 1) {
    return false;
  }
  const mark = marks[0];
  for (const control of element.querySelectorAll(FOCUSABLE_SELECTOR)) {
    // A layer the field opens, such as its panel, belongs to the field.
    if (!mark.contains(control) && control.closest('[popover]') == null) {
      return false;
    }
  }
  return true;
}

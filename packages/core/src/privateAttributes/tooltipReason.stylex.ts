// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file privateAttributes/tooltipReason.stylex.ts
 * @input An element; FOCUSABLE_SELECTOR
 * @output setTooltipReason, which marks or unmarks an element as covered by a
 *   reason tooltip and tells every watching tooltip; isCoveredByTooltipReason,
 *   which reads whether an element is inside one or is the wrapper of one
 *   field; and watchTooltipReason, which a tooltip calls to be told
 * @position Owner module of the private tooltip-reason attribute: the only
 *   file that writes its name or its selector. useTooltip writes it on a
 *   reason tooltip's trigger and reads it for every other tooltip. No package
 *   entry exports it.
 */

import {FOCUSABLE_SELECTOR} from '../hooks/focusableSelector';
import {sharedState} from '../utils/sharedRealm';

const SELECTOR = '[data-astryx-tooltip-reason]';

/**
 * The tooltips to tell when a mark changes. It is shared, so a mark that one
 * copy of Core writes reaches the tooltips of every copy.
 */
const watchers = sharedState(
  'tooltip/reason-watchers',
  1,
  () => new Set<() => void>(),
);

/** Calls `onChange` after each mark change. Returns the call that stops it. */
export function watchTooltipReason(onChange: () => void): () => void {
  watchers.add(onChange);
  return () => {
    watchers.delete(onChange);
  };
}

/**
 * Marks `element` as a control a reason tooltip covers, or unmarks it, and
 * tells every watching tooltip.
 */
export function setTooltipReason(element: HTMLElement, isOn: boolean): void {
  if (element.hasAttribute('data-astryx-tooltip-reason') === isOn) {
    return;
  }
  if (isOn) {
    element.setAttribute('data-astryx-tooltip-reason', '');
  } else {
    element.removeAttribute('data-astryx-tooltip-reason');
  }
  for (const onChange of [...watchers]) {
    onChange();
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

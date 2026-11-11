// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file privateAttributes/tooltipReason.stylex.ts
 * @input An element
 * @output setTooltipReason, which marks or unmarks an element as covered by a
 *   reason tooltip, and isCoveredByTooltipReason, which reads whether an
 *   element is inside one or wraps one
 * @position Owner module of the private tooltip-reason attribute: the only
 *   file that writes its name or its selector. useTooltip writes it on a
 *   reason tooltip's trigger and reads it for every other tooltip. No package
 *   entry exports it.
 */

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
 * control, or it wraps one (a Tooltip around a field that shows a reason).
 */
export function isCoveredByTooltipReason(element: Element): boolean {
  return (
    element.closest('[data-astryx-tooltip-reason]') != null ||
    element.querySelector('[data-astryx-tooltip-reason]') != null
  );
}

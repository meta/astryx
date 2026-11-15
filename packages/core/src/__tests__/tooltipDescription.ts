// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file tooltipDescription.ts
 * @input The document a test rendered one tooltip into
 * @output getTooltipDescription — the element that describes the tooltip's trigger
 * @position Test helper for suites that read a tooltip's description before it first shows
 */

/**
 * Returns the element a tooltip's trigger names in `aria-describedby`: the
 * hidden copy of the content before the tooltip first shows, then the
 * tooltip. Throws unless exactly one such element is in the document.
 */
export function getTooltipDescription(): HTMLElement {
  const tooltips = Array.from(
    document.querySelectorAll<HTMLElement>('[role="tooltip"]'),
  );
  const copies = Array.from(
    document.querySelectorAll<HTMLElement>(
      'body > span[hidden][id$="-description"]',
    ),
  );
  const found = [...tooltips, ...copies];
  if (found.length !== 1) {
    throw new Error(
      `expected one tooltip description in the document, found ${found.length}`,
    );
  }
  return found[0];
}

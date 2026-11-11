// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file privateAttributes/popoverRectAnchor.stylex.ts
 * @input The box that stands for a popover's rectangle anchor
 * @output markPopoverRectAnchor, which marks that box, and
 *   findPopoverRectAnchors, which finds the marked boxes
 * @position Owner module of the private popover-rect-anchor attribute: the
 *   only file that writes its name. Popover's rectangle anchor marks its box.
 *   No package entry exports it.
 */

const POPOVER_RECT_ANCHOR = 'data-astryx-popover-rect-anchor';

/** Marks `box` as the box that stands for a popover's rectangle anchor. */
export function markPopoverRectAnchor(box: HTMLElement): void {
  box.setAttribute(POPOVER_RECT_ANCHOR, '');
}

/** The rectangle-anchor boxes under `root`. */
export function findPopoverRectAnchors(root: ParentNode): HTMLElement[] {
  return Array.from(
    root.querySelectorAll<HTMLElement>(`[${POPOVER_RECT_ANCHOR}]`),
  );
}

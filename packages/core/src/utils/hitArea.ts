// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file hitArea.ts
 * @input Rects in client pixels and a touch point
 * @output The touch target geometry: `touchTargetRect` grows a rect toward
 *   44 px, centered; `distanceTo` measures a point's distance to a rect;
 *   `resolveHitTarget` picks the target a touch is for.
 *   `INTERACTIVE_SELECTOR` names what a touch can land on
 * @position Core-internal utility, not exported from `@astryxdesign/core/utils`.
 *   It reads no layout. Press trackers pass it the rects they read when a
 *   press begins, and so does the press check in utils/touchHitArea.ts
 */

/** A rect in client pixels. */
export interface HitRect {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

/** The smallest touch target, px (Apple's 44 pt). */
export const MIN_TOUCH_TARGET = 44;

/** `rect` grown toward `minSize` on each axis, centered. */
export function touchTargetRect(
  rect: HitRect,
  minSize: number = MIN_TOUCH_TARGET,
): HitRect {
  const x = Math.max(0, (minSize - (rect.right - rect.left)) / 2);
  const y = Math.max(0, (minSize - (rect.bottom - rect.top)) / 2);
  return {
    left: rect.left - x,
    top: rect.top - y,
    right: rect.right + x,
    bottom: rect.bottom + y,
  };
}

/** How far (x, y) is from `rect`, px: 0 inside it. */
export function distanceTo(rect: HitRect, x: number, y: number): number {
  const dx = Math.max(rect.left - x, 0, x - rect.right);
  const dy = Math.max(rect.top - y, 0, y - rect.bottom);
  return Math.hypot(dx, dy);
}

/**
 * Which of `rects` a touch at (x, y) is for: the nearest target (inside two
 * overlapping targets, the one whose center is nearer), when the touch is
 * within that target's growth toward `minSize`; -1 otherwise. Being nearest,
 * it is on that target's side of every midpoint, corners included. For a
 * group that measures its actions at press start.
 */
export function resolveHitTarget(
  x: number,
  y: number,
  rects: ReadonlyArray<HitRect>,
  minSize: number = MIN_TOUCH_TARGET,
): number {
  let nearest = -1;
  let nearestDistance = Infinity;
  rects.forEach((rect, index) => {
    const distance =
      distanceTo(rect, x, y) * 1e6 +
      Math.hypot(
        x - (rect.left + rect.right) / 2,
        y - (rect.top + rect.bottom) / 2,
      );
    if (distance < nearestDistance) {
      nearest = index;
      nearestDistance = distance;
    }
  });
  if (nearest === -1) {
    return -1;
  }
  return distanceTo(touchTargetRect(rects[nearest], minSize), x, y) === 0
    ? nearest
    : -1;
}

/** What a touch can land on: the neighbours a hit area must not take from. */
export const INTERACTIVE_SELECTOR = [
  'a[href]',
  'area[href]',
  'button',
  'input:not([type="hidden"])',
  'select',
  'textarea',
  'summary',
  'label[for]',
  '[contenteditable=""]',
  '[contenteditable="true"]',
  '[role="button"]',
  '[role="link"]',
  '[role="checkbox"]',
  '[role="radio"]',
  '[role="switch"]',
  '[role="tab"]',
  '[role="menuitem"]',
  '[role="menuitemcheckbox"]',
  '[role="menuitemradio"]',
  '[role="treeitem"]',
  '[role="combobox"]',
  '[role="textbox"]',
  '[role="searchbox"]',
  '[role="spinbutton"]',
  '[role="option"]',
  '[role="slider"]',
  '[tabindex]:not([tabindex="-1"])',
  // A pressable surface, such as a List row with a click handler.
  '[data-astryx-pressable]',
].join(',');

// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file hitArea.ts
 * @input Rects in client pixels and a touch point, or an element and its
 *   rect on screen
 * @output Touch geometry: `touchTargetRect`, `distanceTo`,
 *   `resolveHitTarget`, and `INTERACTIVE_SELECTOR` (what a touch can land on).
 *   `screenScale` reads how far transforms scale a box, and `layoutSize` a
 *   box's untransformed size (hooks/useOverflow.ts uses both)
 * @position Core-internal. The touch geometry reads no layout: press trackers
 *   and the press check (utils/touchHitArea.ts) pass it the rects they read.
 *   `screenScale` and `layoutSize` read a box's style only when called.
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

/** A box that the transforms around it leave at its layout size. */
const UNSCALED = {x: 1, y: 1} as const;

/**
 * What `screenScale` reads as unscaled. `pixels`: a box within this many
 * pixels of its whole-pixel offset size, read without a style lookup (0 turns
 * the shortcut off). `ratio`: a scale less than this far from 1.
 */
export interface ScreenScaleTolerance {
  readonly pixels: number;
  readonly ratio: number;
}

/** One axis of a box's scale on screen: its client size over its layout size. */
function axisScale(onScreen: number, layout: number, ratio: number): number {
  if (!(layout > 0) || !(onScreen > 0)) {
    return 1;
  }
  const scale = onScreen / layout;
  // Within the tolerance of 1 the box is at its layout size.
  return Math.abs(scale - 1) < ratio ? 1 : scale;
}

/**
 * A box's border-box size in layout px, from its computed style. Transforms
 * do not change it, and it keeps the sub-pixel size a scaled rect loses to
 * the browser's rounding. Null when the style has no pixel width.
 */
export function layoutSize(
  element: Element,
): {width: number; height: number} | null {
  const style = element.ownerDocument.defaultView?.getComputedStyle(element);
  if (style == null || !style.width.endsWith('px')) {
    return null;
  }
  const px = (value: string) => Number.parseFloat(value) || 0;
  const isContentBox = style.boxSizing !== 'border-box';
  return {
    width:
      px(style.width) +
      (isContentBox
        ? px(style.paddingLeft) +
          px(style.paddingRight) +
          px(style.borderLeftWidth) +
          px(style.borderRightWidth)
        : 0),
    height:
      px(style.height) +
      (isContentBox
        ? px(style.paddingTop) +
          px(style.paddingBottom) +
          px(style.borderTopWidth) +
          px(style.borderBottomWidth)
        : 0),
  };
}

/**
 * How far the transforms around `element` scale its box on screen, per axis.
 * A layer that opens from a smaller scale scales every rect inside it, while
 * the layout box keeps the size the layer settles at. Only a scale is
 * expected: a rotated or skewed box would read as a larger scale.
 */
export function screenScale(
  element: Element,
  onScreen: HitRect,
  tolerance: ScreenScaleTolerance,
): {x: number; y: number} {
  // The offset size is the layout size in whole pixels, unaffected by
  // transforms, and costs no style resolution. A box with none, such as an SVG
  // element or a jsdom box, reads as unscaled.
  const box = element as Partial<HTMLElement>;
  const offsetWidth = box.offsetWidth ?? 0;
  const offsetHeight = box.offsetHeight ?? 0;
  if (offsetWidth === 0 || offsetHeight === 0) {
    return UNSCALED;
  }
  // Within `tolerance.pixels` of its layout size the box reads as unscaled.
  // Any other box reads its exact size from the computed style.
  if (
    tolerance.pixels > 0 &&
    Math.abs(onScreen.right - onScreen.left - offsetWidth) <=
      tolerance.pixels &&
    Math.abs(onScreen.bottom - onScreen.top - offsetHeight) <= tolerance.pixels
  ) {
    return UNSCALED;
  }
  const size = layoutSize(element);
  if (size == null) {
    return UNSCALED;
  }
  const {width, height} = size;
  return {
    x: axisScale(onScreen.right - onScreen.left, width, tolerance.ratio),
    y: axisScale(onScreen.bottom - onScreen.top, height, tolerance.ratio),
  };
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

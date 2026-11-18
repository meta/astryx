// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file screenScale.ts
 * @input An element and its client rect
 * @output Exports `screenScale`, how far the transforms around the element
 *   scale its box on screen, per axis, within a tolerance the caller sets
 * @position Shared by utils/hitArea.ts (hit areas inside a layer that scales
 *   in) and hooks/useOverflow.ts (a list under a scaled ancestor)
 */

/** A client rect's edges, in screen px. */
export interface ScreenRect {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

/** A box that the transforms around it leave at its layout size. */
const UNSCALED = {x: 1, y: 1} as const;

/** One axis of a box's scale on screen: its client size over its layout size. */
function axisScale(onScreen: number, layout: number): number {
  if (!(layout > 0) || !(onScreen > 0)) {
    return 1;
  }
  const scale = onScreen / layout;
  // Within rounding of 1 the box is at its layout size: no change to the rects.
  return Math.abs(scale - 1) < 1e-3 ? 1 : scale;
}

/**
 * How far the transforms around `element` scale its box on screen, per axis.
 * A layer that opens from a smaller scale scales every rect inside it, while
 * the layout box keeps the size the layer settles at. Only a scale is
 * expected: a rotated or skewed box would read as a larger scale.
 */
export function screenScale(
  element: Element,
  onScreen: ScreenRect,
  pixelTolerance: number,
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
  // Within `pixelTolerance` of its whole-pixel layout size the box reads as
  // unscaled, without a style read; a caller that needs the exact ratio passes
  // 0. Any other box reads its exact size from the computed style.
  if (
    Math.abs(onScreen.right - onScreen.left - offsetWidth) <= pixelTolerance &&
    Math.abs(onScreen.bottom - onScreen.top - offsetHeight) <= pixelTolerance
  ) {
    return UNSCALED;
  }
  const style = element.ownerDocument.defaultView?.getComputedStyle(element);
  if (style == null || !style.width.endsWith('px')) {
    return UNSCALED;
  }
  const px = (value: string) => Number.parseFloat(value) || 0;
  const isContentBox = style.boxSizing !== 'border-box';
  const width =
    px(style.width) +
    (isContentBox
      ? px(style.paddingLeft) +
        px(style.paddingRight) +
        px(style.borderLeftWidth) +
        px(style.borderRightWidth)
      : 0);
  const height =
    px(style.height) +
    (isContentBox
      ? px(style.paddingTop) +
        px(style.paddingBottom) +
        px(style.borderTopWidth) +
        px(style.borderBottomWidth)
      : 0);
  return {
    x: axisScale(onScreen.right - onScreen.left, width),
    y: axisScale(onScreen.bottom - onScreen.top, height),
  };
}

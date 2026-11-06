// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file revealBand.ts
 * @input A box's top and bottom edges and a band's, CSS px
 * @output distanceIntoBand, the scroll that brings the box inside the band
 * @position Keyboard module, internal to core. A field's reveal and the
 *   Tall sheet's reveal share it.
 */

/**
 * How far content must scroll so a box from `top` to `bottom` sits inside the
 * band from `safeTop` to `safeBottom`, CSS px. A positive distance scrolls it
 * up and a negative one down. It is 0 when the box fits or the band is empty. A
 * box taller than the band keeps its bottom edge in it.
 *
 * @example
 * ```
 * const distance = distanceIntoBand(rect.top, rect.bottom, 0, keyboardTop - 17);
 * ```
 */
export function distanceIntoBand(
  top: number,
  bottom: number,
  safeTop: number,
  safeBottom: number,
): number {
  if (safeBottom <= safeTop) {
    return 0;
  }
  if (bottom > safeBottom) {
    return bottom - safeBottom;
  }
  if (top < safeTop) {
    return top - safeTop;
  }
  return 0;
}

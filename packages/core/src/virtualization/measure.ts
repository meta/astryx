// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file measure.ts
 * @input A CSS font shorthand and text, or a computed CSS length
 * @output Canvas text widths and pixel values, with no layout read and no DOM
 *   write
 * @position Measurement helpers of the private list-windowing module, for a
 *   consumer that sizes content before it mounts
 */

let textContext: OffscreenCanvasRenderingContext2D | null | undefined;

/** Canvas text metrics: no layout read and no DOM write. */
export function measureText(font: string, text: string): number | undefined {
  if (textContext === undefined) {
    textContext =
      typeof OffscreenCanvas === 'undefined'
        ? null
        : new OffscreenCanvas(1, 1).getContext('2d');
  }
  if (textContext == null) {
    return undefined;
  }
  textContext.font = font;
  return textContext.measureText(text).width;
}

export function readPixels(value: string): number {
  return Number.parseFloat(value) || 0;
}

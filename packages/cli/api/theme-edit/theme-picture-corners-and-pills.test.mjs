// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Two picture readings: a rounded box's corners are no text holes
 * (textPlace), and values that are equal agree, pills' Infinity included
 * (agreed), so a picture of pill controls offers `corners pill`.
 */

import {describe, expect, it} from 'vitest';
import {agreed, textPlace} from './_picture-traits.mjs';

/**
 * A box of label 1 on a page of label 0, its corners cut to a radius, with
 * an optional block of text (label 2) inside.
 * @param {number} W @param {number} H @param {number} r
 * @param {{x0: number, x1: number, y0: number, y1: number}} [text]
 */
function roundedBox(W, H, r, text) {
  const label = new Int32Array(W * H);
  const s = {x0: 0, y0: 0, x1: W - 1, y1: H - 1};
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const dx = x < r ? r - x : x > W - 1 - r ? x - (W - 1 - r) : 0;
      const dy = y < r ? r - y : y > H - 1 - r ? y - (H - 1 - r) : 0;
      const out = dx > 0 && dy > 0 && dx * dx + dy * dy > r * r;
      const inText =
        text && x >= text.x0 && x <= text.x1 && y >= text.y0 && y <= text.y1;
      label[y * W + x] = out ? 0 : inText ? 2 : 1;
    }
  return {label, s};
}

describe('where a rounded box holds its text', () => {
  it('reads no text in an empty rounded field', () => {
    const {label, s} = roundedBox(120, 36, 12);
    expect(textPlace(1, /** @type {any} */ (s), label, 120, 12)).toBe('none');
  });

  it('reads text at the start of a rounded field, never its corners', () => {
    const {label, s} = roundedBox(120, 36, 12, {
      x0: 14,
      x1: 50,
      y0: 12,
      y1: 24,
    });
    expect(textPlace(1, /** @type {any} */ (s), label, 120, 12)).toBe('start');
  });

  it('reads centered text in a pill', () => {
    const {label, s} = roundedBox(120, 36, 18, {
      x0: 40,
      x1: 79,
      y0: 12,
      y1: 24,
    });
    expect(textPlace(1, /** @type {any} */ (s), label, 120, 18)).toBe(
      'centered',
    );
  });
});

describe('the value boxes agree on', () => {
  it('counts equal pills as agreeing', () => {
    expect(agreed([Infinity, Infinity, Infinity], 1)).toEqual({
      value: Infinity,
      n: 3,
    });
  });

  it('keeps near values together', () => {
    expect(agreed([8, 8, 9, 20], 1).n).toBe(3);
  });
});

// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file frames.colorblock.test.ts
 * @input frames.ts's color-resolution reader
 * @output Unit cases: a cast frame's color block is read from its own frame
 *   header (a JPEG's chroma subsampling: 4:2:0 in 2 by 2 pixel blocks, 4:2:2
 *   in 2 by 1, 4:4:4 and grayscale in 1 by 1) and is 1 by 1 for a PNG; a
 *   JPEG with no frame header is an error, never a default.
 * @position Node unit tests beside the harness's browser self-tests.
 *
 * SYNC: When modified, update frames.ts (colorBlockPx).
 */

import {describe, expect, it} from 'vitest';
import {colorBlockPx} from './frames';

/**
 * A minimal JPEG as base64: the start-of-image marker, an application
 * segment, then a baseline frame header (402 by 714) whose components carry
 * `factors` (horizontal in the high nibble, vertical in the low one).
 */
const jpeg = (factors: readonly number[]): string => {
  const app0 = [
    0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00,
    0x00, 0x01, 0x00, 0x01, 0x00, 0x00,
  ];
  const sof = [
    0xff,
    0xc0,
    0x00,
    8 + 3 * factors.length,
    8,
    0x02,
    0xca,
    0x01,
    0x92,
    factors.length,
    ...factors.flatMap((f, k) => [k + 1, f, k === 0 ? 0 : 1]),
  ];
  return Buffer.from([0xff, 0xd8, ...app0, ...sof, 0xff, 0xd9]).toString(
    'base64',
  );
};

describe('colorBlockPx', () => {
  it("reads a JPEG's chroma subsampling from its frame header", () => {
    expect(colorBlockPx(jpeg([0x22, 0x11, 0x11]), 'jpeg')).toEqual({
      x: 2,
      y: 2,
    });
    expect(colorBlockPx(jpeg([0x21, 0x11, 0x11]), 'jpeg')).toEqual({
      x: 2,
      y: 1,
    });
    expect(colorBlockPx(jpeg([0x11, 0x11, 0x11]), 'jpeg')).toEqual({
      x: 1,
      y: 1,
    });
    expect(colorBlockPx(jpeg([0x11]), 'jpeg')).toEqual({x: 1, y: 1});
  });

  it('takes a PNG at one block a pixel', () => {
    expect(colorBlockPx('', 'png')).toEqual({x: 1, y: 1});
  });

  it('fails on a JPEG with no frame header', () => {
    expect(() =>
      colorBlockPx(
        Buffer.from([0xff, 0xd8, 0xff, 0xd9]).toString('base64'),
        'jpeg',
      ),
    ).toThrow(/no frame header/);
  });
});

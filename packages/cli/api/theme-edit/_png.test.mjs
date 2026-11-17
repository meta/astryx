// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The plain-Node PNG reader behind `theme editor how <picture.png>`:
 * every supported color format decodes to the same RGBA pixels, every row
 * filter is undone, unsupported or broken files are refused with a clear
 * message, and the two readers (`colorsAt`, `mainColors`) report what the
 * pixels hold.
 */

import * as zlib from 'node:zlib';
import {describe, expect, it} from 'vitest';
import {colorsAt, decodePng, mainColors} from './_png.mjs';

const SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

/** @type {number[]} */
const CRC_TABLE = Array.from({length: 256}, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

/** @param {Buffer} buf */
function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/**
 * @param {string} type
 * @param {Buffer} body
 */
function chunk(type, body) {
  const head = Buffer.alloc(4);
  head.writeUInt32BE(body.length);
  const typed = Buffer.concat([Buffer.from(type, 'latin1'), body]);
  const tail = Buffer.alloc(4);
  tail.writeUInt32BE(crc32(typed));
  return Buffer.concat([head, typed, tail]);
}

/**
 * Apply PNG row filter `type` to one unfiltered row, given the row above.
 * @param {number} type
 * @param {Buffer} line
 * @param {Buffer | null} prev
 * @param {number} bpp
 */
function filterRow(type, line, prev, bpp) {
  const out = Buffer.alloc(line.length);
  for (let x = 0; x < line.length; x++) {
    const a = x >= bpp ? line[x - bpp] : 0;
    const b = prev ? prev[x] : 0;
    const c = prev && x >= bpp ? prev[x - bpp] : 0;
    let predicted = 0;
    if (type === 1) predicted = a;
    else if (type === 2) predicted = b;
    else if (type === 3) predicted = (a + b) >> 1;
    else if (type === 4) {
      const p = a + b - c;
      const pa = Math.abs(p - a);
      const pb = Math.abs(p - b);
      const pc = Math.abs(p - c);
      predicted = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
    }
    out[x] = (line[x] - predicted) & 255;
  }
  return out;
}

/**
 * Build a PNG from already-packed (unfiltered) rows.
 * @param {{
 *   width: number,
 *   height: number,
 *   depth?: number,
 *   colorType: number,
 *   rows: number[][],
 *   filters?: number[],
 *   palette?: number[],
 *   trns?: number[],
 *   interlace?: number,
 *   splitIdat?: boolean,
 * }} o
 */
function makePng(o) {
  const depth = o.depth ?? 8;
  const channels = /** @type {Record<number, number>} */ ({
    0: 1,
    2: 3,
    3: 1,
    4: 2,
    6: 4,
  })[o.colorType];
  const bpp = Math.max(1, (channels * depth) >> 3);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(o.width, 0);
  ihdr.writeUInt32BE(o.height, 4);
  ihdr[8] = depth;
  ihdr[9] = o.colorType;
  ihdr[12] = o.interlace ?? 0;
  const lines = o.rows.map(r => Buffer.from(r));
  const raw = Buffer.concat(
    lines.map((line, y) => {
      const f = o.filters?.[y] ?? 0;
      const prev = y > 0 ? lines[y - 1] : null;
      return Buffer.concat([Buffer.from([f]), filterRow(f, line, prev, bpp)]);
    }),
  );
  const z = zlib.deflateSync(raw);
  const idat = o.splitIdat
    ? [chunk('IDAT', z.subarray(0, 3)), chunk('IDAT', z.subarray(3))]
    : [chunk('IDAT', z)];
  return Buffer.concat([
    SIGNATURE,
    chunk('IHDR', ihdr),
    ...(o.palette ? [chunk('PLTE', Buffer.from(o.palette))] : []),
    ...(o.trns ? [chunk('tRNS', Buffer.from(o.trns))] : []),
    ...idat,
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** @param {Uint8Array} rgba */
const pixels = rgba => Array.from(rgba);

describe('decodePng: color formats', () => {
  it('reads 8-bit RGBA', () => {
    const pic = decodePng(
      makePng({
        width: 2,
        height: 1,
        colorType: 6,
        rows: [[255, 0, 0, 255, 0, 128, 255, 64]],
      }),
    );
    expect(pic.width).toBe(2);
    expect(pic.height).toBe(1);
    expect(pixels(pic.rgba)).toEqual([255, 0, 0, 255, 0, 128, 255, 64]);
  });

  it('reads 8-bit RGB as fully opaque', () => {
    const pic = decodePng(
      makePng({width: 2, height: 1, colorType: 2, rows: [[1, 2, 3, 4, 5, 6]]}),
    );
    expect(pixels(pic.rgba)).toEqual([1, 2, 3, 255, 4, 5, 6, 255]);
  });

  it('reads 8-bit grayscale, and grayscale with alpha', () => {
    const gray = decodePng(
      makePng({width: 2, height: 1, colorType: 0, rows: [[10, 200]]}),
    );
    expect(pixels(gray.rgba)).toEqual([10, 10, 10, 255, 200, 200, 200, 255]);
    const withAlpha = decodePng(
      makePng({width: 2, height: 1, colorType: 4, rows: [[10, 99, 200, 7]]}),
    );
    expect(pixels(withAlpha.rgba)).toEqual([10, 10, 10, 99, 200, 200, 200, 7]);
  });

  it('reads a palette picture, with and without transparency', () => {
    const palette = [255, 0, 0, 0, 255, 0, 0, 0, 255];
    const opaque = decodePng(
      makePng({width: 3, height: 1, colorType: 3, palette, rows: [[0, 1, 2]]}),
    );
    expect(pixels(opaque.rgba)).toEqual([
      255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255,
    ]);
    // tRNS covers only the first entries; the rest stay opaque.
    const clear = decodePng(
      makePng({
        width: 3,
        height: 1,
        colorType: 3,
        palette,
        trns: [0, 128],
        rows: [[0, 1, 2]],
      }),
    );
    expect(clear.rgba[3]).toBe(0);
    expect(clear.rgba[7]).toBe(128);
    expect(clear.rgba[11]).toBe(255);
  });

  it('scales low-bit grayscale up to the full 0-255 range', () => {
    // 1-bit: samples 1,0,1,0 packed MSB first -> 0b1010_0000
    const one = decodePng(
      makePng({
        width: 4,
        height: 1,
        depth: 1,
        colorType: 0,
        rows: [[0b10100000]],
      }),
    );
    expect(Array.from(one.rgba).filter((_, i) => i % 4 === 0)).toEqual([
      255, 0, 255, 0,
    ]);
    // 2-bit: samples 0,1,2,3 -> 0b00_01_10_11
    const two = decodePng(
      makePng({
        width: 4,
        height: 1,
        depth: 2,
        colorType: 0,
        rows: [[0b00011011]],
      }),
    );
    expect(Array.from(two.rgba).filter((_, i) => i % 4 === 0)).toEqual([
      0, 85, 170, 255,
    ]);
    // 4-bit: samples 0x0 and 0xf
    const four = decodePng(
      makePng({width: 2, height: 1, depth: 4, colorType: 0, rows: [[0x0f]]}),
    );
    expect(Array.from(four.rgba).filter((_, i) => i % 4 === 0)).toEqual([
      0, 255,
    ]);
  });

  it('keeps the high byte of 16-bit samples', () => {
    const pic = decodePng(
      makePng({
        width: 1,
        height: 1,
        depth: 16,
        colorType: 2,
        rows: [[0xff, 0xaa, 0x80, 0x01, 0x00, 0xff]],
      }),
    );
    expect(pixels(pic.rgba)).toEqual([0xff, 0x80, 0x00, 255]);
  });

  it('joins pixel data split across several IDAT chunks', () => {
    const pic = decodePng(
      makePng({
        width: 2,
        height: 2,
        colorType: 2,
        splitIdat: true,
        rows: [
          [1, 2, 3, 4, 5, 6],
          [7, 8, 9, 10, 11, 12],
        ],
      }),
    );
    expect(pixels(pic.rgba)).toEqual([
      1, 2, 3, 255, 4, 5, 6, 255, 7, 8, 9, 255, 10, 11, 12, 255,
    ]);
  });
});

describe('decodePng: row filters', () => {
  const rows = [
    [10, 20, 30, 40, 50, 60],
    [15, 25, 35, 200, 100, 7],
    [9, 250, 3, 77, 1, 255],
  ];
  const expected = rows.flatMap(r => [
    r[0],
    r[1],
    r[2],
    255,
    r[3],
    r[4],
    r[5],
    255,
  ]);

  for (const [filter, name] of [
    [0, 'None'],
    [1, 'Sub'],
    [2, 'Up'],
    [3, 'Average'],
    [4, 'Paeth'],
  ]) {
    it(`undoes filter ${filter} (${name}) on every row`, () => {
      const pic = decodePng(
        makePng({
          width: 2,
          height: 3,
          colorType: 2,
          rows,
          filters: [filter, filter, filter],
        }),
      );
      expect(pixels(pic.rgba)).toEqual(expected);
    });
  }

  // The Paeth predictor picks whichever of left (a), above (b) and
  // upper-left (c) is nearest a + b - c. Each case below makes a different
  // neighbor the winner, so a decoder that mishandles one of them fails.
  for (const [a, b, c, winner] of [
    [100, 200, 190, 'left'],
    [200, 100, 190, 'above'],
    [10, 200, 105, 'upper-left'],
  ]) {
    it(`Paeth: predicts from the ${winner} neighbor when it is nearest`, () => {
      const pic = decodePng(
        makePng({
          width: 2,
          height: 2,
          colorType: 2,
          // Second pixel of the second row: left = a, above = b, upper-left = c.
          rows: [
            [c, c, c, b, b, b],
            [a, a, a, 77, 3, 250],
          ],
          filters: [0, 4],
        }),
      );
      expect(pixels(pic.rgba).slice(12, 16)).toEqual([77, 3, 250, 255]);
    });
  }

  it('undoes a different filter on each row', () => {
    const pic = decodePng(
      makePng({
        width: 2,
        height: 3,
        colorType: 2,
        rows,
        filters: [1, 4, 3],
      }),
    );
    expect(pixels(pic.rgba)).toEqual(expected);
  });
});

describe('decodePng: refusals', () => {
  it('refuses bytes that are not a PNG', () => {
    expect(() => decodePng(Buffer.from('GIF89a......'))).toThrow(
      'not a PNG file',
    );
    expect(() => decodePng(Buffer.alloc(0))).toThrow('not a PNG file');
    expect(() => decodePng(SIGNATURE.subarray(0, 5))).toThrow('not a PNG file');
  });

  it('refuses a PNG with no header chunk', () => {
    expect(() =>
      decodePng(Buffer.concat([SIGNATURE, chunk('IEND', Buffer.alloc(0))])),
    ).toThrow('the PNG has no header');
  });

  it('refuses an interlaced PNG', () => {
    expect(() =>
      decodePng(
        makePng({
          width: 1,
          height: 1,
          colorType: 2,
          interlace: 1,
          rows: [[1, 2, 3]],
        }),
      ),
    ).toThrow('interlaced PNG files are not supported');
  });

  it('refuses a color type or bit depth it cannot read', () => {
    const png = makePng({width: 1, height: 1, colorType: 2, rows: [[1, 2, 3]]});
    // Corrupt the IHDR color type (byte 9 of the IHDR body at offset 16).
    const badType = Buffer.from(png);
    badType[8 + 8 + 9] = 5;
    expect(() => decodePng(badType)).toThrow('is not a valid PNG format');
    const badDepth = Buffer.from(png);
    badDepth[8 + 8 + 8] = 3;
    expect(() => decodePng(badDepth)).toThrow('is not a valid PNG format');
  });
});

describe('colorsAt', () => {
  const pic = decodePng(
    makePng({
      width: 2,
      height: 2,
      colorType: 2,
      rows: [
        [255, 0, 0, 0, 255, 0],
        [0, 0, 255, 1, 2, 3],
      ],
    }),
  );

  it('gives the exact hex color and alpha at each point, in order', () => {
    expect(
      colorsAt(pic, [
        {x: 1, y: 0},
        {x: 0, y: 1},
        {x: 1, y: 1},
        {x: 0, y: 0},
      ]),
    ).toEqual([
      {at: '1,0', color: '#00ff00', alpha: 1},
      {at: '0,1', color: '#0000ff', alpha: 1},
      {at: '1,1', color: '#010203', alpha: 1},
      {at: '0,0', color: '#ff0000', alpha: 1},
    ]);
  });

  it("reads every corner, the picture's last column and row included", () => {
    const corners = [
      {x: 0, y: 0},
      {x: pic.width - 1, y: 0},
      {x: 0, y: pic.height - 1},
      {x: pic.width - 1, y: pic.height - 1},
    ];
    expect(colorsAt(pic, corners).map(p => p.color)).toEqual([
      '#ff0000',
      '#00ff00',
      '#0000ff',
      '#010203',
    ]);
  });

  it('gives the alpha of a see-through pixel, to two decimals', () => {
    const clear = decodePng(
      makePng({width: 1, height: 1, colorType: 6, rows: [[10, 20, 30, 128]]}),
    );
    expect(colorsAt(clear, [{x: 0, y: 0}])).toEqual([
      {at: '0,0', color: '#0a141e', alpha: 0.5},
    ]);
  });

  // The `how` lookup refuses points outside the picture before it reads
  // any (theme-edit.test.mjs); read directly, they have no color.
  it('gives null for a point outside the picture', () => {
    expect(
      colorsAt(pic, [
        {x: -1, y: 0},
        {x: 0, y: -1},
        {x: 2, y: 0},
        {x: 0, y: 2},
      ]),
    ).toEqual([
      {at: '-1,0', color: null, alpha: null},
      {at: '0,-1', color: null, alpha: null},
      {at: '2,0', color: null, alpha: null},
      {at: '0,2', color: null, alpha: null},
    ]);
  });

  it('gives an empty list for no points', () => {
    expect(colorsAt(pic, [])).toEqual([]);
  });
});

describe('mainColors', () => {
  /**
   * A width x height RGB picture where `paint(x, y)` picks each pixel.
   * @param {number} width
   * @param {number} height
   * @param {(x: number, y: number) => number[]} paint
   */
  function picture(width, height, paint) {
    /** @type {number[][]} */
    const rows = [];
    for (let y = 0; y < height; y++) {
      /** @type {number[]} */
      const row = [];
      for (let x = 0; x < width; x++) row.push(...paint(x, y));
      rows.push(row);
    }
    return decodePng(makePng({width, height, colorType: 2, rows}));
  }

  it('reports a solid picture as one color holding all of it', () => {
    const pic = picture(10, 10, () => [18, 52, 86]);
    expect(mainColors(pic, 5)).toEqual([
      {color: '#123456', share: 100, where: 'middle'},
    ]);
  });

  it('puts the biggest share first and honors the count', () => {
    // Left 3/4 white, right 1/4 black.
    const pic = picture(8, 8, x => (x < 6 ? [255, 255, 255] : [0, 0, 0]));
    const all = mainColors(pic, 5);
    expect(all.map(c => c.color)).toEqual(['#ffffff', '#000000']);
    expect(all[0].share).toBe(75);
    expect(all[1].share).toBe(25);
    expect(mainColors(pic, 1).map(c => c.color)).toEqual(['#ffffff']);
  });

  it('says where each color sits', () => {
    // Top 10% band is red, the bottom 10% blue, the rest white.
    const pic = picture(20, 20, (_x, y) =>
      y < 2 ? [255, 0, 0] : y >= 18 ? [0, 0, 255] : [255, 255, 255],
    );
    const byColor = Object.fromEntries(
      mainColors(pic, 5).map(c => [c.color, c.where]),
    );
    expect(byColor['#ff0000']).toBe('top');
    expect(byColor['#0000ff']).toBe('bottom');
    expect(byColor['#ffffff']).toBe('middle');
  });

  it('adds -left and -right for colors hugging a side', () => {
    const pic = picture(20, 20, x =>
      x < 4 ? [255, 0, 0] : x >= 16 ? [0, 0, 255] : [255, 255, 255],
    );
    const byColor = Object.fromEntries(
      mainColors(pic, 5).map(c => [c.color, c.where]),
    );
    expect(byColor['#ff0000']).toBe('middle-left');
    expect(byColor['#0000ff']).toBe('middle-right');
  });

  it('groups near-identical shades into one bucket and averages them', () => {
    // 5 bits per channel: 100 and 102 share a bucket, 100 and 140 do not.
    const pic = picture(8, 8, x =>
      x % 4 < 2 ? [100, 100, 100] : [102, 102, 102],
    );
    const colors = mainColors(pic, 5);
    expect(colors).toHaveLength(1);
    expect(colors[0].share).toBe(100);
    expect(colors[0].color).toBe('#656565');
    const far = picture(8, 8, x => (x < 4 ? [100, 100, 100] : [140, 140, 140]));
    expect(mainColors(far, 5)).toHaveLength(2);
  });
});

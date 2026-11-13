// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Read a PNG in plain Node: check the header and size before taking
 * memory, decompress with zlib to exactly the size the header names, undo
 * the row filters, and give RGBA pixels. Then the main colors of a picture,
 * or the exact color and alpha at given points.
 * @position api/theme-edit — pure helpers for `experimental theme editor how <picture.png>`
 */

import * as zlib from 'node:zlib';
import {wordTable} from './_tables.mjs';

const SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

/**
 * The most pixels a picture may have: about a 6K screen. A bigger header is
 * refused before any memory is taken for it.
 */
export const MAX_PIXELS = 40_000_000;

/** A 16-bit picture takes twice the memory per pixel, so half as many. */
export const MAX_PIXELS_16 = 20_000_000;

/** The most pixels the main colors read one by one; past it they stride. */
const SAMPLE_BUDGET = 4_000_000;

/** The bit depths each PNG color type allows. */
const DEPTHS = wordTable(
  /** @type {Record<number, number[]>} */ ({
    0: [1, 2, 4, 8, 16],
    2: [8, 16],
    3: [1, 2, 4, 8],
    4: [8, 16],
    6: [8, 16],
  }),
);
const CHANNELS = wordTable(
  /** @type {Record<number, number>} */ ({
    0: 1,
    2: 3,
    3: 1,
    4: 2,
    6: 4,
  }),
);

/** @typedef {{width: number, height: number, rgba: Uint8Array}} Picture */

/**
 * Decode a PNG file's bytes. Interlaced pictures are refused, and so is
 * any file whose header, chunks or pixel data do not match the PNG format.
 * @param {Buffer} bytes
 * @returns {Picture}
 */
export function decodePng(bytes) {
  if (bytes.length < 8 || !bytes.subarray(0, 8).equals(SIGNATURE))
    throw new Error('not a PNG file');
  let pos = 8;
  let width = 0;
  let height = 0;
  let depth = 0;
  let colorType = 0;
  let interlace = 0;
  let header = false;
  /** @type {Buffer | null} */
  let palette = null;
  /** @type {Buffer | null} */
  let alpha = null;
  /** @type {Buffer[]} */
  const data = [];
  while (pos + 8 <= bytes.length) {
    const length = bytes.readUInt32BE(pos);
    const type = bytes.toString('latin1', pos + 4, pos + 8);
    if (pos + 12 + length > bytes.length)
      throw new Error(`the ${type} chunk is cut off`);
    const body = bytes.subarray(pos + 8, pos + 8 + length);
    pos += 12 + length;
    if (type === 'IHDR') {
      if (length !== 13) throw new Error('the PNG header is damaged');
      width = body.readUInt32BE(0);
      height = body.readUInt32BE(4);
      depth = body[8];
      colorType = body[9];
      interlace = body[12];
      header = true;
    } else if (type === 'PLTE') palette = body;
    else if (type === 'tRNS') alpha = body;
    else if (type === 'IDAT') data.push(body);
    else if (type === 'IEND') break;
  }
  if (!header) throw new Error('the PNG has no header');
  if (!width || !height)
    throw new Error(
      `the picture is ${width}x${height} pixels, so it has no colors`,
    );
  if (interlace) throw new Error('interlaced PNG files are not supported');
  if (!DEPTHS[colorType]?.includes(depth))
    throw new Error(
      `color type ${colorType} at bit depth ${depth} is not a valid PNG format`,
    );
  const cap = depth === 16 ? MAX_PIXELS_16 : MAX_PIXELS;
  if (width * height > cap)
    throw new Error(
      `the picture is ${width}x${height}${depth === 16 ? ' at 16 bits per channel' : ''}, more than ${cap / 1e6} million pixels; crop or scale it down${depth === 16 ? ', or save it at 8 bits' : ''}`,
    );
  if (colorType === 3 && !palette)
    throw new Error('the PNG uses a palette but has none');
  if (!data.length) throw new Error('the PNG has no pixel data');
  const channels = CHANNELS[colorType];
  const bitsPerPixel = channels * depth;
  const stride = Math.ceil((width * bitsPerPixel) / 8);
  const expected = (stride + 1) * height;
  /** @type {Buffer} */
  let raw;
  try {
    raw = zlib.inflateSync(Buffer.concat(data), {maxOutputLength: expected});
  } catch (e) {
    // Node reports output past the limit as a RangeError.
    throw new Error(
      e instanceof RangeError
        ? 'the pixel data is longer than the header says'
        : 'the pixel data is damaged',
      {cause: e},
    );
  }
  if (raw.length < expected)
    throw new Error(
      `the pixel data is cut off: ${raw.length} of ${expected} bytes`,
    );
  const bpp = Math.max(1, bitsPerPixel >> 3);
  const rows = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    if (filter > 4)
      throw new Error(`row ${y} has an unknown filter type ${filter}`);
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const out = rows.subarray(y * stride, (y + 1) * stride);
    const prev = y > 0 ? rows.subarray((y - 1) * stride, y * stride) : null;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? out[x - bpp] : 0;
      const b = prev ? prev[x] : 0;
      const c = prev && x >= bpp ? prev[x - bpp] : 0;
      let v = line[x];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      out[x] = v & 255;
    }
  }
  const rgba = new Uint8Array(width * height * 4);
  const max = (1 << depth) - 1;
  /** @param {number} y @param {number} i sample index in the row */
  const sample = (y, i) => {
    const row = y * stride;
    if (depth === 8) return rows[row + i];
    if (depth === 16) return rows[row + i * 2];
    const bit = i * depth;
    const byte = rows[row + (bit >> 3)];
    const v = (byte >> (8 - depth - (bit & 7))) & max;
    return colorType === 3 ? v : Math.round((v * 255) / max);
  };
  const entries = palette ? Math.floor(palette.length / 3) : 0;
  /** A sample as stored, before scaling to 0-255. @param {number} y @param {number} i */
  const raw16 = (y, i) => {
    const row = y * stride;
    if (depth === 16) return (rows[row + i * 2] << 8) | rows[row + i * 2 + 1];
    if (depth === 8) return rows[row + i];
    const bit = i * depth;
    return (rows[row + (bit >> 3)] >> (8 - depth - (bit & 7))) & max;
  };
  // tRNS for gray and RGB pictures names one color that is fully
  // see-through.
  const key =
    alpha && colorType === 0 && alpha.length >= 2
      ? [alpha.readUInt16BE(0)]
      : alpha && colorType === 2 && alpha.length >= 6
        ? [alpha.readUInt16BE(0), alpha.readUInt16BE(2), alpha.readUInt16BE(4)]
        : null;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4;
      const s = x * channels;
      if (colorType === 3) {
        const idx = sample(y, s);
        if (idx >= entries)
          throw new Error(`a pixel names palette entry ${idx} of ${entries}`);
        const pal = /** @type {Buffer} */ (palette);
        rgba[o] = pal[idx * 3];
        rgba[o + 1] = pal[idx * 3 + 1];
        rgba[o + 2] = pal[idx * 3 + 2];
        rgba[o + 3] = alpha && idx < alpha.length ? alpha[idx] : 255;
      } else if (colorType === 0 || colorType === 4) {
        const g = sample(y, s);
        rgba[o] = rgba[o + 1] = rgba[o + 2] = g;
        rgba[o + 3] =
          colorType === 4
            ? sample(y, s + 1)
            : key && raw16(y, s) === key[0]
              ? 0
              : 255;
      } else {
        rgba[o] = sample(y, s);
        rgba[o + 1] = sample(y, s + 1);
        rgba[o + 2] = sample(y, s + 2);
        rgba[o + 3] =
          colorType === 6
            ? sample(y, s + 3)
            : key && key.every((k, n) => raw16(y, s + n) === k)
              ? 0
              : 255;
      }
    }
  }
  return {width, height, rgba};
}

/** @param {number} v */
const hx = v => Math.round(v).toString(16).padStart(2, '0');

/**
 * The exact color at each point, with its alpha (0 is fully see-through,
 * 1 fully opaque). A point outside the picture has no color.
 * @param {Picture} pic
 * @param {Array<{x: number, y: number}>} points
 * @returns {Array<{at: string, color: string | null, alpha: number | null}>}
 */
export function colorsAt(pic, points) {
  return points.map(({x, y}) => {
    if (x < 0 || y < 0 || x >= pic.width || y >= pic.height)
      return {at: `${x},${y}`, color: null, alpha: null};
    const i = (y * pic.width + x) * 4;
    return {
      at: `${x},${y}`,
      color: `#${hx(pic.rgba[i])}${hx(pic.rgba[i + 1])}${hx(pic.rgba[i + 2])}`,
      alpha: Number((pic.rgba[i + 3] / 255).toFixed(2)),
    };
  });
}

/**
 * The main colors of a picture: every pixel (on a grid past 4 million)
 * bucketed to 5 bits per channel, biggest share first, each with where it sits. A fully
 * see-through pixel shows no color, so it is skipped; a partly see-through
 * one counts as it looks over white.
 * @param {Picture} pic
 * @param {number} count
 * @returns {Array<{color: string, share: number, where: string}>}
 */
export function mainColors(pic, count) {
  /** @type {Map<number, {n: number, r: number, g: number, b: number, x: number, y: number}>} */
  const buckets = new Map();
  // Every pixel up to a budget, so a 1-pixel line is never skipped; a
  // bigger picture is read on an even grid.
  const step = Math.max(
    1,
    Math.ceil(Math.sqrt((pic.width * pic.height) / SAMPLE_BUDGET)),
  );
  for (let y = 0; y < pic.height; y += step) {
    for (let x = 0; x < pic.width; x += step) {
      const i = (y * pic.width + x) * 4;
      const a = pic.rgba[i + 3] / 255;
      if (a === 0) continue;
      const over = (/** @type {number} */ c) =>
        Math.round(c * a + 255 * (1 - a));
      const r = over(pic.rgba[i]);
      const g = over(pic.rgba[i + 1]);
      const b = over(pic.rgba[i + 2]);
      const k = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
      let e = buckets.get(k);
      if (!e) {
        e = {n: 0, r: 0, g: 0, b: 0, x: 0, y: 0};
        buckets.set(k, e);
      }
      e.n++;
      e.r += r;
      e.g += g;
      e.b += b;
      e.x += x;
      e.y += y;
    }
  }
  const total = [...buckets.values()].reduce((a, e) => a + e.n, 0) || 1;
  return [...buckets.values()]
    .sort((a, b) => b.n - a.n)
    .slice(0, count)
    .map(e => {
      const cx = e.x / e.n / pic.width;
      const cy = e.y / e.n / pic.height;
      const where = `${cy < 0.15 ? 'top' : cy > 0.8 ? 'bottom' : 'middle'}${cx < 0.25 ? '-left' : cx > 0.75 ? '-right' : ''}`;
      return {
        color: `#${hx(e.r / e.n)}${hx(e.g / e.n)}${hx(e.b / e.n)}`,
        share: Number(((100 * e.n) / total).toFixed(1)),
        where,
      };
    });
}

// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Read a PNG in plain Node: decompress with zlib, undo the row
 * filters, and give RGBA pixels. Then the main colors of a picture, or the
 * exact color at given points.
 * @position api/theme-edit — pure helpers for `experimental theme editor how <picture.png>`
 */

import * as zlib from 'node:zlib';

const SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

/** @typedef {{width: number, height: number, rgba: Uint8Array}} Picture */

/**
 * Decode a PNG file's bytes. Interlaced pictures are refused.
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
  /** @type {Buffer | null} */
  let palette = null;
  /** @type {Buffer | null} */
  let alpha = null;
  /** @type {Buffer[]} */
  const data = [];
  while (pos + 8 <= bytes.length) {
    const length = bytes.readUInt32BE(pos);
    const type = bytes.toString('latin1', pos + 4, pos + 8);
    const body = bytes.subarray(pos + 8, pos + 8 + length);
    pos += 12 + length;
    if (type === 'IHDR') {
      width = body.readUInt32BE(0);
      height = body.readUInt32BE(4);
      depth = body[8];
      colorType = body[9];
      interlace = body[12];
    } else if (type === 'PLTE') palette = body;
    else if (type === 'tRNS') alpha = body;
    else if (type === 'IDAT') data.push(body);
    else if (type === 'IEND') break;
  }
  if (!width || !height) throw new Error('the PNG has no header');
  if (interlace) throw new Error('interlaced PNG files are not supported');
  const channels = {0: 1, 2: 3, 3: 1, 4: 2, 6: 4}[colorType];
  if (!channels || ![1, 2, 4, 8, 16].includes(depth))
    throw new Error('unsupported PNG color format');
  const raw = zlib.inflateSync(Buffer.concat(data));
  const bitsPerPixel = channels * depth;
  const stride = Math.ceil((width * bitsPerPixel) / 8);
  const bpp = Math.max(1, bitsPerPixel >> 3);
  const rows = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
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
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4;
      const s = x * channels;
      if (colorType === 3) {
        const idx = sample(y, s);
        rgba[o] = palette?.[idx * 3] ?? 0;
        rgba[o + 1] = palette?.[idx * 3 + 1] ?? 0;
        rgba[o + 2] = palette?.[idx * 3 + 2] ?? 0;
        rgba[o + 3] = alpha && idx < alpha.length ? alpha[idx] : 255;
      } else if (colorType === 0 || colorType === 4) {
        const g = sample(y, s);
        rgba[o] = rgba[o + 1] = rgba[o + 2] = g;
        rgba[o + 3] = colorType === 4 ? sample(y, s + 1) : 255;
      } else {
        rgba[o] = sample(y, s);
        rgba[o + 1] = sample(y, s + 1);
        rgba[o + 2] = sample(y, s + 2);
        rgba[o + 3] = colorType === 6 ? sample(y, s + 3) : 255;
      }
    }
  }
  return {width, height, rgba};
}

/** @param {number} v */
const hx = v => Math.round(v).toString(16).padStart(2, '0');

/**
 * The exact color at each point.
 * @param {Picture} pic
 * @param {Array<{x: number, y: number}>} points
 * @returns {Array<{at: string, color: string | null}>}
 */
export function colorsAt(pic, points) {
  return points.map(({x, y}) => {
    if (x < 0 || y < 0 || x >= pic.width || y >= pic.height)
      return {at: `${x},${y}`, color: null};
    const i = (y * pic.width + x) * 4;
    return {
      at: `${x},${y}`,
      color: `#${hx(pic.rgba[i])}${hx(pic.rgba[i + 1])}${hx(pic.rgba[i + 2])}`,
    };
  });
}

/**
 * The main colors of a picture: every second pixel bucketed to 5 bits per
 * channel, biggest share first, each with where it sits.
 * @param {Picture} pic
 * @param {number} count
 * @returns {Array<{color: string, share: number, where: string}>}
 */
export function mainColors(pic, count) {
  /** @type {Map<number, {n: number, r: number, g: number, b: number, x: number, y: number}>} */
  const buckets = new Map();
  for (let y = 0; y < pic.height; y += 2) {
    for (let x = 0; x < pic.width; x += 2) {
      const i = (y * pic.width + x) * 4;
      const r = pic.rgba[i];
      const g = pic.rgba[i + 1];
      const b = pic.rgba[i + 2];
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

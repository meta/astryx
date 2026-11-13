// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file blog-images.mjs
 * Build-time facts about blog body images that the docsite needs without a
 * runtime probe: which images have a dark counterpart, and the natural size of
 * every image whose file name ends in `@2x` (before the extension and the
 * optional `.dark` marker), so a Retina screenshot renders at half its pixel
 * width — the size the component really is on screen.
 *
 * @input  A `public/blog` directory tree.
 * @output `{darkImages, imageSizes}` with site-absolute paths.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

/** `name@2x.png`, `name@2x.dark.png`, `name@2x.webp`: the stem ends in `@2x`. */
export const RETINA_IMAGE_RE = /@2x(\.dark)?\.[a-zA-Z0-9]+$/;

/**
 * Read a PNG's IHDR dimensions.
 * @param {Buffer} bytes
 * @returns {{width: number, height: number} | null}
 */
function pngSize(bytes) {
  if (
    bytes.length < 24 ||
    bytes.toString('latin1', 1, 4) !== 'PNG' ||
    bytes.toString('latin1', 12, 16) !== 'IHDR'
  ) {
    return null;
  }
  return {width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20)};
}

/**
 * Read a JPEG's SOF dimensions.
 * @param {Buffer} bytes
 * @returns {{width: number, height: number} | null}
 */
function jpegSize(bytes) {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) return null;
    const marker = bytes[offset + 1];
    const length = bytes.readUInt16BE(offset + 2);
    // SOF0..SOF15 except DHT (C4), JPG (C8) and DAC (CC) carry the frame size.
    if (
      marker >= 0xc0 &&
      marker <= 0xcf &&
      marker !== 0xc4 &&
      marker !== 0xc8 &&
      marker !== 0xcc
    ) {
      return {
        height: bytes.readUInt16BE(offset + 5),
        width: bytes.readUInt16BE(offset + 7),
      };
    }
    offset += 2 + length;
  }
  return null;
}

/**
 * Read a WebP's canvas size (VP8X extended header, VP8 lossy, or VP8L lossless).
 * @param {Buffer} bytes
 * @returns {{width: number, height: number} | null}
 */
function webpSize(bytes) {
  if (
    bytes.length < 30 ||
    bytes.toString('latin1', 0, 4) !== 'RIFF' ||
    bytes.toString('latin1', 8, 12) !== 'WEBP'
  ) {
    return null;
  }
  const chunk = bytes.toString('latin1', 12, 16);
  if (chunk === 'VP8X') {
    return {
      width: 1 + bytes.readUIntLE(24, 3),
      height: 1 + bytes.readUIntLE(27, 3),
    };
  }
  if (chunk === 'VP8 ') {
    return {
      width: bytes.readUInt16LE(26) & 0x3fff,
      height: bytes.readUInt16LE(28) & 0x3fff,
    };
  }
  if (chunk === 'VP8L') {
    const bits = bytes.readUInt32LE(21);
    return {width: 1 + (bits & 0x3fff), height: 1 + ((bits >> 14) & 0x3fff)};
  }
  return null;
}

/**
 * The natural pixel size of a PNG, JPEG, or WebP, or null for anything else.
 * @param {Buffer} bytes
 * @returns {{width: number, height: number} | null}
 */
export function imageSize(bytes) {
  return pngSize(bytes) ?? jpegSize(bytes) ?? webpSize(bytes);
}

/**
 * Walk `publicDir/blog` and collect the dark variants and the `@2x` sizes.
 * @param {string} publicDir The docsite's `public` directory.
 * @returns {{darkImages: string[], imageSizes: Record<string, {width: number, height: number}>}}
 */
export function collectBlogImages(publicDir) {
  const blogDir = path.join(publicDir, 'blog');
  /** @type {string[]} */
  const darkImages = [];
  /** @type {Record<string, {width: number, height: number}>} */
  const imageSizes = {};
  const siteUrl = (/** @type {string} */ full) =>
    '/' + path.relative(publicDir, full).split(path.sep).join('/');
  const walk = (/** @type {string} */ dir) => {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (/\.dark\.[a-zA-Z0-9]+$/.test(entry.name)) {
        darkImages.push(siteUrl(full));
      }
      if (RETINA_IMAGE_RE.test(entry.name)) {
        const size = imageSize(fs.readFileSync(full));
        if (size) imageSizes[siteUrl(full)] = size;
      }
    }
  };
  walk(blogDir);
  darkImages.sort();
  return {
    darkImages,
    imageSizes: Object.fromEntries(
      Object.entries(imageSizes).sort(([a], [b]) => a.localeCompare(b)),
    ),
  };
}

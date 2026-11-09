// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Local files as data: URIs for `astryx experimental render`, so the
 * rendered page needs nothing beside it.
 *
 * @position foundation/render — used by page-worker.mjs and render-page.mjs
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

/** The largest single file inlined into a rendered page. */
export const MAX_ASSET_BYTES = 8 * 1024 * 1024;

/** @type {Record<string, string>} */
const MIME = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  avif: 'image/avif',
  svg: 'image/svg+xml',
  ico: 'image/x-icon',
  bmp: 'image/bmp',
  woff: 'font/woff',
  woff2: 'font/woff2',
  ttf: 'font/ttf',
  otf: 'font/otf',
  mp4: 'video/mp4',
  webm: 'video/webm',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
};

/** @param {string} file */
export const isAssetPath = file =>
  Object.hasOwn(MIME, path.extname(file).slice(1).toLowerCase());

/** An error carrying a render error code. */
export class RenderAssetError extends Error {
  /**
   * @param {string} code
   * @param {string} message
   * @param {Record<string, unknown>} [detail]
   */
  constructor(code, message, detail) {
    super(message);
    this.code = code;
    this.detail = detail;
  }
}

/**
 * Read a local file as a data: URI.
 * @param {string} file absolute path
 * @returns {string}
 */
export function assetDataUri(file) {
  /** @type {fs.Stats} */
  let stat;
  try {
    stat = fs.statSync(file);
  } catch {
    throw new RenderAssetError(
      'ERR_FILE_NOT_FOUND',
      `The page uses ${file}, which does not exist`,
      {module: file},
    );
  }
  if (stat.size > MAX_ASSET_BYTES) {
    throw new RenderAssetError(
      'ERR_RENDER_ASSET_TOO_LARGE',
      `${path.basename(file)} is ${(stat.size / 1048576).toFixed(1)} MB; a rendered page inlines files up to ${MAX_ASSET_BYTES / 1048576} MB each. Use a smaller copy of it.`,
      {file, bytes: stat.size, limit: MAX_ASSET_BYTES},
    );
  }
  const mime = MIME[path.extname(file).slice(1).toLowerCase()] ?? 'application/octet-stream';
  return `data:${mime};base64,${fs.readFileSync(file).toString('base64')}`;
}

/**
 * Whether bytes are a known image, font or media format, whatever the file's
 * extension says (a JPEG saved as `.png` is still an inert image): their
 * leading bytes match one (an SVG is XML with an <svg> element). A carried
 * asset is carried, and written back, only when they do.
 * @param {Buffer} bytes
 */
export function isAssetBytes(bytes) {
  const at = (/** @type {number} */ i, /** @type {string} */ text) =>
    bytes.subarray(i, i + text.length).toString('latin1') === text;
  const b = (/** @type {number[]} */ ...xs) => xs.every((x, i) => bytes[i] === x);
  if (at(0, '\x89PNG\r\n\x1a\n') || b(0xff, 0xd8, 0xff) || at(0, 'GIF87a') || at(0, 'GIF89a')) return true;
  if (at(0, 'RIFF') && (at(8, 'WEBP') || at(8, 'WAVE'))) return true;
  if (at(4, 'ftyp')) return true; // AVIF, MP4
  if (at(0, 'BM') || b(0, 0, 1, 0)) return true; // BMP, ICO
  if (at(0, 'wOFF') || at(0, 'wOF2') || at(0, 'OTTO') || at(0, 'true') || b(0, 1, 0, 0)) return true;
  if (b(0x1a, 0x45, 0xdf, 0xa3) || at(0, 'ID3') || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0)) return true;
  const head = bytes.subarray(0, 4096).toString('utf8').replace(/^\uFEFF/, '').trimStart();
  return head.startsWith('<') && /<svg[\s>]/i.test(head);
}

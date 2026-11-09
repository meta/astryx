// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The page source a rendered file carries, so `astryx experimental
 * render --reverse` can give it back byte for byte. It is one
 * `<script type="application/x-astryx-source">` data block: browsers never run
 * it, and its JSON holds each file base64-encoded with its SHA-256, so no text
 * in the source (`</script>` included) can end the block early.
 *
 * @position foundation/render — used by render-page.mjs and the render subject
 */

import {createHash} from 'node:crypto';

/** The script type of the embedded-source block. */
export const SOURCE_TYPE = 'application/x-astryx-source';

/**
 * @typedef {object} EmbeddedFile
 * @property {string} path - Path relative to the folder that holds every embedded file, `/`-separated; the page itself first.
 * @property {string} sha256 - SHA-256 of the file's bytes, hex.
 * @property {string} base64 - The file's bytes.
 */

/**
 * @typedef {object} EmbeddedSource
 * @property {1} version
 * @property {string} entry - The page's file name.
 * @property {EmbeddedFile[]} files
 */

/** @param {Buffer} bytes */
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

/**
 * The data block for a page's files.
 * @param {string} entry the page's file name
 * @param {{path: string, bytes: Buffer}[]} files the page first
 * @returns {string}
 */
export function sourceBlock(entry, files) {
  /** @type {EmbeddedSource} */
  const payload = {
    version: 1,
    entry,
    files: files.map(f => ({
      path: f.path,
      sha256: sha256(f.bytes),
      base64: f.bytes.toString('base64'),
    })),
  };
  const json = JSON.stringify(payload)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026');
  return `<script type="${SOURCE_TYPE}">${json}</script>`;
}

/**
 * Read the embedded source from a rendered file.
 * @param {string} html
 * @returns {{found: false} | {found: true, source: EmbeddedSource} | {found: true, damaged: string}}
 */
export function readSourceBlock(html) {
  const all = [
    ...html.matchAll(
      new RegExp(
        `<script\\s+type=["']${SOURCE_TYPE.replace(/[/+.-]/g, c => `\\${c}`)}["'][^>]*>([\\s\\S]*?)</script>`,
        'gi',
      ),
    ),
  ];
  // The block is written last in the body; a page's own markup cannot end
  // it, so the last one is the CLI's.
  const m = all.at(-1);
  if (!m) return {found: false};
  /** @type {any} */
  let payload;
  try {
    payload = JSON.parse(m[1]);
  } catch {
    return {found: true, damaged: 'its embedded source is not valid JSON'};
  }
  if (
    payload?.version !== 1 ||
    typeof payload.entry !== 'string' ||
    !Array.isArray(payload.files) ||
    payload.files.length === 0
  ) {
    return {found: true, damaged: 'its embedded source has an unknown shape'};
  }
  for (const f of payload.files) {
    if (
      typeof f?.path !== 'string' ||
      typeof f.base64 !== 'string' ||
      typeof f.sha256 !== 'string' ||
      sha256(Buffer.from(f.base64, 'base64')) !== f.sha256
    ) {
      return {
        found: true,
        damaged: `its embedded copy of ${String(f?.path ?? 'a file')} does not match its checksum`,
      };
    }
  }
  return {found: true, source: payload};
}

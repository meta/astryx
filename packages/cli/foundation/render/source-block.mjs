// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The page source a rendered file carries, so `astryx experimental
 * render --reverse` can give it back byte for byte. It is one
 * `<script type="application/x-astryx-source">` data block: browsers never run
 * it, and its JSON holds each file base64-encoded with its SHA-256, so no text
 * in the source (`</script>` included) can end the block early.
 *
 * The block's `version` is the render format. A CLI reads every format up to
 * its own. The number goes up only when a CLI that reads the current number
 * would read a new file wrong; a new optional field keeps the number, so older
 * CLIs keep reading newer files. A CLI that meets a higher number refuses and
 * names the CLI version that wrote the file.
 *
 * @position foundation/render — used by render-page.mjs and the render subject
 */

import {createHash} from 'node:crypto';
import {isValidSemver} from '../env/semver.mjs';
import {scanHtml} from './html-reader.mjs';

/** The script type of the embedded-source block. */
export const SOURCE_TYPE = 'application/x-astryx-source';

/** The render format this CLI writes, and the newest one it reads. */
export const RENDER_FORMAT = 1;

/**
 * @typedef {object} EmbeddedFile
 * @property {string} path - Path relative to the folder that holds every embedded file, `/`-separated; the page itself first.
 * @property {string} sha256 - SHA-256 of the file's bytes, hex.
 * @property {string} base64 - The file's bytes.
 */

/**
 * What the render records about itself beside the files. Every field is
 * optional: files from older CLIs have none of them.
 * @typedef {object} RenderRecord
 * @property {string} [cli] - The version of the CLI that rendered the file.
 * @property {string} [page] - The page's path from its project's root, `/`-separated.
 * @property {string} [title] - The title given with --title, which a render again needs too.
 * @property {Record<string, string>} [packages] - The packages the page rendered with, by name: their versions.
 * @property {{sha256: string, style?: string, text?: string}} [markup] - The page as rendered, so a reverse can tell what changed after the render: the SHA-256 of the markup in <body> and of the <style> element, and `text`, the base64 of the JSON `{title, runs}` (the title and the markup's runs of text in order). The text stays encoded so that a find-and-replace over the page's text cannot change the record too.
 */

/**
 * @typedef {RenderRecord & {version: number, entry: string, files: EmbeddedFile[]}} EmbeddedSource
 */

/** @param {Buffer | string} bytes */
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

/**
 * The data block for a page's files.
 * @param {string} entry the page's file name
 * @param {{path: string, bytes: Buffer}[]} files the page first
 * @param {RenderRecord} [record] what the render records about itself
 * @returns {string}
 */
export function sourceBlock(entry, files, record = {}) {
  /** @type {EmbeddedSource} */
  const payload = {
    version: RENDER_FORMAT,
    entry,
    ...(record.cli ? {cli: record.cli} : {}),
    ...(record.page ? {page: record.page} : {}),
    ...(record.title === undefined ? {} : {title: record.title}),
    ...(record.packages ? {packages: record.packages} : {}),
    files: files.map(f => ({
      path: f.path,
      sha256: sha256(f.bytes),
      base64: f.bytes.toString('base64'),
    })),
    ...(record.markup ? {markup: record.markup} : {}),
  };
  const json = JSON.stringify(payload)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026');
  return `<script type="${SOURCE_TYPE}">${json}</script>`;
}

/**
 * The parts of a rendered file a reverse reads, found as a browser finds them:
 * outside comments (the note is one, and it may quote a path that looks like
 * a tag) and outside the text of a style, script, title or textarea element
 * (a stylesheet may hold any text).
 * @param {string} html
 * @returns {{title: string | null, style: string | null, body: number}} the
 *   text of the first title and the first style element before <body>, and
 *   where the content of <body> starts (-1 without a <body> tag)
 */
function pageParts(html) {
  /** @type {string | null} */
  let title = null;
  /** @type {string | null} */
  let style = null;
  let styleStart = -1;
  let titleNext = false;
  for (const token of scanHtml(html)) {
    if (token.kind === 'start') {
      if (token.tag === 'body') return {title, style, body: token.end};
      titleNext = token.tag === 'title' && title === null;
      if (token.tag === 'style' && styleStart < 0) styleStart = token.start;
    } else if (token.kind === 'raw' && titleNext) {
      title = html.slice(token.start, token.end);
      titleNext = false;
    } else if (token.kind === 'end' && token.tag === 'style' && styleStart >= 0 && style === null) {
      style = html.slice(styleStart, token.end);
    }
  }
  return {title, style, body: -1};
}

/**
 * Every embedded-source block in a file's body, in order, with its index in
 * the whole file. The note in <head> may quote a title or a path with any
 * text, so the search starts at <body>.
 * @param {string} html
 */
const blocksIn = html => {
  const start = Math.max(0, pageParts(html).body);
  return [
    ...html.slice(start).matchAll(
      new RegExp(
        `<script\\s+type=["']${SOURCE_TYPE.replace(/[/+.-]/g, c => `\\${c}`)}["'][^>]*>([\\s\\S]*?)</script>`,
        'gi',
      ),
    ),
  ].map(m => Object.assign(m, {index: (m.index ?? 0) + start}));
};

/**
 * Read the embedded source from a rendered file.
 * @param {string} html
 * @returns {{found: false} | {found: true, source: EmbeddedSource} | {found: true, damaged: string} | {found: true, newer: {format: number, cli: string | null}}}
 */
export function readSourceBlock(html) {
  // The block is written last in the body; a page's own markup cannot end
  // it, so the last one is the CLI's.
  const m = blocksIn(html).at(-1);
  if (!m) {
    // An opening tag with no block after it: the file ends inside the block.
    return html.slice(Math.max(0, pageParts(html).body)).includes(`<script type="${SOURCE_TYPE}">`)
      ? {found: true, damaged: 'its embedded source is cut short: the file ends inside it'}
      : {found: false};
  }
  /** @type {any} */
  let payload;
  try {
    payload = JSON.parse(m[1]);
  } catch {
    return {found: true, damaged: 'its embedded source is not valid JSON'};
  }
  // A CLI version that is not a semantic version is never a render's: the
  // file was changed, and the value would reach a printed command.
  if (payload?.cli !== undefined && !isValidSemver(payload.cli)) {
    return {found: true, damaged: 'its embedded source names a CLI version that is not a release version'};
  }
  if (Number.isInteger(payload?.version) && payload.version > RENDER_FORMAT) {
    return {found: true, newer: {format: payload.version, cli: isValidSemver(payload.cli) ? payload.cli : null}};
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

/**
 * The markup between `<body>` and the embedded source: what a render wrote
 * there, unless someone changed it since. Null when the file no longer has
 * that shape.
 * @param {string} html
 * @returns {string | null}
 */
export function renderedMarkupOf(html) {
  const block = blocksIn(html).at(-1);
  if (!block || block.index === undefined) return null;
  const start = pageParts(html).body;
  return start < 0 || start > block.index ? null : html.slice(start, block.index);
}

/**
 * The title and the <style> element a render wrote in <head>, unless someone
 * changed them since.
 * @param {string} html
 * @returns {{title: string | null, style: string | null}}
 */
export function renderedHeadOf(html) {
  const {title, style} = pageParts(html);
  return {title, style};
}

/**
 * The title and the runs of text a record keeps, or null when the record
 * keeps none or they do not decode.
 * @param {{text?: unknown}} markup
 * @returns {{title: string | null, runs: string[]} | null}
 */
export function recordedText(markup) {
  if (typeof markup.text !== 'string') return null;
  try {
    const parsed = JSON.parse(Buffer.from(markup.text, 'base64').toString('utf8'));
    return {
      title: typeof parsed?.title === 'string' ? parsed.title : null,
      runs: Array.isArray(parsed?.runs) ? parsed.runs.filter((/** @type {unknown} */ r) => typeof r === 'string') : [],
    };
  } catch {
    return null;
  }
}

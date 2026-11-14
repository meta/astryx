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
import {decode, readTag, scanHtml} from './html-reader.mjs';

/** The script type of the embedded-source block. */
export const SOURCE_TYPE = 'application/x-astryx-source';

/** The newest render format this CLI reads, and the newest it writes. */
export const RENDER_FORMAT = 2;

/**
 * What a format 1 reader refuses besides the page, as a kind no render
 * embeds, and format 2 carries: an `.mts`, `.cts` or `.cjs` module; JSON
 * whose name holds `config`, ends in `rc` or `lock`, or names a manifest;
 * and a module named `config.*` or with a stem that ends in `rc`. A file
 * that carries one says format 2, so a CLI that reads render formats names
 * the CLI that reads it instead of calling the file damaged; every other
 * file says format 1, which every CLI that reads render files opens. The
 * rules stay as format 1 readers have them: a kind a later CLI adds needs a
 * format of its own.
 */
const FORMAT_1_REFUSED_MODULE = /\.(?:mts|cts|cjs)$/i;
const FORMAT_1_CONFIG_JSON =
  /^(package|package-lock|composer|deno|turbo|vercel|nx|lerna|app|bower|now|netlify|firebase|renovate|project|workspace|angular|biome|components)\.jsonc?$|config|(^|[._-])rc\.jsonc?$|(^|[._-])lock\.jsonc?$/i;
const FORMAT_1_CONFIG_MODULE = /(^|\.)config\.[cm]?[jt]sx?$|^[a-z0-9-]+rc\.[cm]?[jt]s$/i;

/**
 * Whether a format 1 reader refuses a carried file other than the page.
 * @param {string} p its path in the file, `/`-separated
 */
function format1Refuses(p) {
  const name = p.slice(p.lastIndexOf('/') + 1);
  return (
    FORMAT_1_REFUSED_MODULE.test(name) ||
    (/\.jsonc?$/i.test(name) && FORMAT_1_CONFIG_JSON.test(name)) ||
    FORMAT_1_CONFIG_MODULE.test(name)
  );
}

/**
 * The render format a file that carries these files says, the page first.
 * @param {{path: string}[]} files
 * @returns {number}
 */
export function formatFor(files) {
  return files.slice(1).some(f => format1Refuses(f.path)) ? 2 : 1;
}

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
 * @property {string} [page] - The page's path from its project's root, `/`-separated; outside a project, its path among the files it carries.
 * @property {string} [title] - The title given with --title, which a render again needs too.
 * @property {Record<string, string>} [packages] - The packages the page rendered with, by name: their versions.
 * @property {Record<string, string>} [aliases] - Each path-alias import a carried module makes that cannot be a package name (`@/…`, `~/…`), as written (without a query), with the embedded path of the carried file it names, so a reverse where no alias names it still finds the file.
 * @property {{sha256: string, style?: string, text?: string}} [markup] - The page as rendered, so a reverse can tell what changed after the render: the SHA-256 of the markup in <body> and of the <style> element, and `text`, the base64 of the JSON `{title, runs}` (the title and the markup's runs of text in order). The text stays encoded so that a find-and-replace over the page's text cannot change the record too.
 */

/**
 * @typedef {RenderRecord & {version: number, entry: string, files: EmbeddedFile[]}} EmbeddedSource
 */

/** @param {Buffer | string} bytes */
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

/**
 * Text as a browser's HTML parser reads it: a CR LF pair or a lone CR is a
 * line feed. A copy whose line ends a mailer, an editor or git changed reads
 * the same.
 * @param {string} text
 */
export const asParsed = text => text.replace(/\r\n?/g, '\n');

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
    version: formatFor(files),
    entry,
    ...(record.cli ? {cli: record.cli} : {}),
    ...(record.page ? {page: record.page} : {}),
    ...(record.title === undefined ? {} : {title: record.title}),
    ...(record.packages ? {packages: record.packages} : {}),
    ...(record.aliases ? {aliases: record.aliases} : {}),
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
 * Whether a script tag's attributes give it the source type. A MIME type is
 * matched without regard to letter case.
 * @param {Array<[string, string]>} attrs
 */
const isSourceType = attrs => {
  const type = attrs.find(([name]) => name === 'type')?.[1];
  return type !== undefined && decode(type).trim().toLowerCase() === SOURCE_TYPE;
};

/**
 * Every embedded-source block in a file's body, in order: each script
 * element whose type is the source type, its tag read as a browser reads a
 * tag, with its attributes in any order, quoted or not, in any letter case
 * (a minifier rewrites it so). Every `<script` from the start of the body on
 * is read this way, inside a comment or other text too, so a hand edit that
 * leaves a comment or a textarea open before the block does not hide it. The
 * note in <head> may quote a title or a path with any text, so the search
 * starts at <body>.
 * @param {string} html
 * @returns {{index: number, json: string, closed: boolean}[]} where each
 *   opening tag starts, the text of the block, and whether its end tag is
 *   there (a file cut inside the block has none)
 */
const blocksIn = html => {
  /** @type {{index: number, json: string, closed: boolean}[]} */
  const blocks = [];
  const opening = /<script(?=[\t\n\f\r />])/gi;
  opening.lastIndex = Math.max(0, pageParts(html).body);
  for (let m = opening.exec(html); m; m = opening.exec(html)) {
    const tag = readTag(html, m.index + 1);
    if (typeof tag !== 'object' || !isSourceType(tag.attrs)) continue;
    const closing = /<\/script/gi;
    closing.lastIndex = tag.end;
    const end = closing.exec(html)?.index;
    blocks.push({index: m.index, json: html.slice(tag.end, end ?? html.length), closed: end !== undefined});
    opening.lastIndex = end ?? html.length;
  }
  return blocks;
};

/**
 * Read the embedded source from a rendered file.
 * @param {string} html
 * @returns {{found: false} | {found: true, source: EmbeddedSource} | {found: true, damaged: string} | {found: true, newer: {format: number, cli: string | null}}}
 */
export function readSourceBlock(html) {
  // The block is written last in the body; a page's own markup cannot end
  // it, so the last one is the CLI's.
  const block = blocksIn(html).at(-1);
  if (!block) return {found: false};
  if (!block.closed) return {found: true, damaged: 'its embedded source is cut short: the file ends inside it'};
  /** @type {any} */
  let payload;
  try {
    payload = JSON.parse(block.json);
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
    !(Number.isInteger(payload?.version) && payload.version >= 1) ||
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
  if (!block) return null;
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

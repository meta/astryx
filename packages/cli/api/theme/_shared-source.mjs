// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Reads a theme someone shared — a folder, a `.tgz` archive, or an
 * https URL to a `.tgz` — into a staging folder, and finds the one theme
 * folder in it (the folder that holds a typed theme descriptor).
 * @input the argument `theme add` was given, and the folder it runs in
 * @output a staging folder holding the theme under its slug, its label for
 *   messages, and a cleanup function
 * @position the theme adapter's helper (imported only by _adapter.mjs), run
 *   before the theme is copied into the app's local themes root; nothing here
 *   writes into the app
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {AstryxError} from '../error.mjs';
import {assertWithin} from '../../foundation/fs/path-safety.mjs';
import {ERROR_CODES} from '../../foundation/response/error-codes.mjs';
import {
  THEME_DOC_SUFFIX,
  THEME_SLUG_RE,
} from '../../foundation/discovery/theme-discovery.mjs';

/** The largest archive read, packed or unpacked. */
const MAX_ARCHIVE_BYTES = 50 * 1024 * 1024;

/** How long a download may take. */
const DOWNLOAD_MS = 60_000;

/** How deep the theme folder may sit in what was shared. */
const MAX_DEPTH = 4;

/**
 * Whether `theme add` was given a shared theme rather than a slug: a URL, an
 * archive, or a path (it has a folder separator or starts with a dot). A bare
 * word is always a slug, as released `theme add` reads it.
 * @param {string} arg
 */
export function isSharedThemeSource(arg) {
  return (
    /^https?:\/\//i.test(arg) ||
    /\.(?:tgz|tar\.gz)$/i.test(arg) ||
    /[\\/]/.test(arg) ||
    arg === '.' ||
    arg.startsWith('.')
  );
}

/**
 * Read a shared theme into a staging folder.
 * @param {string} arg a folder, a `.tgz`, or an https URL to a `.tgz`
 * @param {string} cwd
 * @returns {Promise<{root: string, folder: string, slug: string, cleanup: () => void}>}
 *   `root` is the staging folder, holding the theme in `root/<slug>`;
 *   `folder` is where the theme sat in what was shared, for messages
 */
export async function stageSharedTheme(arg, cwd) {
  const stage = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-theme-add-'));
  const cleanup = () => fs.rmSync(stage, {recursive: true, force: true});
  try {
    /** @type {string} */
    let from;
    if (/^https?:\/\//i.test(arg)) {
      from = path.join(stage, 'download');
      extractTgz(await download(arg), from, arg);
    } else {
      const local = path.resolve(cwd, arg);
      if (!fs.existsSync(local)) {
        throw refusal(
          `${arg} does not exist. Give a theme folder, a .tgz archive of one, or an https URL to a .tgz.`,
          ERROR_CODES.ERR_NO_SOURCE,
        );
      }
      if (fs.statSync(local).isDirectory()) from = local;
      else {
        from = path.join(stage, 'archive');
        extractTgz(readCapped(local, arg), from, arg);
      }
    }
    const found = themeFolders(from);
    if (found.length === 0) {
      throw refusal(
        `${arg} holds no theme: no folder in it has a theme descriptor (a <name>Theme${THEME_DOC_SUFFIX} file whose default export has type 'theme'), so there is nothing to add.`,
        ERROR_CODES.ERR_NO_SOURCE,
      );
    }
    if (found.length > 1) {
      throw refusal(
        `${arg} holds ${found.length} themes (${found.map(f => shown(f.dir, from)).join(', ')}). Add one at a time: give the path of the theme's own folder.`,
        ERROR_CODES.ERR_THEME_INVALID,
      );
    }
    const [{dir, slug}] = found;
    copyTree(dir, path.join(stage, 'theme', slug));
    return {
      root: path.join(stage, 'theme'),
      folder: shown(dir, from),
      slug,
      cleanup,
    };
  } catch (error) {
    cleanup();
    throw error;
  }
}

/** @param {string} dir @param {string} from */
function shown(dir, from) {
  return path.relative(from, dir).split(path.sep).join('/') || '.';
}

/**
 * @param {string} message
 * @param {string} code
 */
function refusal(message, code) {
  return new AstryxError(message, undefined, code);
}

/** How many redirects a download follows. */
const MAX_REDIRECTS = 5;

/** @param {string} url */
function isHttps(url) {
  return /^https:\/\//i.test(url);
}

/**
 * The bytes at an https URL, which must be a gzip archive. Redirects are
 * followed here, one hop at a time, so every hop is checked to be https
 * before it is requested; the body is read up to the size cap.
 * @param {string} url
 * @returns {Promise<Buffer>}
 */
async function download(url) {
  if (!isHttps(url)) {
    throw refusal(
      `${url} is not an https URL. Download the archive and give its path, or use an https URL.`,
      ERROR_CODES.ERR_INVALID_ARGUMENT,
    );
  }
  const signal = globalThis.AbortSignal.timeout(DOWNLOAD_MS);
  let at = url;
  /** @type {Response | undefined} */
  let response;
  for (let hop = 0; ; hop++) {
    try {
      response = await fetch(at, {signal, redirect: 'manual'});
    } catch (error) {
      throw refusal(
        `Could not download ${url}: ${error instanceof Error ? error.message : String(error)}.`,
        ERROR_CODES.ERR_NO_SOURCE,
      );
    }
    const location = response.headers.get('location');
    if (response.status < 300 || response.status >= 400 || location == null)
      break;
    const next = new URL(location, at).href;
    // A hop over plain http would bring the archive, or where it points,
    // unencrypted.
    if (!isHttps(next)) {
      throw refusal(
        `${url} redirects to ${next}, which is not https; the archive is not downloaded.`,
        ERROR_CODES.ERR_INVALID_ARGUMENT,
      );
    }
    if (hop >= MAX_REDIRECTS) {
      throw refusal(
        `${url} redirects more than ${MAX_REDIRECTS} times; the archive is not downloaded.`,
        ERROR_CODES.ERR_NO_SOURCE,
      );
    }
    at = next;
  }
  if (!response.ok) {
    throw refusal(
      `Could not download ${url}: the server answered ${response.status}.`,
      ERROR_CODES.ERR_NO_SOURCE,
    );
  }
  const tooLarge = () =>
    refusal(
      `${url} is larger than ${MAX_ARCHIVE_BYTES / 1048576} MB, more than a theme holds.`,
      ERROR_CODES.ERR_THEME_INVALID,
    );
  if (Number(response.headers.get('content-length') ?? 0) > MAX_ARCHIVE_BYTES)
    throw tooLarge();
  /** @type {Buffer[]} */
  const chunks = [];
  let size = 0;
  if (response.body) {
    for await (const chunk of response.body) {
      size += chunk.length;
      if (size > MAX_ARCHIVE_BYTES) throw tooLarge();
      chunks.push(Buffer.from(chunk));
    }
  }
  return Buffer.concat(chunks);
}

/** @param {string} file @param {string} arg */
function readCapped(file, arg) {
  if (fs.statSync(file).size > MAX_ARCHIVE_BYTES) {
    throw refusal(
      `${arg} is larger than ${MAX_ARCHIVE_BYTES / 1048576} MB, more than a theme holds.`,
      ERROR_CODES.ERR_THEME_INVALID,
    );
  }
  return fs.readFileSync(file);
}

/**
 * Unpack a gzipped tar archive into `dest`. Only plain files and folders are
 * taken; an entry that would land outside `dest`, a link, or a device is
 * refused, as is an archive that is not gzip and tar.
 * @param {Buffer} packed
 * @param {string} dest
 * @param {string} arg what the archive was given as, for messages
 */
export function extractTgz(packed, dest, arg) {
  const bad = (/** @type {string} */ why) =>
    refusal(
      `${arg} is not a theme archive this can read: ${why}. Give a .tgz made with tar and gzip, or the theme's folder.`,
      ERROR_CODES.ERR_THEME_INVALID,
    );
  if (packed[0] !== 0x1f || packed[1] !== 0x8b) throw bad('it is not gzip');
  /** @type {Buffer} */
  let tar;
  try {
    // zlib loads here, when an archive is unpacked: the commands that load
    // the theme adapter and never add a theme do not load it.
    const {gunzipSync} = process.getBuiltinModule('node:zlib');
    tar = gunzipSync(packed, {maxOutputLength: MAX_ARCHIVE_BYTES});
  } catch {
    throw bad('it does not unpack');
  }
  fs.mkdirSync(dest, {recursive: true});
  const root = path.resolve(dest);
  /** @type {string | null} */
  let longName = null;
  for (let at = 0; at + 512 <= tar.length;) {
    const header = tar.subarray(at, at + 512);
    if (header.every(b => b === 0)) break;
    const field = (/** @type {number} */ from, /** @type {number} */ len) =>
      header
        .subarray(from, from + len)
        .toString('utf8')
        .replace(/\0.*$/s, '');
    const size = parseInt(field(124, 12).trim() || '0', 8);
    const type = field(156, 1) || '0';
    if (!Number.isFinite(size) || size < 0) throw bad('an entry has no size');
    const body = tar.subarray(at + 512, at + 512 + size);
    at += 512 + Math.ceil(size / 512) * 512;
    if (type === 'L' || type === 'x') {
      // A long name: GNU's own entry, or a pax header's `path`.
      const text = body.toString('utf8');
      longName =
        type === 'L'
          ? text.replace(/\0.*$/s, '')
          : (/(?:^|\n)\d+ path=([^\n]*)\n/.exec(text)?.[1] ?? null);
      continue;
    }
    if (type === 'g') continue;
    const prefix = field(345, 155);
    const name =
      longName ?? (prefix ? `${prefix}/${field(0, 100)}` : field(0, 100));
    longName = null;
    if (type !== '0' && type !== '5') {
      throw bad(`${name} is a link or a special file`);
    }
    // (A drive-letter path is absolute on Windows only; refused anywhere.)
    /** @type {string} */
    let target;
    try {
      if (/^[a-z]:/i.test(name)) throw new Error('drive');
      target = assertWithin(name, root, {label: 'archive entry'});
    } catch {
      throw bad(`${name} would land outside the archive's folder`);
    }
    if (type === '5') fs.mkdirSync(target, {recursive: true});
    else {
      fs.mkdirSync(path.dirname(target), {recursive: true});
      fs.writeFileSync(target, body);
    }
  }
}

/**
 * The folders under `from` that hold a theme descriptor, with the slug the
 * descriptor's file name gives (`oceanBlueTheme.doc.mjs` is `ocean-blue`).
 * @param {string} from
 * @returns {Array<{dir: string, slug: string}>}
 */
function themeFolders(from) {
  /** @type {Array<{dir: string, slug: string}>} */
  const out = [];
  /** @param {string} dir @param {number} depth */
  const walk = (dir, depth) => {
    /** @type {fs.Dirent[]} */
    let entries;
    try {
      entries = fs.readdirSync(dir, {withFileTypes: true});
    } catch {
      return;
    }
    const descriptor = entries.find(
      entry =>
        entry.isFile() &&
        entry.name.endsWith(`Theme${THEME_DOC_SUFFIX}`) &&
        /\btype\s*:\s*['"]theme['"]/.test(
          fs.readFileSync(path.join(dir, entry.name), 'utf8'),
        ),
    );
    if (descriptor) {
      const stem = descriptor.name.slice(0, -`Theme${THEME_DOC_SUFFIX}`.length);
      const slug = stem.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
      if (THEME_SLUG_RE.test(slug)) out.push({dir, slug});
      return;
    }
    if (depth >= MAX_DEPTH) return;
    for (const entry of entries)
      if (
        entry.isDirectory() &&
        entry.name !== 'node_modules' &&
        !entry.name.startsWith('.')
      )
        walk(path.join(dir, entry.name), depth + 1);
  };
  walk(from, 0);
  return out;
}

/**
 * Copy a theme folder's plain files and folders; links are left out.
 * @param {string} from
 * @param {string} to
 */
function copyTree(from, to) {
  fs.mkdirSync(to, {recursive: true});
  for (const entry of fs.readdirSync(from, {withFileTypes: true})) {
    const src = path.join(from, entry.name);
    const dest = path.join(to, entry.name);
    if (entry.isDirectory()) copyTree(src, dest);
    else if (entry.isFile()) fs.copyFileSync(src, dest);
  }
}

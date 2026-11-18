// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The per-user copies of the code jiti transpiles (integration
 *   manifests, config files, codemods, TypeScript doc topics, theme
 *   sources), which the CLI keeps itself through jiti's `transform` option.
 * @input The per-user cache folder (foundation/env/user-dirs.mjs), the
 *   private-folder check (foundation/env/private-dir.mjs) and the size limit
 *   the copies share with the kept catalogs (cache-eviction.mjs).
 * @output `jitiCacheOptions()`, the options of the CLI's jiti loaders, and
 *   `SUBFOLDERS`, for doctor. The folders' paths are in user-dirs.mjs.
 * @position Read by module-loader.mjs, doc-compiler/import.mjs, theme build
 *   and gather-cache.mjs. AST-081 says how copies are named and trimmed.
 */

import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import {createRequire} from 'node:module';
import * as path from 'node:path';
import {currentUid, isPrivateDir} from '../env/private-dir.mjs';
import {transpiledCacheDir} from '../env/user-dirs.mjs';
import {CACHE_LIMIT_BYTES, evictOldest} from './cache-eviction.mjs';
import {exactText} from './exact-codec.mjs';
import {withoutRecording} from './read-record.mjs';

const requireFromHere = createRequire(import.meta.url);

/** How many subfolders hold the copies. A write trims only its own. */
export const SUBFOLDERS = 256;

/** The most one subfolder holds: its share of the size limit. */
export const SUBFOLDER_LIMIT_BYTES = CACHE_LIMIT_BYTES / SUBFOLDERS;

/**
 * The format of a copy, part of every copy's name: a copy of another format
 * has another name, so it is never read.
 */
const FORMAT = 1;

/** How long a write that a stopped run left unfinished stays. */
const UNFINISHED_WRITE_MS = 10 * 60 * 1000;

/** A copy: the last 62 hex digits of its name's hash, in the subfolder of the first two. */
const COPY = /^[0-9a-f]{62}\.js$/;

/** A copy while it is written: the writing run's process id and write count. */
const UNFINISHED = /^[0-9a-f]{62}\.js\.\d+\.\d+\.tmp$/;

/** How many copies this process has written, for unfinished-write names. */
let writes = 0;

/** @type {{fsCache?: false, transform?: (opts: any) => any} | undefined} */
let options;

/**
 * The options of the CLI's jiti loaders: jiti's own disk cache off, and a
 * `transform` that keeps each copy in the per-user folder, made (0700) on
 * first use and used at once while it is a real folder the user owns and no
 * one else can reach (the kept catalogs' check). A folder that fails the
 * check, or cannot be made, keeps nothing on disk. Where the system has no
 * user ids (Windows) ownership cannot be checked, and a set JITI_FS_CACHE is
 * jiti's own setting: both leave jiti to its default. Worked out once per
 * process.
 * @returns {{fsCache?: false, transform?: (opts: any) => any}}
 */
export function jitiCacheOptions() {
  if (options) return options;
  options = {};
  if (process.env.JITI_FS_CACHE !== undefined || currentUid() == null) {
    return options;
  }
  // The cache's own upkeep, never an input of what a kept gather holds.
  options = withoutRecording(() => {
    try {
      const dir = transpiledCacheDir();
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, {recursive: true, mode: 0o700});
      }
      if (isPrivateDir(dir)) {
        return {fsCache: false, transform: keptTransform(dir)};
      }
    } catch {
      // No copies on disk: every TypeScript file is transpiled in memory.
    }
    return {fsCache: false};
  });
  return options;
}

/**
 * A jiti `transform` that keeps its copies in `dir`: a kept copy is read
 * instead of transpiling, and a new one is written. A copy that cannot be
 * read is made again. jiti runs the code under the real file's name, so
 * errors name that file, whichever folder made the copy.
 * @param {string} dir
 * @param {{limit?: number}} [settings] - the most one subfolder holds
 * @returns {(opts: any) => {code: string, error?: unknown}}
 */
export function keptTransform(dir, {limit = SUBFOLDER_LIMIT_BYTES} = {}) {
  return opts => {
    const name = copyName(opts);
    if (name == null) return jitiTransform(opts);
    const file = path.join(dir, name.slice(0, 2), `${name.slice(2)}.js`);
    const kept = withoutRecording(() => readCopy(file, name));
    if (kept != null) return {code: kept};
    const made = jitiTransform(opts);
    // A failed transpile names the file in its code, and runs again.
    if (!made.error && typeof made.code === 'string') {
      withoutRecording(() => keepCopy(file, name, made.code, limit));
    }
    return made;
  };
}

/** @type {((opts: any) => {code: string, error?: unknown}) | undefined} */
let jitiDefault;

/**
 * jiti's own transform, which a loader uses when it is given none.
 * @param {any} opts
 * @returns {{code: string, error?: unknown}}
 */
function jitiTransform(opts) {
  jitiDefault ??= requireFromHere('jiti').createJiti(import.meta.url, {
    fsCache: false,
    moduleCache: false,
  }).options.transform;
  return /** @type {NonNullable<typeof jitiDefault>} */ (jitiDefault)(opts);
}

/** @type {string | undefined} */
let jitiVersion;

/**
 * The name of a transform's copy: a hash of the source text and of every
 * setting the transform reads, or null when a setting is not plain data
 * (exact-codec.mjs), such as a Babel plugin function, and so cannot be part
 * of a name. jiti reads the file name for two things: a `.tsx` file is
 * TypeScript with JSX, and `import.meta.url`, `.dirname` and `.filename`
 * become the file's own path in the code. `import.meta` cannot be written
 * with escapes, so text without "meta" gives code that holds no path; text
 * with it names the copy for its file too.
 * @param {any} opts
 * @returns {string | null}
 */
export function copyName(opts) {
  const {filename, source, ...settings} = opts ?? {};
  if (typeof source !== 'string') return null;
  jitiVersion ??= String(requireFromHere('jiti/package.json').version);
  const file = typeof filename === 'string' ? filename : '';
  const tsx = /\.[cm]?tsx$/.test(file);
  const at = source.includes('meta') ? file : null;
  let key;
  try {
    key = exactText([FORMAT, jitiVersion, settings, tsx, at]);
  } catch {
    return null;
  }
  return crypto
    .createHash('sha256')
    .update(key)
    .update('\0')
    .update(source)
    .digest('hex');
}

/**
 * The end of every copy: its own name. A copy cut short, or any other file
 * at its name, does not end with it.
 * @param {string} name
 * @returns {string}
 */
const ending = name => `\n/* ${name} */\n`;

/**
 * The code a kept copy holds, or null when there is no whole copy.
 * @param {string} file
 * @param {string} name
 * @returns {string | null}
 */
function readCopy(file, name) {
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch {
    return null;
  }
  const end = ending(name);
  return text.endsWith(end) ? text.slice(0, -end.length) : null;
}

/**
 * Keep a copy, then trim its subfolder. It is written whole under another
 * name and renamed into place, so a reader finds the whole copy or none. A
 * copy larger than a subfolder's share is used for the run but not kept. A
 * subfolder this write makes holds only this copy, so it needs no trim.
 * @param {string} file
 * @param {string} name
 * @param {string} code
 * @param {number} limit
 */
function keepCopy(file, name, code, limit) {
  const bytes = Buffer.from(code + ending(name));
  if (bytes.length > limit) return;
  const folder = path.dirname(file);
  const unfinished = `${file}.${process.pid}.${++writes}.tmp`;
  let made = false;
  try {
    try {
      fs.writeFileSync(unfinished, bytes, {flag: 'wx', mode: 0o600});
    } catch (error) {
      if (/** @type {NodeJS.ErrnoException} */ (error).code !== 'ENOENT') {
        throw error;
      }
      made = makeFolder(folder);
      fs.writeFileSync(unfinished, bytes, {flag: 'wx', mode: 0o600});
    }
    fs.renameSync(unfinished, file);
  } catch {
    removeFile(unfinished);
    return;
  }
  if (!made) trimSubfolder(folder, file, limit);
}

/**
 * Make a subfolder of the copies; whether this call made it, and not
 * another run first.
 * @param {string} folder
 * @returns {boolean}
 */
function makeFolder(folder) {
  return fs.mkdirSync(folder, {recursive: true, mode: 0o700}) !== undefined;
}

/**
 * Keep one subfolder within `limit` bytes: the copies made longest ago go
 * first, never `kept`, the copy just written (cache-eviction.mjs). Only this
 * subfolder is read. A write left unfinished by a run that stopped goes once
 * it is old.
 * @param {string} folder
 * @param {string} kept
 * @param {number} [limit]
 */
export function trimSubfolder(folder, kept, limit = SUBFOLDER_LIMIT_BYTES) {
  try {
    evictOldest(folder, name => COPY.test(name), {limit, keep: kept});
  } catch {
    // A subfolder that cannot be read is trimmed by a later write.
  }
  removeUnfinished(folder);
}

/**
 * Remove the writes in a subfolder that runs which stopped left unfinished.
 * @param {string} folder
 */
function removeUnfinished(folder) {
  let names;
  try {
    names = fs.readdirSync(folder);
  } catch {
    return;
  }
  const now = Date.now();
  for (const name of names) {
    if (!UNFINISHED.test(name)) continue;
    const entry = path.join(folder, name);
    try {
      const stat = fs.lstatSync(entry);
      if (stat.isFile() && now - stat.mtimeMs > UNFINISHED_WRITE_MS) {
        removeFile(entry);
      }
    } catch {
      // Renamed into place, or removed by another run.
    }
  }
}

/**
 * Remove a file, if it is still there.
 * @param {string} file
 */
function removeFile(file) {
  try {
    fs.unlinkSync(file);
  } catch {
    // Another run removed it, or it was never made.
  }
}

// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A summary of a folder tree's names, kept between runs while no folder
 * in the tree and no file the summary read has changed.
 *
 * @input A root folder, the kind of summary, the modules whose code makes it,
 *   and the function that makes it from the tree's listing.
 * @output The summary: the stored one while every folder and every read file
 *   has the stamp it was stored with, else a new one, which is stored.
 * @position Used by the docs not-found hint (foundation/discovery) to check
 *   one name against Core's sources, the CLI's blocks and each integration's
 *   folders without listing every folder on each run.
 */

import {createHash} from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {fileURLToPath} from 'node:url';
import {isPrivateDir} from '../env/private-dir.mjs';
import {userCacheDir} from '../env/user-dirs.mjs';
import {fileStamp, withoutRecording} from './read-record.mjs';

/** The stored format; a different one is a miss. */
const FORMAT = 1;

/** The most summaries the folder holds; the oldest go first past it. */
const MAX_ENTRIES = 256;

/**
 * How old every stamped time must be before a summary is stored. A file
 * system can store times as coarsely as 2 s, so a change within one tick of
 * the last can leave a stamp as it was.
 */
const SETTLE_MS = 2000;

/** The module's own file: its code decides every summary's shape. */
const OWN_FILE = fileURLToPath(import.meta.url);

/**
 * One folder of the tree: its path from the root (`''` for the root) and its
 * entries, in the order the disk lists them.
 * @typedef {{rel: string, entries: Array<{name: string, isDir: boolean}>}} TreeFolder
 */

/**
 * The tree under `root`, folder by folder, outside any folder `skip` names.
 * Each folder's stamp goes into `stamps` before the folder is read, so a
 * change during the read shows as a change. A folder that cannot be read has
 * no entries.
 * @param {string} root
 * @param {(name: string) => boolean} skip
 * @param {Array<[string, string]>} stamps
 * @returns {TreeFolder[]}
 */
function walkTree(root, skip, stamps) {
  /** @type {TreeFolder[]} */
  const folders = [];
  /** @param {string} rel */
  const visit = rel => {
    const full = rel === '' ? root : path.join(root, rel);
    stamps.push([rel, fileStamp(full)]);
    /** @type {fs.Dirent[]} */
    let dirents;
    try {
      dirents = fs.readdirSync(full, {withFileTypes: true});
    } catch {
      dirents = [];
    }
    const entries = dirents.map(entry => ({
      name: entry.name,
      isDir: entry.isDirectory(),
    }));
    folders.push({rel, entries});
    for (const entry of entries) {
      if (entry.isDir && !skip(entry.name)) {
        visit(rel === '' ? entry.name : path.join(rel, entry.name));
      }
    }
  };
  visit('');
  return folders;
}

/** @type {string | null | undefined} the store folder, once per process */
let storeDirMemo;

/**
 * The folder summaries live in, or null when it cannot be used: not a real
 * folder, owned by someone else, open to others, or on a system with no user
 * ids (see isPrivateDir). It is made on first use.
 * @returns {string | null}
 */
function storeDir() {
  if (storeDirMemo === undefined) storeDirMemo = usableStoreDir();
  return storeDirMemo;
}

/** @returns {string | null} */
function usableStoreDir() {
  const dir = path.join(userCacheDir(), 'trees');
  if (isPrivateDir(dir)) return dir;
  try {
    makeFolders(dir);
  } catch {
    return null;
  }
  return isPrivateDir(dir) ? dir : null;
}

/**
 * Make `dir` and each missing folder above it, one at a time, each closed to
 * others. Node's recursive mkdir can loop without end where a parent cannot
 * be made (under /proc), so each folder is made on its own and any error
 * stops the walk.
 * @param {string} dir
 */
function makeFolders(dir) {
  const missing = [];
  let at = dir;
  while (!fs.existsSync(at)) {
    missing.push(at);
    const up = path.dirname(at);
    if (up === at) break;
    at = up;
  }
  for (const folder of missing.reverse()) fs.mkdirSync(folder, {mode: 0o700});
}

/** @type {Map<string, string>} each code file's stamp, once per process */
const codeStamps = new Map();

/**
 * Whether every stamp in `stamps` was taken longer than {@link SETTLE_MS}
 * ago, by its modification and change times.
 * @param {Array<[number, string, string]>} stamps
 * @returns {boolean}
 */
function settled(stamps) {
  const limit = Date.now() - SETTLE_MS;
  return stamps.every(([, , stamp]) => {
    if (stamp === '-') return true;
    const [, mtime, ctime] = stamp.split(':').map(Number);
    return mtime < limit && ctime < limit;
  });
}

/**
 * Delete the oldest summaries until the folder holds at most
 * {@link MAX_ENTRIES}.
 * @param {string} dir
 */
function evict(dir) {
  const names = fs.readdirSync(dir).filter(name => name.endsWith('.json'));
  if (names.length <= MAX_ENTRIES) return;
  const aged = names
    .map(name => {
      try {
        return {name, mtimeMs: fs.statSync(path.join(dir, name)).mtimeMs};
      } catch {
        return null;
      }
    })
    .filter(entry => entry != null)
    .sort((a, b) => a.mtimeMs - b.mtimeMs);
  for (const {name} of aged.slice(0, aged.length - MAX_ENTRIES)) {
    try {
      fs.unlinkSync(path.join(dir, name));
    } catch {
      // Another run removed it.
    }
  }
}

/**
 * Names as one string a lookup can search without parsing a list: each name
 * on its own line. A list when a name holds a line break.
 * @param {Iterable<string>} names
 * @returns {string | string[]}
 */
export function nameLines(names) {
  const list = [...new Set(names)];
  return list.some(name => name.includes('\n'))
    ? list
    : `\n${list.join('\n')}\n`;
}

/**
 * Whether `lines` ({@link nameLines}) holds `name`.
 * @param {string | string[]} lines
 * @param {string} name
 * @returns {boolean}
 */
export function hasNameLine(lines, name) {
  if (typeof lines !== 'string') return lines.includes(name);
  return !name.includes('\n') && lines.includes(`\n${name}\n`);
}

/**
 * One root's tree as a summary reads it: its folders, and `readText`, which
 * reads a file by its path from the root and stamps it.
 * @typedef {{root: string, folders: TreeFolder[], readText: (rel: string) => string}} Tree
 */

/**
 * The summary `summarize` makes of the trees under `roots`, or the one a run
 * stored for the same roots, kind and code while every folder it listed and
 * every file it read is unchanged. Any failure to read or store a summary is
 * silent, and the summary is made again.
 * @template T
 * @param {{kind: string, roots: string[], code: string[], skip?: (name: string) => boolean}} options
 *   `code`: the files whose code makes the summary; `skip`: folder names the
 *   walk does not enter (it is part of `kind`)
 * @param {(trees: Tree[]) => T} summarize gets one tree per root, in order
 * @returns {T}
 */
export function keptTreeSummary(
  {kind, roots, code, skip = () => false},
  summarize,
) {
  const resolved = roots.map(root => path.resolve(root));
  const codeState = [OWN_FILE, ...code].map(file => {
    let stamp = codeStamps.get(file);
    if (stamp === undefined) {
      stamp = fileStamp(file);
      codeStamps.set(file, stamp);
    }
    return [file, stamp];
  });
  const key = JSON.stringify([
    FORMAT,
    kind,
    resolved,
    process.platform,
    codeState,
  ]);
  /**
   * @param {number} at
   * @param {string} rel
   */
  const fullPath = (at, rel) =>
    rel === '' ? resolved[at] : resolved[at] + path.sep + rel;
  const dir = withoutRecording(storeDir);
  const file =
    dir &&
    path.join(
      dir,
      `${createHash('sha256').update(key).digest('hex').slice(0, 40)}.json`,
    );
  if (file) {
    try {
      const stored = JSON.parse(
        withoutRecording(() => fs.readFileSync(file, 'utf8')),
      );
      if (
        stored?.key === key &&
        Array.isArray(stored.stamps) &&
        stored.stamps.every(
          (/** @type {[number, string, string]} */ [at, rel, stamp]) =>
            fileStamp(fullPath(at, rel)) === stamp,
        )
      ) {
        return stored.value;
      }
    } catch {
      // No usable summary: it is made below.
    }
  }
  /** @type {Array<[number, string, string]>} */
  const stamps = [];
  const trees = resolved.map((root, at) => {
    /** @type {Array<[string, string]>} */
    const own = [];
    const folders = walkTree(root, skip, own);
    for (const [rel, stamp] of own) stamps.push([at, rel, stamp]);
    return {
      root,
      folders,
      /** @param {string} rel */
      readText: rel => {
        stamps.push([at, rel, fileStamp(fullPath(at, rel))]);
        return fs.readFileSync(fullPath(at, rel), 'utf8');
      },
    };
  });
  const value = summarize(trees);
  if (file && settled(stamps)) {
    withoutRecording(() => {
      try {
        const temp = `${file}.${process.pid}.${Date.now()}.tmp`;
        fs.writeFileSync(temp, JSON.stringify({key, stamps, value}), {
          mode: 0o600,
          flag: 'wx',
        });
        fs.renameSync(temp, file);
        evict(/** @type {string} */ (dir));
      } catch {
        // A summary that cannot be stored is made again next time.
      }
    });
  }
  return value;
}

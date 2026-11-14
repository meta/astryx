// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A summary of a folder tree's names and of the text of the files it
 * reads, kept between runs while no folder in the tree and no file the
 * summary read has changed.
 *
 * @input A root folder, the kind of summary, the modules whose code makes it,
 *   and the function that makes it from the tree's listing.
 * @output The summary: the stored one while every folder and every read file
 *   has the stamp it was stored with, else a new one, which is stored. The
 *   kept gathers' store holds it (gather-cache.mjs persistedSummary), under
 *   that store's rules.
 * @position Used by the docs not-found hint (foundation/discovery) to check
 *   one name against Core's sources, the CLI's blocks and each integration's
 *   folders without listing every folder on each run.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {fileURLToPath} from 'node:url';
import {persistedSummary} from './gather-cache.mjs';
import {fileStamp} from './read-record.mjs';

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

/** @type {Map<string, string>} each code file's stamp, once per process */
const codeStamps = new Map();

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
  return persistedSummary(['kept-tree', kind, resolved, codeState], () => {
    /** @type {[string, string][]} */
    const stamps = [];
    const trees = resolved.map(root => {
      /** @type {Array<[string, string]>} */
      const own = [];
      const folders = walkTree(root, skip, own);
      for (const [rel, stamp] of own) {
        stamps.push([rel === '' ? root : root + path.sep + rel, stamp]);
      }
      return {
        root,
        folders,
        /** @param {string} rel */
        readText: rel => {
          const full = rel === '' ? root : root + path.sep + rel;
          stamps.push([full, fileStamp(full)]);
          return fs.readFileSync(full, 'utf8');
        },
      };
    });
    return {value: summarize(trees), stamps};
  });
}

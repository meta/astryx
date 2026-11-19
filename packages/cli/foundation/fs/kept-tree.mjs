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
 * @position Used by the lookup commands' not-found hint (foundation/discovery) to check
 *   one name against Core's sources, the CLI's blocks and each integration's
 *   folders without listing every folder on each run.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {fileURLToPath} from 'node:url';
import {persistedSummary, persistedSummaryAsync} from './gather-cache.mjs';
import {
  PRESENT,
  RESOLVED,
  fileStamp,
  listingOf,
  listingStamp,
  recordReads,
  resolvedNow,
} from './read-record.mjs';

/** The module's own file: its code decides every summary's shape. */
const OWN_FILE = fileURLToPath(import.meta.url);

/**
 * One folder of the tree: its path from the root (`''` for the root) and its
 * entries, in the order the disk lists them. A link is never a folder here:
 * the walk does not follow it.
 * @typedef {{rel: string, entries: Array<{name: string, isDir: boolean, isLink: boolean}>}} TreeFolder
 */

/**
 * The tree under `root`, folder by folder, outside any folder `skip` names.
 * Each folder's stamp is its listing (read-record.mjs listingOf): its
 * entries' names and types, as the walk read them, so a save that renames a
 * new copy over a file keeps it, and an entry added, removed or renamed
 * changes it. A folder that cannot be read has no entries.
 * @param {string} root
 * @param {(name: string, rel: string) => boolean} skip a folder's name and
 *   the path of the folder that holds it from the root (`''` for the root)
 * @param {Array<[string, string]>} stamps
 * @returns {TreeFolder[]}
 */
function walkTree(root, skip, stamps) {
  /** @type {TreeFolder[]} */
  const folders = [];
  /** @param {string} rel */
  const visit = rel => {
    const full = rel === '' ? root : path.join(root, rel);
    /** @type {fs.Dirent[]} */
    let dirents;
    try {
      dirents = fs.readdirSync(full, {withFileTypes: true});
      stamps.push([rel, listingOf(dirents, full)]);
    } catch {
      dirents = [];
      stamps.push([rel, listingStamp(full)]);
    }
    const entries = dirents.map(entry => ({
      name: entry.name,
      isDir: entry.isDirectory(),
      isLink: entry.isSymbolicLink(),
    }));
    folders.push({rel, entries});
    for (const entry of entries) {
      if (entry.isDir && !skip(entry.name, rel)) {
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
 * What a kept tree summary is kept under, and what makes it.
 * @typedef {{kind: string, roots: Array<string | {root: string, skip?: (name: string, rel: string) => boolean}>, code: string[], skip?: (name: string, rel: string) => boolean, key?: unknown[], recorded?: boolean, accept?: (value: any) => boolean, keep?: (value: any) => boolean}} TreeSummaryOptions
 *   `roots`: each a folder, or a folder with the folder names its own walk
 *   does not enter; `code`: the files whose code makes the summary; `skip`:
 *   folder names the walk of a root without its own does not enter (both are
 *   part of `kind`); `key`: anything else the summary depends on;
 *   `recorded`: every path `summarize` reads through fs or probes is checked
 *   too, by its own stamp, so it can read files outside the trees and through
 *   caches that stat a file before they reuse it; `accept`: whether a stored
 *   summary serves this call; `keep`: whether a summary just made is stored
 *   (both gather-cache.mjs persistedSummary)
 */

/**
 * The summary's key, and what walks its trees: the trees, with the stamps
 * they took, and `finish`, which adds the stamps of what a recorded summary
 * read.
 * @param {TreeSummaryOptions} options
 * @returns {{summaryKey: unknown[], walk: () => {trees: Tree[], stamps: [string, string][], finish: (seen: Map<string, string>) => void}}}
 */
function treeSummary({kind, roots, code, skip = () => false, key = []}) {
  const walks = roots.map(each =>
    typeof each === 'string'
      ? {root: path.resolve(each), skip}
      : {root: path.resolve(each.root), skip: each.skip ?? skip},
  );
  const resolved = walks.map(walk => walk.root);
  const codeState = [OWN_FILE, ...code].map(file => {
    let stamp = codeStamps.get(file);
    if (stamp === undefined) {
      stamp = fileStamp(file);
      codeStamps.set(file, stamp);
    }
    return [file, stamp];
  });
  return {
    summaryKey: ['kept-tree', kind, resolved, codeState, ...key],
    walk: () => {
      /** @type {[string, string][]} */
      const stamps = [];
      const trees = walks.map(({root, skip: skipHere}) => {
        /** @type {Array<[string, string]>} */
        const own = [];
        const folders = walkTree(root, skipHere, own);
        for (const [rel, stamp] of own) {
          stamps.push([rel === '' ? root : root + path.sep + rel, stamp]);
        }
        // Where the root resolves, beside its listing: two folders can list
        // the same names (a package's version folders, a link re-pointed
        // between them), and a listing alone cannot tell them apart.
        stamps.push([root, resolvedNow(root)]);
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
      return {
        trees,
        stamps,
        finish: seen => {
          const walked = new Set(stamps.map(([file]) => file));
          for (const [file, state] of seen) {
            // A listed folder the summary also resolved keeps where it
            // resolves too, beside its listing, which names alone give.
            if (walked.has(file)) {
              if (state.startsWith(RESOLVED)) stamps.push([file, state]);
              continue;
            }
            // A folder probe, an existence check and a real-path lookup each
            // record less than a stamp, which a stored summary cannot check.
            // The full stamp, taken now, is stricter; a change during the
            // read leaves it too young to store.
            const partial =
              state.startsWith('dir:') ||
              state === PRESENT ||
              state.startsWith(RESOLVED);
            stamps.push([file, partial ? fileStamp(file) : state]);
          }
        },
      };
    },
  };
}

/**
 * The summary `summarize` makes of the trees under `roots`, or the one a run
 * stored for the same roots, kind and code while every folder it listed and
 * every file it read is unchanged. Any failure to read or store a summary is
 * silent, and the summary is made again.
 * @template T
 * @param {TreeSummaryOptions} options
 * @param {(trees: Tree[]) => T} summarize gets one tree per root, in order
 * @returns {T}
 */
export function keptTreeSummary(options, summarize) {
  const {summaryKey, walk} = treeSummary(options);
  return persistedSummary(
    summaryKey,
    () => {
      const {trees, stamps, finish} = walk();
      if (!options.recorded) return {value: summarize(trees), stamps};
      /** @type {Map<string, string>} */
      const seen = new Map();
      const value = recordReads(seen, () => summarize(trees), {exact: true});
      finish(seen);
      return {value, stamps};
    },
    {accept: options.accept, keep: options.keep},
  );
}

/**
 * {@link keptTreeSummary} for a summary that `summarize` makes
 * asynchronously, such as one that loads the modules that make it only when
 * no kept summary answers.
 * @template T
 * @param {TreeSummaryOptions} options
 * @param {(trees: Tree[]) => Promise<T>} summarize
 * @returns {Promise<T>}
 */
export function keptTreeSummaryAsync(options, summarize) {
  const {summaryKey, walk} = treeSummary(options);
  return persistedSummaryAsync(
    summaryKey,
    async () => {
      const {trees, stamps, finish} = walk();
      if (!options.recorded) return {value: await summarize(trees), stamps};
      /** @type {Map<string, string>} */
      const seen = new Map();
      const value = await recordReads(seen, () => summarize(trees), {
        exact: true,
      });
      finish(seen);
      return {value, stamps};
    },
    {accept: options.accept, keep: options.keep},
  );
}

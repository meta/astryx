// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The stamps of the CommonJS code a module loaded, for a kept answer
 *   that code worked out.
 * @input Module files already loaded by `require`.
 * @output `loadedCodeStamps(from, roots)`: the stamps of every file in the
 *   require graph from `roots` and of every package folder Node's lookup
 *   took on the way, and whether each last changed before this process
 *   started; `codeDigest(file)`: a code file's content, as a hash.
 * @position For a kept answer a library works out: its stamps name every
 *   file of the library's code, wherever it is installed, so a reinstall
 *   that changes any of them works the answer out again.
 */

import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {performance} from 'node:perf_hooks';
import {SUMMARY_SETTLE_MS} from './gather-cache.mjs';
import {fileStamp, resolvedNow, withoutRecording} from './read-record.mjs';

/**
 * The stamps of the CommonJS code `roots` loaded, for an answer that code
 * worked out, and whether every one last changed before this process
 * started:
 *
 * - each file in the require graph from `roots`, by its full stamp;
 * - each folder Node's package lookup took where a module required a module
 *   of another package (the `node_modules/<name>` nearest above the module
 *   that holds it), by the real path it resolves to. A reinstall that points
 *   a lookup at another copy of a package, and leaves the old copy on disk,
 *   changes it.
 *
 * The code a process runs is what its files held when it loaded them, and
 * a file or lookup folder unchanged since before the process started holds
 * that code still, whenever the process loaded it; an answer that code
 * worked out is kept only then.
 * @param {string} from the module that resolved `roots`
 * @param {string[]} roots module files, as `require.resolve` gives them
 * @param {Array<[string, string]>} [also] more loaded files, each with the
 *   file that required it, that the require graph does not show (one read
 *   through a `require` made with `createRequire`)
 * @param {{fromLookups?: boolean}} [options] - `fromLookups: false` leaves out
 *   the folders `from`'s own lookups of `roots` took, for an answer whose key
 *   already names the files `roots` resolve to from the caller's code
 * @returns {{stamps: [string, string][], unchangedSinceStart: boolean}}
 */
export function loadedCodeStamps(
  from,
  roots,
  also = [],
  {fromLookups = true} = {},
) {
  const {cache} = createRequire(import.meta.url);
  /** @type {Set<string>} */
  const files = new Set();
  /** @type {Array<[string, string]>} each requiring file and the file it required */
  const required = [];
  /** @param {NodeJS.Module | undefined} module */
  const visit = module => {
    if (!module || files.has(module.filename)) return;
    files.add(module.filename);
    for (const child of module.children) {
      required.push([module.filename, child.filename]);
      visit(child);
    }
  };
  for (const root of roots) {
    if (!cache[root]) continue;
    if (fromLookups) required.push([from, root]);
    visit(cache[root]);
  }
  for (const [by, file] of also) {
    files.add(file);
    required.push([by, file]);
  }
  return withoutRecording(() => {
    const links = lookupFolders(required);
    // A file system can keep times as coarsely as the settle time, so a
    // file or folder counts as unchanged since the process started only
    // when its times are older than the start by that much.
    const started = performance.timeOrigin - SUMMARY_SETTLE_MS;
    /** @param {number} mtime @param {number} ctime */
    const before = (mtime, ctime) => mtime < started && ctime < started;
    /** @type {[string, string][]} */
    const fileStamps = [...files].map(file => [file, fileStamp(file)]);
    const filesBefore = fileStamps.every(([, stamp]) => {
      if (stamp === '-') return false;
      const [, mtime, ctime] = stamp.split(':').map(Number);
      return before(mtime, ctime);
    });
    const linksBefore = links.every(link => {
      const stat = fs.lstatSync(link, {throwIfNoEntry: false});
      return stat !== undefined && before(stat.mtimeMs, stat.ctimeMs);
    });
    /** @type {[string, string][]} */
    const stamps = [
      ...fileStamps,
      ...links.map(
        link => /** @type {[string, string]} */ ([link, resolvedNow(link)]),
      ),
    ];
    const unchangedSinceStart =
      filesBefore && linksBefore && stamps.every(([, stamp]) => stamp !== '-');
    return {stamps, unchangedSinceStart};
  });
}

/** @type {Map<string, string | null>} */
const digests = new Map();

/**
 * A code file's content as a SHA-256 hash, read once per process, or null
 * when the file cannot be read: for an answer kept across CLI builds, whose
 * key must follow the code that works it out by content (a build's files
 * are otherwise covered by its build id).
 * @param {string} file
 * @returns {string | null}
 */
export function codeDigest(file) {
  if (!digests.has(file))
    digests.set(
      file,
      withoutRecording(() => {
        try {
          return createHash('sha256')
            .update(fs.readFileSync(file))
            .digest('hex');
        } catch {
          return null;
        }
      }),
    );
  return digests.get(file) ?? null;
}

/**
 * The folder Node's package lookup took for each pair whose files are in
 * different packages: the first `node_modules/<name>` on the requiring
 * file's lookup paths that is there, `<name>` being the required file's
 * package.
 * @param {Array<[string, string]>} required
 * @returns {string[]}
 */
function lookupFolders(required) {
  /** @type {Map<string, {root: string, name: string} | null>} */
  const packages = new Map();
  /** @param {string} dir @returns {{root: string, name: string} | null} */
  const packageAt = dir => {
    if (packages.has(dir)) return /** @type {any} */ (packages.get(dir));
    /** @type {{root: string, name: string} | null} */
    let found = null;
    try {
      const {name} = JSON.parse(
        fs.readFileSync(path.join(dir, 'package.json'), 'utf8'),
      );
      if (typeof name === 'string') found = {root: dir, name};
    } catch {
      // No package.json with a name here: the package is further up.
    }
    const parent = path.dirname(dir);
    if (!found && parent !== dir) found = packageAt(parent);
    packages.set(dir, found);
    return found;
  };
  /** @type {Set<string>} */
  const folders = new Set();
  /** @type {Set<string>} */
  const asked = new Set();
  for (const [by, file] of required) {
    const to = packageAt(path.dirname(file));
    if (!to || packageAt(path.dirname(by))?.root === to.root) continue;
    const id = `${path.dirname(by)}\0${to.name}`;
    if (asked.has(id)) continue;
    asked.add(id);
    const folder = createRequire(by)
      .resolve.paths(to.name)
      ?.map(dir => path.join(dir, to.name))
      .find(dir => fs.existsSync(dir));
    if (folder) folders.add(folder);
  }
  return [...folders];
}

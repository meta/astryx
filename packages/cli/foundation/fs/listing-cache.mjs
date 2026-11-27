// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file One directory listing per path for the duration of one read-only
 * operation, kept for later operations while the folder is unchanged.
 *
 * @input A read-only operation (`withListingCache(fn)`), and directory paths
 *   its discovery helpers list or probe.
 * @output The same answers `fs.readdirSync` / `fs.existsSync` give, read from
 *   disk once per path while the operation runs, and `oncePerListing`, a
 *   value computed once per operation. A later operation in the same process
 *   reuses a listing while its folder's stamp is unchanged.
 * @position Used by the name resolvers and doc walkers in
 *   foundation/discovery and by `existsCaseExact`. A search or build resolves
 *   ~160 components and their hooks, and each resolution walks the same
 *   source tree again. Inside one operation the tree does not change, so each
 *   directory is read once. Outside `withListingCache` every helper reads the
 *   disk directly, exactly as before.
 */

import {AsyncLocalStorage} from 'node:async_hooks';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {performance} from 'node:perf_hooks';
import {fileStamp, recordContentRead} from './read-record.mjs';

/**
 * @typedef {{
 *   names: Map<string, string[]>,
 *   entries: Map<string, fs.Dirent[]>,
 *   byName: Map<string, Map<string, fs.Dirent>>,
 *   exists: Map<string, boolean>,
 *   memos: Map<string, unknown>,
 * }} ListingCache
 */

/** @type {AsyncLocalStorage<ListingCache>} */
const scope = new AsyncLocalStorage();

/**
 * Listings kept for later operations in this process, by folder. Each holds
 * the folder's stamp (`fileStamp`: size, times and inode) and when this
 * process first saw it. Once the stamp has held for {@link SETTLE_MS}, it
 * holds the entries too. Adding, removing or renaming an entry changes the
 * stamp.
 * @type {Map<string, {stamp: string, since: number, entries: fs.Dirent[] | null}>}
 */
const kept = new Map();

/**
 * How long a folder's stamp must hold, by this process's clock, before its
 * listing is kept. A file system can store times as coarsely as 2 s. So a
 * change within one tick of the last can leave the stamp as it was. After the
 * stamp has held this long, a new change falls in a later tick.
 */
const SETTLE_MS = 2000;

/**
 * Run `fn` with a listing cache. A nested call shares the outer cache. Only
 * wrap operations that do not change the files they list.
 * @template T
 * @param {() => T} fn
 * @returns {T}
 */
export function withListingCache(fn) {
  if (scope.getStore()) return fn();
  return scope.run(
    {
      names: new Map(),
      entries: new Map(),
      byName: new Map(),
      exists: new Map(),
      memos: new Map(),
    },
    fn,
  );
}

/**
 * `compute()` once per operation, under `key`. A later call in the same
 * operation gets the first result; outside an operation it computes each time.
 * @template T
 * @param {string} key
 * @param {() => T} compute
 * @returns {T}
 */
export function oncePerListing(key, compute) {
  const cache = scope.getStore();
  if (!cache) return compute();
  if (!cache.memos.has(key)) cache.memos.set(key, compute());
  return /** @type {T} */ (cache.memos.get(key));
}

/**
 * What `oncePerListing(key, …)` already computed in this operation, without
 * computing it: undefined when nothing has.
 * @param {string} key
 * @returns {unknown}
 */
export function onceComputed(key) {
  return scope.getStore()?.memos.get(key);
}

/**
 * Whether an operation's listing cache is active.
 * @returns {boolean}
 */
export function listingCacheActive() {
  return scope.getStore() != null;
}

/**
 * `fs.readdirSync(dir)`, read once per operation. Returns a fresh array, so a
 * caller that sorts it cannot reorder another caller's listing. The names come
 * from the same read as {@link listDirEntries}, so a folder listed both ways
 * is read once.
 * @param {string} dir
 * @returns {string[]}
 */
export function listDir(dir) {
  const cache = scope.getStore();
  if (!cache) return fs.readdirSync(dir);
  let names = cache.names.get(dir);
  if (!names) {
    names = listDirEntries(dir).map(entry => entry.name);
    cache.names.set(dir, names);
  }
  return names.slice();
}

/**
 * `fs.readdirSync(dir, {withFileTypes: true})`, read once per operation.
 * @param {string} dir
 * @returns {fs.Dirent[]}
 */
export function listDirEntries(dir) {
  const cache = scope.getStore();
  if (!cache) return fs.readdirSync(dir, {withFileTypes: true});
  let entries = cache.entries.get(dir);
  if (!entries) {
    entries = keptOrRead(dir);
    cache.entries.set(dir, entries);
  }
  return entries.slice();
}

/**
 * `dir`'s entries for an operation. They are the kept listing while the
 * folder's stamp is the one it was kept with. Otherwise they are a new read,
 * kept once the stamp has held for {@link SETTLE_MS}.
 * @param {string} dir
 * @returns {fs.Dirent[]}
 */
function keptOrRead(dir) {
  const folder = path.resolve(dir);
  // A reuse check (read-record.mjs) records the folder's state before the
  // stamp below is taken. So a change between the two shows as a change.
  recordContentRead(folder);
  const before = performance.now();
  const stamp = fileStamp(folder);
  const held = kept.get(folder);
  if (held?.entries && held.stamp === stamp) return held.entries;
  const entries = fs.readdirSync(dir, {withFileTypes: true});
  if (held?.stamp !== stamp) {
    // Taken after the stamp, so the stamp's times are no later than this.
    kept.set(folder, {stamp, since: performance.now(), entries: null});
  } else if (before - held.since >= SETTLE_MS) {
    // Read after the stamp held for the settle time: a later change gets a
    // new stamp.
    kept.set(folder, {stamp, since: held.since, entries});
  }
  return entries;
}

/**
 * The entry named exactly `name` in `dir`'s listing, or null when the folder
 * holds no such name or cannot be read. Inside an operation, a name the
 * listing lacks costs no probe of the disk.
 * @param {string} dir
 * @param {string} name
 * @returns {fs.Dirent | null}
 */
export function findEntry(dir, name) {
  const cache = scope.getStore();
  if (!cache) {
    try {
      return (
        fs
          .readdirSync(dir, {withFileTypes: true})
          .find(entry => entry.name === name) ?? null
      );
    } catch {
      return null;
    }
  }
  let byName = cache.byName.get(dir);
  if (!byName) {
    let entries;
    try {
      entries = listDirEntries(dir);
    } catch {
      return null;
    }
    byName = new Map(entries.map(entry => [entry.name, entry]));
    cache.byName.set(dir, byName);
  }
  return byName.get(name) ?? null;
}

/**
 * `fs.existsSync(target)`, probed once per operation.
 * @param {string} target
 * @returns {boolean}
 */
export function pathExists(target) {
  const cache = scope.getStore();
  if (!cache) return fs.existsSync(target);
  let exists = cache.exists.get(target);
  if (exists === undefined) {
    exists = fs.existsSync(target);
    cache.exists.set(target, exists);
  }
  return exists;
}

// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file One directory listing per path for the duration of one read-only
 * operation.
 *
 * @input A read-only operation (`withListingCache(fn)`), and directory paths
 *   its discovery helpers list or probe.
 * @output The same answers `fs.readdirSync` / `fs.existsSync` give, read from
 *   disk once per path while the operation runs.
 * @position Used by the name resolvers in foundation/discovery and by
 *   `existsCaseExact`. A search or build resolves ~160 components and their
 *   hooks, and each resolution walks the same source tree again; inside one
 *   operation the tree does not change, so each directory is read once.
 *   Outside `withListingCache` every helper reads the disk directly, exactly
 *   as before, so long-lived callers never see a stale listing.
 */

import {AsyncLocalStorage} from 'node:async_hooks';
import * as fs from 'node:fs';

/**
 * @typedef {{
 *   names: Map<string, string[]>,
 *   entries: Map<string, fs.Dirent[]>,
 *   exists: Map<string, boolean>,
 * }} ListingCache
 */

/** @type {AsyncLocalStorage<ListingCache>} */
const scope = new AsyncLocalStorage();

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
    {names: new Map(), entries: new Map(), exists: new Map()},
    fn,
  );
}

/**
 * `fs.readdirSync(dir)`, read once per operation. Returns a fresh array, so a
 * caller that sorts it cannot reorder another caller's listing.
 * @param {string} dir
 * @returns {string[]}
 */
export function listDir(dir) {
  const cache = scope.getStore();
  if (!cache) return fs.readdirSync(dir);
  let names = cache.names.get(dir);
  if (!names) {
    names = fs.readdirSync(dir);
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
    entries = fs.readdirSync(dir, {withFileTypes: true});
    cache.entries.set(dir, entries);
  }
  return entries.slice();
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

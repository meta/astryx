// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Where an authored file ships: its package and its path inside it.
 *
 * @input An absolute file path.
 * @output `<package name>/<path inside the package>`, found by walking up to
 *   the nearest package.json that names a package.
 * @position Used by the doc compiler for provenance and diagnostics, so no
 *   compiled node or diagnostic carries a machine-specific path.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * The nearest package a directory belongs to: the nearest package.json that
 * names a package, else the nearest package.json at all (named by its folder).
 * @typedef {{dir: string, name: string}} PackageRoot
 */

/** @type {Map<string, {named: PackageRoot | null, any: PackageRoot | null}>} */
const packageRoots = new Map();

/**
 * Where a file ships: its package's name and its path inside that package.
 * Never a location on this machine: a file outside any package is named by
 * its folder and file name.
 * @param {string} file absolute path
 * @returns {string}
 */
export function packageSource(file) {
  const {named, any} = packageRootsOf(path.dirname(path.resolve(file)));
  const root = named ?? any;
  if (root == null) {
    return `${folderName(path.dirname(path.resolve(file)))}/${path.basename(file)}`;
  }
  const inside = path
    .relative(root.dir, path.resolve(file))
    .split(path.sep)
    .join('/');
  return `${root.name}/${inside}`;
}

/**
 * The name of the package a file ships in; for a package.json with no name,
 * its folder's name; outside any package, `unknown`.
 * @param {string} file absolute path
 * @returns {string}
 */
export function packageOf(file) {
  const {named, any} = packageRootsOf(path.dirname(path.resolve(file)));
  return (named ?? any)?.name ?? 'unknown';
}

/**
 * Replace every absolute path in a message with where that file ships, so a
 * diagnostic never carries a location on this machine.
 * @param {string} message
 * @returns {string}
 */
export function scrubPaths(message) {
  return message
    .replace(/file:\/\/(\/[^\s'"`)]+)/gu, (_, file) =>
      packageSource(safeDecode(file)),
    )
    .replace(/(?<![\w:/.-])((?:\/[^\s'"`:()/]+)+)/gu, (_, file) =>
      packageSource(file),
    )
    .replace(/(?<![\w])([A-Za-z]:\\[^\s'"`:()]+)/gu, (_, file) =>
      packageSource(file),
    );
}

/** @param {string} dir */
function folderName(dir) {
  const name = path
    .basename(dir)
    .toLowerCase()
    .replace(/[^a-z0-9._~-]+/gu, '-');
  return name.replace(/^[._]+/u, '') || 'unknown';
}

/**
 * @param {string} dir
 * @returns {{named: PackageRoot | null, any: PackageRoot | null}}
 */
function packageRootsOf(dir) {
  const cached = packageRoots.get(dir);
  if (cached !== undefined) return cached;
  /** @type {PackageRoot | null} */
  let here = null;
  let named = false;
  const manifest = path.join(dir, 'package.json');
  if (fs.existsSync(manifest)) {
    here = {dir, name: folderName(dir)};
    try {
      const {name} = JSON.parse(fs.readFileSync(manifest, 'utf-8'));
      if (typeof name === 'string' && name !== '') {
        here = {dir, name};
        named = true;
      }
    } catch {
      // An unreadable package.json names no package; keep walking up.
    }
  }
  const parent = path.dirname(dir);
  const above =
    named || parent === dir ? {named: null, any: null} : packageRootsOf(parent);
  const found = named
    ? {named: here, any: here}
    : {named: above.named, any: here ?? above.any};
  packageRoots.set(dir, found);
  return found;
}

/**
 * A file URL path decoded, or as written when it is not valid percent-encoding
 * (a message may hold any text).
 * @param {string} text
 */
function safeDecode(text) {
  try {
    return decodeURI(text);
  } catch {
    return text;
  }
}

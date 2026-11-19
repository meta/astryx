// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The export worker's imports between the files of an installed
 * package, resolved by their path in the package.
 *
 * @input `packageResolveHooks()`, registered by page-worker.mjs.
 * @output Module hooks whose resolve step answers a relative, fully
 *   specified ES module import between two files of one installed package
 *   with the file's URL; every other import goes on to the next resolver.
 * @position foundation/render. Node reads the nearest package.json of each
 *   module it resolves and loads, and it reads a package's whole manifest
 *   again for each module, so a package of hundreds of modules (Core) reads
 *   its exports map hundreds of times. The hook reads the package.json of
 *   each folder at most once. Page files never reach it.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

const NODE_MODULES = `${path.sep}node_modules${path.sep}`;

/**
 * The installed package folder that holds `file`: the folder after the last
 * `node_modules` in its path (`@scope/name` for a scoped package), or null
 * when the file is not in one.
 * @param {string} file
 * @returns {string | null}
 */
export function installedPackageOf(file) {
  const at = file.lastIndexOf(NODE_MODULES);
  if (at === -1) return null;
  const parts = file.slice(at + NODE_MODULES.length).split(path.sep);
  const depth = parts[0].startsWith('@') ? 2 : 1;
  if (parts.length <= depth) return null;
  return (
    file.slice(0, at + NODE_MODULES.length) +
    parts.slice(0, depth).join(path.sep)
  );
}

/**
 * Lookups that one set of hooks keeps: each folder's package.json `type`
 * (null for a folder with none, undefined for one that cannot be read).
 * @typedef {{types: Map<string, string | null | undefined>}} PackageLookups
 */

/** @returns {PackageLookups} */
export function packageLookups() {
  return {types: new Map()};
}

/**
 * The `type` of the package.json nearest `dir`, searched up to `root`
 * included: a string, null when the folders hold none, or undefined when one
 * cannot be read (Node then reports it).
 * @param {string} dir
 * @param {string} root
 * @param {PackageLookups} lookups
 * @returns {string | null | undefined}
 */
function packageTypeAt(dir, root, lookups) {
  for (let d = dir; ; d = path.dirname(d)) {
    let type = lookups.types.get(d);
    if (!lookups.types.has(d)) {
      type = null;
      const file = path.join(d, 'package.json');
      if (fs.existsSync(file)) {
        try {
          const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
          type =
            typeof manifest?.type === 'string' ? manifest.type : 'commonjs';
        } catch {
          type = undefined;
        }
      }
      lookups.types.set(d, type);
    }
    if (type !== null) return type;
    if (d === root || path.dirname(d) === d) return null;
  }
}

/**
 * The URL of the ES module that `specifier` names from `parent`, when both
 * are files of one installed package and Node would load it as an ES module;
 * else null, and Node resolves the import itself. Only a `./` or `../` path
 * to a `.js` or `.mjs` file that exists as a regular file at its real path
 * is answered: a folder, a missing file, an extensionless name, an escape,
 * a query, a hash, a symbolic link and a file outside the package all go to
 * Node, which reports or follows them as it always does.
 * @param {string} specifier
 * @param {string | undefined} parent - the importing module's URL
 * @param {PackageLookups} lookups
 * @returns {string | null}
 */
export function packageModuleUrl(specifier, parent, lookups) {
  if (parent === undefined || !parent.startsWith('file:')) return null;
  if (!specifier.startsWith('./') && !specifier.startsWith('../')) return null;
  if (/[%?#\\]/.test(specifier) || !/\.m?js$/.test(specifier)) return null;
  const from = fileURLToPath(parent);
  const root = installedPackageOf(from);
  if (root === null) return null;
  const file = path.resolve(path.dirname(from), specifier);
  // A file in a node_modules folder inside the package belongs to another
  // package, whose scope Node reads apart from this one.
  if (installedPackageOf(file) !== root) return null;
  const stat = fs.statSync(file, {throwIfNoEntry: false});
  if (!stat?.isFile()) return null;
  try {
    if (fs.realpathSync.native(file) !== file) return null;
  } catch {
    return null;
  }
  if (
    !file.endsWith('.mjs') &&
    packageTypeAt(path.dirname(file), root, lookups) !== 'module'
  ) {
    return null;
  }
  return pathToFileURL(file).href;
}

/**
 * Module hooks that resolve imports between the files of an installed
 * package by path.
 * @param {PackageLookups} [lookups]
 */
export function packageResolveHooks(lookups = packageLookups()) {
  return {
    /**
     * @param {string} specifier
     * @param {{parentURL?: string}} context
     * @param {(specifier: string, context: any) => any} nextResolve
     */
    resolve(specifier, context, nextResolve) {
      const url = packageModuleUrl(specifier, context.parentURL, lookups);
      return url === null
        ? nextResolve(specifier, context)
        : {url, format: 'module', shortCircuit: true};
    },
  };
}

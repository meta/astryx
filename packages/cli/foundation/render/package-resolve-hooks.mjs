// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The export worker's imports between the files of an installed or a
 * linked package, resolved by their path in the package.
 *
 * @input `packageResolveHooks()`, registered by page-worker.mjs.
 * @output Module hooks whose resolve step answers a relative, fully
 *   specified ES module import between two files of one installed package,
 *   or of one linked package (one a bare import reached outside
 *   node_modules), with the file's URL; every other import goes on to the
 *   next resolver, and its answer is returned as it is.
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
 * (null for a folder with none, undefined for one that cannot be read), each
 * folder's package.json `name` (null for a folder with none), and the
 * folders of the linked packages bare imports reached.
 * @typedef {{types: Map<string, string | null | undefined>, names: Map<string, unknown>, linked: Set<string>}} PackageLookups
 */

/** @returns {PackageLookups} */
export function packageLookups() {
  return {types: new Map(), names: new Map(), linked: new Set()};
}

/**
 * The folder of the linked package that holds `file`: the nearest folder
 * above it that a bare import was found to reach (see noteLinkedPackage),
 * with no node_modules folder between them; else null.
 * @param {string} file
 * @param {PackageLookups} lookups
 * @returns {string | null}
 */
export function linkedPackageOf(file, lookups) {
  if (lookups.linked.size === 0) return null;
  for (let d = path.dirname(file); ; d = path.dirname(d)) {
    if (path.basename(d) === 'node_modules') return null;
    if (lookups.linked.has(d)) return d;
    if (path.dirname(d) === d) return null;
  }
}

/**
 * The `name` in the package.json of the folder nearest `dir` that has one,
 * with that folder; null when no folder up to the file system's root has one.
 * @param {string} dir
 * @param {PackageLookups} lookups
 * @returns {{dir: string, name: unknown} | null}
 */
function nearestManifest(dir, lookups) {
  for (let d = dir; ; d = path.dirname(d)) {
    if (!lookups.names.has(d)) {
      const file = path.join(d, 'package.json');
      let name = null;
      if (fs.existsSync(file)) {
        try {
          name = JSON.parse(fs.readFileSync(file, 'utf8'))?.name;
        } catch {
          name = undefined;
        }
      }
      lookups.names.set(d, name);
    }
    if (lookups.names.get(d) !== null)
      return {dir: d, name: lookups.names.get(d)};
    if (path.dirname(d) === d) return null;
  }
}

/**
 * Notes the folder of a linked package: a bare import that resolved to a
 * file outside node_modules reached the package whose folder holds that
 * file's nearest package.json, when that package.json names the package the
 * import names. A folder `skip` refuses is not noted.
 * @param {string} specifier
 * @param {unknown} url - the resolved URL
 * @param {PackageLookups} lookups
 * @param {(folder: string) => boolean} skip - takes the folder with a
 *   trailing separator
 */
function noteLinkedPackage(specifier, url, lookups, skip) {
  if (typeof url !== 'string' || !url.startsWith('file:')) return;
  const file = fileURLToPath(url);
  if (file.includes(NODE_MODULES)) return;
  const parts = specifier.split('/');
  const name = parts.slice(0, specifier.startsWith('@') ? 2 : 1).join('/');
  const found = nearestManifest(path.dirname(file), lookups);
  if (found && found.name === name && !skip(found.dir + path.sep))
    lookups.linked.add(found.dir);
}

/** Whether a specifier names a package (not a path, a URL or an import map entry). @param {string} specifier */
const isBare = specifier =>
  !/^[./#]/.test(specifier) && !/^[a-z][a-z0-9+.-]*:/i.test(specifier);

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
  const root = installedPackageOf(from) ?? linkedPackageOf(from, lookups);
  if (root === null) return null;
  const file = path.resolve(path.dirname(from), specifier);
  // A file in a node_modules folder inside the package belongs to another
  // package, whose scope Node reads apart from this one.
  if ((installedPackageOf(file) ?? linkedPackageOf(file, lookups)) !== root)
    return null;
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
 * Module hooks that resolve imports between the files of an installed or a
 * linked package by path.
 * @param {PackageLookups} [lookups]
 * @param {{skip?: (folder: string) => boolean}} [options] - `skip`: a folder
 *   never taken as a linked package's (the page's own folders)
 */
export function packageResolveHooks(
  lookups = packageLookups(),
  {skip = () => false} = {},
) {
  return {
    /**
     * @param {string} specifier
     * @param {{parentURL?: string}} context
     * @param {(specifier: string, context: any) => any} nextResolve
     */
    resolve(specifier, context, nextResolve) {
      const url = packageModuleUrl(specifier, context.parentURL, lookups);
      if (url !== null) return {url, format: 'module', shortCircuit: true};
      const resolved = nextResolve(specifier, context);
      if (isBare(specifier))
        noteLinkedPackage(specifier, resolved?.url, lookups, skip);
      return resolved;
    },
  };
}

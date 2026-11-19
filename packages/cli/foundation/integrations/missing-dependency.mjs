// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Whether a module load error is a broken install: a package that the
 *   importing package declares is missing.
 * @input A load error's message, as Node words it for an ES module ("Cannot
 *   find package 'x' imported from /file") or for CommonJS ("Cannot find
 *   module 'x'" with its require stack).
 * @output `missingDeclaredDependency(message)`: the missing package's name
 *   when the package holding the importing file declares it as a package its
 *   consumers' install must hold (dependencies, or a peerDependencies entry
 *   not marked optional in peerDependenciesMeta), else null. A dev dependency
 *   is never installed for a consumer and an optional one may be skipped by
 *   design, so a manifest that needs either has a packaging bug, which
 *   reinstalling does not clear. A package listed both as a dependency and
 *   as an optional one is optional, as npm reads it.
 * @position Read by the project (foundation/config/project.mjs) to tell an
 *   install the user can repair from a dependency's own packaging bug, which
 *   stays out of the project's issues.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {fileURLToPath} from 'node:url';

/**
 * Whether a package.json declares `name` as a package its consumers' install
 * must hold: a dependency, or a peer not marked optional.
 * @param {any} pkg
 * @param {string} name
 * @returns {boolean}
 */
function requires(pkg, name) {
  /** @param {unknown} field */
  const has = field =>
    field != null && typeof field === 'object' && Object.hasOwn(field, name);
  // npm treats a package listed in both as optional (fsevents, say).
  if (has(pkg.optionalDependencies)) return false;
  if (has(pkg.dependencies)) return true;
  return (
    has(pkg.peerDependencies) &&
    pkg.peerDependenciesMeta?.[name]?.optional !== true
  );
}

/**
 * The missing package and the file that imported it, from a load error.
 * @param {string} message
 * @returns {{name: string, importer: string} | null}
 */
function parse(message) {
  const esm =
    /Cannot find (?:package|module) '([^']+)' imported from ([^\n]+)/.exec(
      message,
    );
  const cjs =
    /Cannot find module '([^']+)'\s*\nRequire stack:\n- ([^\n]+)/.exec(message);
  const hit = esm ?? cjs;
  if (!hit) return null;
  const [, spec, found] = hit;
  const from = found.trim();
  if (spec.startsWith('.') || path.isAbsolute(spec) || spec.startsWith('node:'))
    return null;
  const parts = spec.split('/');
  const name = spec.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
  let importer = from;
  try {
    if (from.startsWith('file:')) importer = fileURLToPath(from);
  } catch {
    return null;
  }
  return {name, importer};
}

/**
 * The missing package's name when the package that imports it declares it.
 * @param {string} message
 * @returns {string | null}
 */
export function missingDeclaredDependency(message) {
  const found = parse(message);
  if (!found) return null;
  let dir = path.dirname(found.importer);
  for (;;) {
    const file = path.join(dir, 'package.json');
    if (fs.existsSync(file)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(file, 'utf-8'));
        if (typeof pkg?.name === 'string') {
          return requires(pkg, found.name) ? found.name : null;
        }
      } catch {
        return null;
      }
    }
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

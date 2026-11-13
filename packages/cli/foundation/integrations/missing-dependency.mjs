// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Whether a module load error is a broken install: a package that the
 *   importing package declares is missing.
 * @input A load error's message, as Node words it for an ES module ("Cannot
 *   find package 'x' imported from /file") or for CommonJS ("Cannot find
 *   module 'x'" with its require stack).
 * @output `missingDeclaredDependency(message)`: the missing package's name
 *   when the package holding the importing file declares it (dependencies,
 *   devDependencies, optionalDependencies or peerDependencies), else null.
 * @position Read by the project (foundation/config/project.mjs) to tell an
 *   install the user can repair from a dependency's own packaging bug, which
 *   stays out of the project's issues.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {fileURLToPath} from 'node:url';

/** The package.json fields that declare a package the code may import. */
const FIELDS = [
  'dependencies',
  'devDependencies',
  'optionalDependencies',
  'peerDependencies',
];

/**
 * The missing package and the file that imported it, from a load error.
 * @param {string} message
 * @returns {{name: string, importer: string} | null}
 */
function parse(message) {
  const esm =
    /Cannot find (?:package|module) '([^']+)' imported from (\S+)/.exec(
      message,
    );
  const cjs =
    /Cannot find module '([^']+)'\s*\nRequire stack:\n- ([^\n]+)/.exec(message);
  const hit = esm ?? cjs;
  if (!hit) return null;
  const [, spec, from] = hit;
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
          return FIELDS.some(
            field =>
              pkg[field] != null &&
              typeof pkg[field] === 'object' &&
              Object.hasOwn(pkg[field], found.name),
          )
            ? found.name
            : null;
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

// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Which packages a render may take from the package set the CLI runs
 * from when the page is outside a project (architecture:cli-surface INV30):
 * the Astryx packages, the React and StyleX they run with, the integrations
 * the host approves, and the other packages the host's set declares. Inside a
 * project the set is never used.
 *
 * @input A specifier, the file that imports it, and the served Core's folder.
 * @output The file it resolves to, or null; for a subpath a package exports
 *   to ES module imports only, the file an import loads.
 * @position foundation/render — read by render-page.mjs and page-worker.mjs.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {createRequire} from 'node:module';
import {conditionalExportFile} from '../discovery/package-exports.mjs';
import {findNodeModulesPackage} from '../fs/paths.mjs';

/** Packages every Astryx package runs with, besides its own scope. */
const RUNTIME = ['react', 'react-dom', '@stylexjs/stylex'];

/**
 * React and StyleX hold state per copy, so a page outside a project loads
 * the set's copy of each, as the packages from the set do.
 */
export const SINGLE_COPY = RUNTIME;

/**
 * The package a bare specifier names.
 * @param {string} spec
 * @returns {string}
 */
export function packageOf(spec) {
  return spec.startsWith('@')
    ? spec.split('/').slice(0, 2).join('/')
    : spec.split('/')[0];
}

/**
 * Whether a render may take `name` from the package set.
 * @param {string} name
 * @param {readonly string[]} integrations the integrations the host approves,
 *   and the other packages its set declares
 * @returns {boolean}
 */
export function isServedPackage(name, integrations) {
  return (
    name.startsWith('@astryxdesign/') ||
    RUNTIME.includes(name) ||
    integrations.includes(name)
  );
}

/**
 * Resolve `spec` the way `from` sees it; when that fails and the package is
 * one the set serves, the way the served Core's folder sees it.
 * @param {string} spec
 * @param {string} from the importing file
 * @param {{dir: string, integrations: readonly string[]} | null} served
 * @returns {string | null}
 */
export function resolveServed(spec, from, served) {
  try {
    return createRequire(from).resolve(spec);
  } catch {
    if (!served || !isServedPackage(packageOf(spec), served.integrations)) {
      return null;
    }
    try {
      return createRequire(path.join(served.dir, 'package.json')).resolve(
        spec,
        {paths: [served.dir]},
      );
    } catch (e) {
      return /** @type {any} */ (e)?.code === 'ERR_PACKAGE_PATH_NOT_EXPORTED'
        ? servedImportTarget(spec, served.dir)
        : null;
    }
  }
}

/** The conditions Node matches when an ES module imports a package. */
const IMPORT_CONDITIONS = ['import', 'node'];

/**
 * The file a served package exports for `spec` to an ES module import, as
 * Node resolves it: the target its `exports` give the subpath under the
 * `import`, `node` and `default` conditions, kept inside the package. Use it
 * where the CommonJS resolve, which reads `require`, finds the subpath not
 * exported: a theme package often exports a subpath under `import` only.
 * Null when the package exports no such subpath to an import either.
 * @param {string} spec a bare specifier
 * @param {string} servedDir the served Core's folder
 * @returns {string | null}
 */
export function servedImportTarget(spec, servedDir) {
  const name = packageOf(spec);
  const subpath = spec === name ? '.' : `.${spec.slice(name.length)}`;
  const found = findNodeModulesPackage(servedDir, name);
  if (!found) return null;
  /** @type {any} */
  let pkg;
  try {
    pkg = JSON.parse(
      fs.readFileSync(path.join(found.packageDir, 'package.json'), 'utf8'),
    );
  } catch {
    return null;
  }
  return conditionalExportFile(
    pkg?.exports,
    found.packageDir,
    subpath,
    IMPORT_CONDITIONS,
  );
}

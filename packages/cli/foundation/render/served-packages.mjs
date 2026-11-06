// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Which packages a render may take from the package set the CLI runs
 * from when the page is outside a project (architecture:cli-surface INV30):
 * the Astryx packages, the React and StyleX they run with, and the
 * integrations the host approves. Inside a project the set is never used.
 *
 * @input A specifier, the file that imports it, and the served Core's folder.
 * @output The file it resolves to, or null.
 * @position foundation/render — read by render-page.mjs and page-worker.mjs.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {createRequire} from 'node:module';

/** Packages every Astryx package runs with, besides its own scope. */
const RUNTIME = ['react', 'react-dom', '@stylexjs/stylex'];

/**
 * The packages beside the page that make its folder a project of its own for
 * a render: when it installs any of them, the project's packages serve the
 * page alone, so React and StyleX never come from two places.
 */
export const PROJECT_PACKAGES = ['@astryxdesign/core', ...RUNTIME];

/**
 * Whether `name` is installed for `dir`: in a `node_modules` folder at or
 * above it. Only what is installed there counts, never NODE_PATH.
 * @param {string} dir
 * @param {string} name
 * @returns {boolean}
 */
export function installedFrom(dir, name) {
  for (let d = path.resolve(dir); ; d = path.dirname(d)) {
    if (fs.existsSync(path.join(d, 'node_modules', ...name.split('/'), 'package.json'))) return true;
    if (path.dirname(d) === d) return false;
  }
}

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
 * @param {readonly string[]} integrations the integrations the host approves
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
    } catch {
      return null;
    }
  }
}

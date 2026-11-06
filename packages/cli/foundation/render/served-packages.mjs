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

import * as path from 'node:path';
import {createRequire} from 'node:module';

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

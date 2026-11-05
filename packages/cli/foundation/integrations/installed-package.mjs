// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file installed-package.mjs
 * @input A dependency name and the folder to resolve it from
 * @output isBarePackageName and resolveInstalledPackageDir: where an installed
 *   package is, found the way Node's resolver walks up node_modules
 * @position packages/cli/foundation/integrations: loads no integration, so the
 *   run's locked versions resolve packages without autolink.mjs and its
 *   manifest loader. autolink.mjs re-exports resolveInstalledPackageDir.
 */

import * as path from 'node:path';
import {findNodeModulesPackage} from '../fs/paths.mjs';

/**
 * Whether a dependency key is a bare package name safe to resolve.
 *
 * Mirrors the guard in {@link import('./integrations.mjs').resolvePackageDir}:
 * a name is a directory under node_modules, so a path segment (`.`, `..`) or an
 * absolute spec must never reach the resolver, which goes on to dynamically
 * import what it finds.
 *
 * @param {string} name
 * @returns {boolean}
 */
export function isBarePackageName(name) {
  return (
    typeof name === 'string' &&
    name.length > 0 &&
    !path.isAbsolute(name) &&
    !name.startsWith('@/') &&
    !name.split('/').some(segment => segment === '.' || segment === '..')
  );
}

/**
 * Resolve an installed package's directory the way Node's resolver finds it:
 * the nearest `node_modules/<name>` walking up from `fromDir`.
 *
 * Walking up matters because hoisting is normal — yarn and npm workspaces lift
 * a workspace member's dependency to the repo root, so the app's own
 * node_modules can be empty of a package it genuinely declares. Integrations
 * named in astryx.config resolve through the same walk.
 *
 * Presence is decided by the package's own package.json, not the directory, so
 * a stale empty directory is not mistaken for an install.
 *
 * @param {string} name bare package name
 * @param {string} fromDir directory to start walking up from
 * @returns {{packageDir: string, hostDir: string}|null} the resolved package
 *   directory and the directory whose node_modules holds it
 */
export function resolveInstalledPackageDir(name, fromDir) {
  if (!isBarePackageName(name)) return null;
  return findNodeModulesPackage(fromDir, name);
}

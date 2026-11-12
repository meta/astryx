// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Whether a project may load an integration, decided from a few file
 *   checks before anything heavy loads.
 * @input The working folder.
 * @output `mayHaveIntegrations(cwd)`: false only when the project root (the
 *   nearest package.json's folder, else `cwd`) has no Astryx config, is no
 *   integration itself, and declares no installed dependency that ships an
 *   integration manifest, so no configured, self-resolved or autolinked
 *   integration can load.
 * @position Read by foundation/fs/gather-cache.mjs: `component`, `template`,
 *   `theme` and `discover` record a run only for their integrations' kept
 *   check results, so a project with none skips the recorder entirely. A true
 *   answer only means the run records, so a check that says true too often
 *   costs time, never an answer.
 */

import {CONFIG_BASENAMES} from '../config/config-path.mjs';
import {findPackageRoot} from '../fs/paths.mjs';
import {findPresentFiles} from '../fs/present-files.mjs';
import {readDeclaredDependencies} from './declared-dependencies.mjs';
import {resolveInstalledPackageDir} from './installed-package.mjs';
import {MANIFEST_BASENAMES} from './manifest-paths.mjs';

/**
 * @param {string} cwd
 * @returns {boolean}
 */
export function mayHaveIntegrations(cwd) {
  const root = findPackageRoot(cwd) ?? cwd;
  if (findPresentFiles(root, CONFIG_BASENAMES).length > 0) return true;
  if (findPresentFiles(root, MANIFEST_BASENAMES).length > 0) return true;
  for (const {name} of readDeclaredDependencies(root)) {
    const installed = resolveInstalledPackageDir(name, root);
    if (
      installed &&
      findPresentFiles(installed.packageDir, MANIFEST_BASENAMES).length > 0
    ) {
      return true;
    }
  }
  return false;
}

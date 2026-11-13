// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Whether a project may load an integration, decided from a few file
 *   checks before anything heavy loads.
 * @input The working folder.
 * @output `mayHaveIntegrations(cwd)`: false only when the project root (the
 *   nearest package.json's folder, else `cwd`) has no Astryx config, is no
 *   integration itself, declares no installed dependency that ships an
 *   integration manifest, and the run is inside a project (outside one, the
 *   integrations installed beside the running CLI load, spec AST-081 FR12),
 *   so no configured, self-resolved, autolinked or computer-level integration
 *   can load.
 * @position Read by clients/cli/index.mjs, which loads the project before
 *   help and before each command only where an integration can load (to read
 *   the commands integrations declare), and by foundation/fs/gather-cache.mjs:
 *   `component`, `template`, `theme`, `discover` and `docs` record a run only
 *   for what is worth keeping where
 *   an integration can load (its kept check results, and template
 *   discovery's records), so a project with none skips the recorder entirely. A true
 *   answer only means the run records, so a check that says true too often
 *   costs time, never an answer.
 */

import {CONFIG_BASENAMES} from '../config/config-path.mjs';
import {isOutsideProject} from '../env/project-scope.mjs';
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
  return isOutsideProject(cwd);
}

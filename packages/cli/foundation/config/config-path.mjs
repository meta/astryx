// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file config-path.mjs
 * @input A directory inside a project
 * @output Exports CONFIG_BASENAMES and findConfigPath
 * @position The config-file lookup of project.mjs, which re-exports both. The
 *   bin's debug preload reads it before it decides to load the project.
 */

import * as path from 'node:path';
import {findPresentFiles} from '../fs/present-files.mjs';
import {findPackageRoot} from '../fs/paths.mjs';

/** Conventional config basenames, in load-precedence order. */
export const CONFIG_BASENAMES = [
  'astryx.config.ts',
  'astryx.config.mjs',
  'astryx.config.js',
];

/**
 * Find astryx.config.{ts,mjs,js} as a sibling of the nearest package.json.
 * Returns the absolute path, or null if none is present. Throws if multiple
 * config files exist at that root.
 * @param {string} [startDir]
 * @returns {string|null}
 */
export function findConfigPath(startDir = process.cwd()) {
  const root = findPackageRoot(startDir) ?? startDir;
  const present = findPresentFiles(root, CONFIG_BASENAMES);
  if (present.length > 1) {
    throw new Error(
      `Multiple Astryx config files found in ${root} (${present
        .map(p => path.basename(p))
        .join(', ')}). Keep exactly one.`,
    );
  }
  return present.length === 1 ? present[0] : null;
}

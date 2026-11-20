// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The esbuild that builds a rendered page's script. The CLI depends on
 * esbuild, but only `astryx experimental export` loads it, by dynamic import
 * in the page's worker, so no other command pays for it at startup.
 * @position foundation/render — used by render-page.mjs
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {fileURLToPath} from 'node:url';
import {findInstalledPackage} from '../fs/paths.mjs';

/** The folder of the CLI's own modules, from which its esbuild resolves. */
export const CLI_DIR = fileURLToPath(new URL('../..', import.meta.url));

/**
 * The entry file of the esbuild the CLI depends on, or null when the install
 * left it out.
 * @param {string} [from] the folder it resolves from (default: the CLI's)
 * @returns {string | null}
 */
export function findEsbuild(from = CLI_DIR) {
  const packageDir = findInstalledPackage(from, 'esbuild');
  if (!packageDir) return null;
  let main = 'lib/main.js';
  try {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(packageDir, 'package.json'), 'utf8'),
    );
    if (typeof pkg.main === 'string') main = pkg.main;
  } catch {
    // A copy without a readable package.json loads from its usual entry.
  }
  return path.join(packageDir, main);
}

/** Why a render has no esbuild to build the page's script with. */
export const ESBUILD_MISSING =
  'esbuild, which the CLI uses to build the page\u2019s script, is not installed beside the CLI; install the CLI again, with its dependencies';

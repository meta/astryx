// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Packs this CLI the way it is published, for tests that place copies
 * of it.
 * @input packages/cli as it is on disk.
 * @output `packCli(dir)`: the path of the `.tgz` that `npm pack` writes to
 *   `dir`.
 * @position Used by vitest.global-setup.node.mjs, which packs once for a
 *   whole node-project run, and by global-local-fixtures.mjs when no run
 *   provided a tarball.
 */

import {spawnSync} from 'node:child_process';
import * as path from 'node:path';
import {fileURLToPath} from 'node:url';

/** This CLI package's folder. */
const CLI_DIR = fileURLToPath(new URL('..', import.meta.url));

/**
 * Pack this CLI into `dir` with `npm pack`, as a release is packed.
 * @param {string} dir an existing folder for the tarball
 * @returns {string} the tarball's path
 */
export function packCli(dir) {
  const result = spawnSync(
    process.platform === 'win32' ? 'npm.cmd' : 'npm',
    ['pack', '--ignore-scripts', '--json', '--pack-destination', dir],
    {cwd: CLI_DIR, encoding: 'utf8', shell: process.platform === 'win32'},
  );
  if (result.status !== 0) {
    throw new Error(`npm pack failed: ${result.stderr}`);
  }
  const [{filename}] = JSON.parse(result.stdout);
  return path.join(dir, filename);
}

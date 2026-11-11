// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Packs this CLI the way it is published, for tests that place copies
 * of it.
 * @input packages/cli as it is on disk.
 * @output `packCli(dir)`: the path of the `.tgz` that `npm pack` writes to
 *   `dir`, holding what `prepack` writes (`PREPACK_FILES`).
 * @position Used by vitest.global-setup.node.mjs, which packs once for a
 *   whole node-project run, and by global-local-fixtures.mjs when no run
 *   provided a tarball.
 */

import {spawnSync} from 'node:child_process';
import * as fs from 'node:fs';
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
  // What `prepack` writes into the package, written here as it would be
  // (`--ignore-scripts` skips prepack, whose type step rewrites the tree), and
  // removed again afterwards as `postpack` does.
  const written = PREPACK_FILES.filter(
    ({file}) => !fs.existsSync(path.join(CLI_DIR, file)),
  );
  try {
    for (const {script} of written) {
      const result = spawnSync(process.execPath, [script], {
        cwd: CLI_DIR,
        encoding: 'utf8',
      });
      if (result.status !== 0) {
        throw new Error(`${script} failed: ${result.stderr}`);
      }
    }
    return npmPack(dir);
  } finally {
    for (const {file} of written) {
      fs.rmSync(path.join(CLI_DIR, file), {force: true});
    }
  }
}

/**
 * The files `prepack` writes into the published package, each with the
 * script that writes it.
 * @type {{file: string, script: string}[]}
 */
export const PREPACK_FILES = [
  {
    file: 'assets/templates/components.generated.json',
    script: 'scripts/generate-template-components.mjs',
  },
];

/**
 * @param {string} dir
 * @returns {string} the tarball's path
 */
function npmPack(dir) {
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

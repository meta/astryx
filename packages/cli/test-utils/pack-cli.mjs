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
import * as os from 'node:os';
import * as path from 'node:path';
import {fileURLToPath} from 'node:url';

/** This CLI package's folder. */
const CLI_DIR = fileURLToPath(new URL('..', import.meta.url));

/** The repository's folder, two levels above the package. */
const REPO_DIR = path.resolve(CLI_DIR, '..', '..');

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
 * Pack this CLI into `dir` with `npm pack`, as a release is packed.
 *
 * It packs a copy of the package, with what `prepack` writes generated into
 * the copy (`--ignore-scripts` skips prepack, whose type step rewrites the
 * tree). The checkout never holds those files, so another run of the same
 * checkout keeps reading its sources while this one packs.
 * @param {string} dir an existing folder for the tarball
 * @returns {string} the tarball's path
 */
export function packCli(dir) {
  const stage = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-cli-pack-'));
  try {
    const copy = path.join(stage, 'packages', 'cli');
    const ownModules = path.join(CLI_DIR, 'node_modules');
    fs.cpSync(CLI_DIR, copy, {
      recursive: true,
      filter: source =>
        path.resolve(source) !== path.resolve(ownModules) &&
        !PREPACK_FILES.some(
          ({file}) => path.resolve(source) === path.join(CLI_DIR, file),
        ),
    });
    // What the copy's scripts resolve: the package's dependencies, the
    // repository's, and Core beside it.
    const link = (/** @type {string} */ target, /** @type {string} */ at) => {
      if (!fs.existsSync(target)) return;
      fs.mkdirSync(path.dirname(at), {recursive: true});
      fs.symlinkSync(
        target,
        at,
        process.platform === 'win32' ? 'junction' : 'dir',
      );
    };
    link(ownModules, path.join(copy, 'node_modules'));
    link(path.join(REPO_DIR, 'node_modules'), path.join(stage, 'node_modules'));
    link(
      path.join(REPO_DIR, 'packages', 'core'),
      path.join(stage, 'packages', 'core'),
    );
    for (const {file, script} of PREPACK_FILES) {
      const result = spawnSync(process.execPath, [script], {
        cwd: copy,
        encoding: 'utf8',
      });
      if (result.status !== 0) {
        throw new Error(`${script} failed: ${result.stderr}`);
      }
      // A generator that exits 0 without writing would ship a package
      // without its file: fail here instead.
      if (!fs.existsSync(path.join(copy, file))) {
        throw new Error(`${script} wrote no ${file}`);
      }
    }
    return npmPack(copy, dir);
  } finally {
    fs.rmSync(stage, {recursive: true, force: true});
  }
}

/**
 * @param {string} from the package folder to pack
 * @param {string} dir
 * @returns {string} the tarball's path
 */
function npmPack(from, dir) {
  const result = spawnSync(
    process.platform === 'win32' ? 'npm.cmd' : 'npm',
    ['pack', '--ignore-scripts', '--json', '--pack-destination', dir],
    {cwd: from, encoding: 'utf8', shell: process.platform === 'win32'},
  );
  if (result.status !== 0) {
    throw new Error(`npm pack failed: ${result.stderr}`);
  }
  const [{filename}] = JSON.parse(result.stdout);
  return path.join(dir, filename);
}

// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The CLI as a published install: the run's shared tarball
 * (./global-local-fixtures.mjs cliTarball, packed by ./pack-cli.mjs with
 * every file `prepack` writes, the build id among them), unpacked into a
 * node_modules folder of its own.
 */

import {spawnSync} from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {cliTarball} from './global-local-fixtures.mjs';
import {CLI_ROOT} from '../foundation/fs/paths.mjs';

/**
 * Unpack the CLI into `work`, with the CLI's own dependencies linked in as an
 * install would place them.
 * @param {string} work
 * @returns {string} the unpacked package folder
 */
export function packPublishedCli(work) {
  // The run's shared tarball (the node project's global setup packs it once,
  // with every file `prepack` writes, the build id among them).
  fs.copyFileSync(cliTarball(), path.join(work, 'cli.tgz'));
  const untar = spawnSync('tar', ['-xzf', 'cli.tgz'], {
    cwd: work,
    encoding: 'utf8',
  });
  if (untar.status !== 0) throw new Error(`tar failed: ${untar.stderr}`);
  // Installed as a package manager places it, in a node_modules folder: only
  // an installed package keeps catalogs.
  // Its own install folder, above no project a test makes in `work`: a
  // project finds a CLI in a node_modules folder above it and hands off to it.
  const packed = path.join(
    work,
    'install',
    'node_modules',
    '@astryxdesign',
    'cli',
  );
  fs.mkdirSync(path.dirname(packed), {recursive: true});
  fs.renameSync(path.join(work, 'package'), packed);
  fs.symlinkSync(ownModules(), path.join(packed, 'node_modules'), 'dir');
  return packed;
}

/** @returns {string} this package's installed dependencies */
function ownModules() {
  return path.join(CLI_ROOT, 'node_modules');
}

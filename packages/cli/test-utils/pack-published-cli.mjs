// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Pack the CLI with its build id, as `prepack` writes it for a published
 * package, and unpack it. It packs a copy of the package, so the id lands in
 * the copy and never in the checkout, where other runs keep reading their
 * sources and keep no catalogs. (./pack-cli.mjs packs the run's shared
 * tarball, without an id.)
 */

import {spawnSync} from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {CLI_ROOT} from '../foundation/fs/paths.mjs';

/** The repository's folder, two levels above the package. */
const REPO_DIR = path.resolve(CLI_ROOT, '..', '..');

/**
 * Pack the CLI into `work` and unpack it there, with the CLI's own
 * dependencies linked in as an install would place them.
 * @param {string} work
 * @returns {string} the unpacked package folder
 */
export function packPublishedCli(work) {
  const stage = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-cli-publish-'));
  try {
    const copy = path.join(stage, 'packages', 'cli');
    const ownModules = path.join(CLI_ROOT, 'node_modules');
    fs.cpSync(CLI_ROOT, copy, {
      recursive: true,
      filter: source => path.resolve(source) !== path.resolve(ownModules),
    });
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
    const id = spawnSync(process.execPath, ['scripts/generate-build-id.mjs'], {
      cwd: copy,
      encoding: 'utf8',
    });
    if (id.status !== 0) throw new Error(`build id failed: ${id.stderr}`);
    if (
      !fs.existsSync(
        path.join(copy, 'clients', 'cli', 'build-id.generated.json'),
      )
    ) {
      throw new Error('scripts/generate-build-id.mjs wrote no build id');
    }
    const pack = spawnSync(
      process.platform === 'win32' ? 'npm.cmd' : 'npm',
      ['pack', '--ignore-scripts', '--pack-destination', work],
      {cwd: copy, encoding: 'utf8', shell: process.platform === 'win32'},
    );
    if (pack.status !== 0) throw new Error(`npm pack failed: ${pack.stderr}`);
  } finally {
    fs.rmSync(stage, {recursive: true, force: true});
  }
  const tarball = fs.readdirSync(work).find(f => f.endsWith('.tgz'));
  if (!tarball) throw new Error('npm pack wrote no tarball');
  const untar = spawnSync('tar', ['-xzf', tarball], {
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

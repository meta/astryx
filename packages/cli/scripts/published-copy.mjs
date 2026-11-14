// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A copy holding exactly the files the package publishes, for the
 *   generators that store at `prepack` what the CLI's own files give
 *   (scripts/generate-self-audit.mjs, scripts/generate-docs-routes.mjs): what
 *   they read there, folders included, is what an installed package holds.
 */

import {spawnSync} from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {CLI_ROOT} from '../foundation/fs/paths.mjs';

/** The repository's folder, two levels above the package. */
const REPO_DIR = path.resolve(CLI_ROOT, '..', '..');

/**
 * The files the package publishes, by path in the package.
 * @returns {string[]}
 */
function publishedFiles() {
  const result = spawnSync(
    process.platform === 'win32' ? 'npm.cmd' : 'npm',
    ['pack', '--dry-run', '--json', '--ignore-scripts'],
    {
      cwd: CLI_ROOT,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      shell: process.platform === 'win32',
    },
  );
  if (result.status !== 0) {
    throw new Error(`npm pack --dry-run failed: ${result.stderr}`);
  }
  const [{files}] = JSON.parse(result.stdout);
  return files.map((/** @type {{path: string}} */ f) => f.path);
}

/**
 * Run `fn` on a copy of the published files, with the package's and the
 * repository's dependencies and Core linked beside it as in the checkout,
 * then remove the copy.
 * @template T
 * @param {string} prefix the temporary folder's name prefix
 * @param {(copy: {stage: string, pkg: string}) => T} fn `pkg`: the copy's
 *   package folder; `stage`: the folder above, a stand-in repository
 * @returns {T}
 */
export function withPublishedCopy(prefix, fn) {
  const stage = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  try {
    const pkg = path.join(stage, 'packages', 'cli');
    for (const file of publishedFiles()) {
      fs.mkdirSync(path.dirname(path.join(pkg, file)), {recursive: true});
      fs.copyFileSync(path.join(CLI_ROOT, file), path.join(pkg, file));
    }
    const link = (/** @type {string} */ target, /** @type {string} */ at) => {
      if (!fs.existsSync(target)) return;
      fs.mkdirSync(path.dirname(at), {recursive: true});
      fs.symlinkSync(
        target,
        at,
        process.platform === 'win32' ? 'junction' : 'dir',
      );
    };
    link(path.join(CLI_ROOT, 'node_modules'), path.join(pkg, 'node_modules'));
    link(path.join(REPO_DIR, 'node_modules'), path.join(stage, 'node_modules'));
    link(
      path.join(REPO_DIR, 'packages', 'core'),
      path.join(stage, 'packages', 'core'),
    );
    return fn({stage, pkg});
  } finally {
    fs.rmSync(stage, {recursive: true, force: true});
  }
}

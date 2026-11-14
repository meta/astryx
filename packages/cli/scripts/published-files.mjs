// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The files a package publishes, and a copy of exactly those files: what
 * the generators that store an answer at `prepack` work on, so what they read,
 * folders included, is what an install holds (generate-self-audit.mjs,
 * generate-component-list.mjs).
 */

import {spawnSync} from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * The files the package in `packageDir` publishes, by path in the package.
 * @param {string} packageDir
 * @returns {string[]}
 */
export function publishedFiles(packageDir) {
  const result = spawnSync(
    process.platform === 'win32' ? 'npm.cmd' : 'npm',
    ['pack', '--dry-run', '--json', '--ignore-scripts'],
    {
      cwd: packageDir,
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
 * Copy exactly the files the package in `packageDir` publishes into `dest`.
 * @param {string} packageDir
 * @param {string} dest
 */
export function copyPublishedFiles(packageDir, dest) {
  for (const file of publishedFiles(packageDir)) {
    fs.mkdirSync(path.dirname(path.join(dest, file)), {recursive: true});
    fs.copyFileSync(path.join(packageDir, file), path.join(dest, file));
  }
}

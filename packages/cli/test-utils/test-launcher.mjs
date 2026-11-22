// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The package manager a node-project run tells its tests started it.
 *   The CLI reads that from `npm_config_user_agent`, which each package
 *   manager sets on the processes it starts, and prints commands for it. A
 *   direct or editor launch sets none and `npx vitest` sets npm's, so either
 *   would print other commands than a run started with pnpm; the run pins the
 *   repository's own.
 * @input The repository root (its package.json `packageManager`).
 * @output `repositoryUserAgent(root)`: a user agent naming that package
 *   manager and version, this Node and this platform.
 * @position Used by vitest.global-setup.node.mjs before the workers fork.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * @param {string} root
 * @returns {string}
 */
export function repositoryUserAgent(root) {
  const {packageManager} = JSON.parse(
    fs.readFileSync(path.join(root, 'package.json'), 'utf8'),
  );
  const [name, version] = String(packageManager).split('@');
  return `${name}/${version} node/${process.version} ${process.platform} ${process.arch}`;
}

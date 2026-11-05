// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Tests Vercel's workspace install-cache cleanup.
 * @input A temporary repository-shaped directory.
 * @output Confirms workspace node_modules are removed without broad traversal.
 * @position Regression coverage for incomplete Vercel dependency caches.
 */

import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {expect, it} from 'vitest';
import {cleanWorkspaceNodeModules} from './clean-workspace-node-modules.mjs';

it('removes only root and direct workspace node_modules directories', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'astryx-clean-install-'));

  try {
    writeFileSync(path.join(root, 'pnpm-workspace.yaml'), 'packages: []\n');
    for (const relative of [
      'node_modules/broken',
      'apps/docsite/node_modules/broken',
      'packages/core/node_modules/broken',
      'packages/themes/stone/node_modules/broken',
      'internal/tool/node_modules/broken',
      'apps/docsite/fixtures/node_modules/keep',
    ]) {
      mkdirSync(path.join(root, relative), {recursive: true});
    }

    cleanWorkspaceNodeModules(root);

    expect(existsSync(path.join(root, 'node_modules'))).toBe(false);
    expect(existsSync(path.join(root, 'apps/docsite/node_modules'))).toBe(
      false,
    );
    expect(existsSync(path.join(root, 'packages/core/node_modules'))).toBe(
      false,
    );
    expect(
      existsSync(path.join(root, 'packages/themes/stone/node_modules')),
    ).toBe(false);
    expect(existsSync(path.join(root, 'internal/tool/node_modules'))).toBe(
      false,
    );
    expect(
      existsSync(path.join(root, 'apps/docsite/fixtures/node_modules/keep')),
    ).toBe(true);
  } finally {
    rmSync(root, {force: true, recursive: true});
  }
});

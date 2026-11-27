// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A node-project run tells its tests the repository's own package
 * manager started them, however the run itself was started.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {describe, expect, it} from 'vitest';
import {detectPackageManager} from '../foundation/env/package-manager.mjs';
import {REPO_ROOT} from './repo-root.mjs';
import {repositoryUserAgent} from './test-launcher.mjs';

describe('the run launcher', () => {
  it('names the repository package manager and version', () => {
    expect(repositoryUserAgent(REPO_ROOT)).toMatch(
      /^pnpm\/\d+\.\d+\.\d+ node\//,
    );
  });

  it('is what this worker reads as the package manager that started it', () => {
    expect(process.env.npm_config_user_agent).toBe(
      repositoryUserAgent(REPO_ROOT),
    );
    // A folder with no project of its own takes the package manager that
    // started the run.
    const bare = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-launcher-'));
    try {
      expect(detectPackageManager(bare)).toBe('pnpm');
    } finally {
      fs.rmSync(bare, {recursive: true, force: true});
    }
  });
});

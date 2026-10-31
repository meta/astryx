// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file actionGroupTracker.exports.test.ts
 * @input The core package's hooks entry point and its package exports
 * @output Proof that the action-group tracker stays internal: neither the
 *   hooks entry point nor the package's `exports` map reaches it
 * @position Export lock for /packages/core/src/hooks/actionGroupTracker.ts
 */

import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {describe, expect, it} from 'vitest';
import * as hooks from './index';

describe('the action-group tracker is internal to core', () => {
  it('is not exported from the hooks entry point', () => {
    expect(Object.keys(hooks)).not.toContain('createActionGroupTracker');
  });

  it('has no package export of its own', () => {
    const manifest = readFileSync(
      resolve(__dirname, '../../package.json'),
      'utf8',
    );
    expect(manifest).not.toContain('actionGroupTracker');
  });
});

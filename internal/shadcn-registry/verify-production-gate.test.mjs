// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The hidden production registry gate runs with the unit tests.
 *
 * `verify-production-gate.mjs` is network-free and needs no build: it proves
 * the production target emits unlinked routes with exact released
 * dependencies and replaces stale output (spec:AST-026). It runs here on every
 * pull request that reaches the Node suite; the full install of every item
 * (test-registry-e2e) runs for release-check.
 */

import {execFileSync} from 'node:child_process';
import path from 'node:path';

import {describe, expect, it} from 'vitest';

describe('hidden production registry gate', () => {
  it('passes', () => {
    const output = execFileSync(
      process.execPath,
      [path.join(import.meta.dirname, 'verify-production-gate.mjs')],
      {encoding: 'utf8'},
    );
    expect(output).toContain(
      'Verified production emits hidden ShadCN routes with exact release dependencies.',
    );
  });
});

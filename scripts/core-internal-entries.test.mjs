// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file core-internal-entries.test.mjs
 * @input The repository's ESLint config
 * @output Pins who may import Core's internal entries
 *   (`@astryxdesign/core/internal/*`, spec:AST-017 FR21,
 *   architecture:react-component-runtime INV13): only Core and Lab, through
 *   the shared `@astryx/no-core-internal-import` rule
 * @position Node test over the lint config, so it needs no build; the rule's
 *   own cases live beside it in internal/eslint-plugin-astryx
 */

import {createRequire} from 'node:module';
import path from 'node:path';
import {describe, expect, it} from 'vitest';

const REPO = path.resolve(import.meta.dirname, '..');
const require = createRequire(path.join(REPO, 'package.json'));
const {ESLint} = require('eslint');

const eslint = new ESLint({cwd: REPO});
const RULE = '@astryx/no-core-internal-import';

/** The rule's severity as the repository's config resolves it for `file`. */
async function severityAt(file) {
  const config = await eslint.calculateConfigForFile(path.join(REPO, file));
  const setting = config.rules?.[RULE];
  const level = Array.isArray(setting) ? setting[0] : setting;
  return level === 2 || level === 'error'
    ? 'error'
    : level === 1 || level === 'warn'
      ? 'warn'
      : 'off';
}

describe('core internal entries in lint', () => {
  it('are refused outside Core and Lab', async () => {
    for (const file of [
      'apps/docsite/src/Example.tsx',
      'packages/charts/src/Example.tsx',
    ]) {
      expect(await severityAt(file), file).toBe('error');
    }
  });

  it('are allowed in Core and Lab', async () => {
    for (const file of [
      'packages/lab/src/Example/Example.tsx',
      'packages/core/src/Example/Example.tsx',
    ]) {
      expect(await severityAt(file), file).toBe('off');
    }
  });
});

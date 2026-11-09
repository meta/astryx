// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `validateInstalledIntegration` reads an installed package's icon sets
 * only when the project opts in with `experimental.iconSet` (spec:AST-017
 * FR27, spec:AST-084 FR0, FR17); `iconSets: true` (pack-check's packed copy)
 * checks them whatever the project says.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import {validateInstalledIntegration} from './validate-integration.mjs';
import {writeIconSetProject} from '../../test-utils/icon-set-fixture.mjs';

/** @type {string} */
let tmp;
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-validate-installed-'));
});
afterEach(() => {
  fs.rmSync(tmp, {recursive: true, force: true});
});

/** @param {boolean} optIn */
function project(optIn) {
  // Each project its own folder: a config module is imported once per path.
  return writeIconSetProject(path.join(tmp, optIn ? 'opted-in' : 'without'), {
    config: {
      integrations: ['@acme/glyphs'],
      ...(optIn ? {experimental: {iconSet: 'glyphs'}} : {}),
    },
  });
}

/** @param {{issues: Array<{code: string}>}} result */
const iconCodes = result =>
  result.issues.map(issue => issue.code).filter(code => /icon/u.test(code));

describe('an installed package with icon sets', () => {
  it('is checked for them only when the project sets experimental.iconSet', async () => {
    const without = await validateInstalledIntegration(
      '@acme/glyphs',
      project(false),
    );
    expect(iconCodes(without)).toEqual([]);
    expect(without).not.toHaveProperty('iconSets');
    expect(without.integration?.iconSets).toBeUndefined();

    const opted = await validateInstalledIntegration(
      '@acme/glyphs',
      project(true),
    );
    expect(iconCodes(opted)).toContain('icon_builtin_definition_missing');
    expect(opted.iconSets).toEqual([expect.objectContaining({set: 'glyphs'})]);
  });

  it('is checked with iconSets: true whatever the project says', async () => {
    const forced = await validateInstalledIntegration(
      '@acme/glyphs',
      project(false),
      {iconSets: true},
    );
    expect(iconCodes(forced)).toContain('icon_builtin_definition_missing');
  });
});

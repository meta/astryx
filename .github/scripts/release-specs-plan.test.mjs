// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Unit tests for release-specs-plan.mjs: which release specs a change
 *   runs (spec:AST-030 FR32).
 * @position A release spec runs when the change adds or changes it, or a
 *   module it imports; an import graph that cannot be built runs them all.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {describe, expect, it} from 'vitest';

import {proofImporters} from './a11y-pr-contracts.mjs';
import {isReleaseSpec, planReleaseSpecs} from './release-specs-plan.mjs';

const SPEC =
  'packages/core/src/Table/__tests__/Table.release.a11y.chromium.spec.ts';
const OTHER =
  'packages/core/src/List/__tests__/List.release.a11y.chromium.spec.ts';

/** A scratch checkout holding `files`, planned with the real import graph. */
function planIn(files, changed) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'release-plan-'));
  for (const [file, text] of Object.entries(files)) {
    fs.mkdirSync(path.join(root, path.dirname(file)), {recursive: true});
    fs.writeFileSync(path.join(root, file), text);
  }
  const listed = Object.keys(files);
  return planReleaseSpecs({
    listed,
    changed,
    importers: () => proofImporters({root, listed, isProof: isReleaseSpec}),
  });
}

const TREE = {
  [SPEC]: "import {startRowFixture} from './Table.release.harness';\n",
  'packages/core/src/Table/__tests__/Table.release.harness.ts':
    "import {rows} from '../tableRows';\nexport const startRowFixture = rows;\n",
  'packages/core/src/Table/tableRows.ts': 'export const rows = 1;\n',
  'packages/core/src/Table/Table.tsx': 'export const Table = 1;\n',
  [OTHER]: '\n',
};

describe('planReleaseSpecs', () => {
  it('names a release spec', () => {
    expect(isReleaseSpec(SPEC)).toBe(true);
    expect(
      isReleaseSpec('packages/core/src/Table/Table.release.harness.ts'),
    ).toBe(false);
    expect(
      isReleaseSpec(
        'packages/core/src/Table/__tests__/Table.a11y.chromium.spec.ts',
      ),
    ).toBe(false);
  });

  it('runs a release spec the change adds or changes', () => {
    expect(planIn(TREE, [SPEC]).specs).toEqual([SPEC]);
  });

  it('runs a release spec that imports a changed module, directly or through its harness', () => {
    expect(
      planIn(TREE, [
        'packages/core/src/Table/__tests__/Table.release.harness.ts',
      ]).specs,
    ).toEqual([SPEC]);
    expect(
      planIn(TREE, ['packages/core/src/Table/tableRows.ts']).specs,
    ).toEqual([SPEC]);
  });

  it('runs no release spec for a module none imports', () => {
    expect(planIn(TREE, ['packages/core/src/Table/Table.tsx'])).toEqual({
      specs: [],
      reason: 'no release spec, and no module a release spec imports, changed',
    });
  });

  it('runs every release spec when the imports cannot be followed', () => {
    const plan = planReleaseSpecs({
      listed: Object.keys(TREE),
      changed: ['packages/core/src/Table/Table.tsx'],
      importers: () => {
        throw new Error('ENOENT: tableRows.ts');
      },
    });
    expect(plan.specs).toEqual([OTHER, SPEC].sort());
    expect(plan.reason).toContain('every release spec runs');
  });

  it('runs nothing for a deleted release spec', () => {
    const {[SPEC]: _deleted, ...rest} = TREE;
    expect(planIn(rest, [SPEC]).specs).toEqual([]);
  });
});

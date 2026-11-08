// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Where `upgrade` and Project still disagree on a provider ID's winner.
 *
 * Both repros are `it.fails`: each asserts the agreeing result, and fails
 * today. `upgrade` lets an `--integration` extra of the same name@version stand
 * in for an autolinked package, from any directory, and orders that extra with
 * the extras. So another extra can take the provider ID in `upgrade` while
 * every other command gives it to the autolinked package. The provider ledger
 * property test carves out exactly this shape.
 *
 * Fixtures live under a repo-local temp dir, not /tmp, because Vite refuses to
 * dynamically import a module from outside the project root.
 */

import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {loadProjectContext} from './_adapter.mjs';
import {Project, providerLedgerOf} from '../../foundation/config/project.mjs';

let tmpDir;
let originalCwd;

beforeEach(() => {
  originalCwd = process.cwd();
  tmpDir = fs.mkdtempSync(
    path.join(process.cwd(), '.astryx-upgrade-agreement-'),
  );
  process.chdir(tmpDir);
});

afterEach(() => {
  process.chdir(originalCwd);
  fs.rmSync(tmpDir, {recursive: true, force: true});
});

/**
 * Install a package under node_modules/<dir>.
 * @param {string} dir
 * @param {{name: string, version: string}} pkg
 * @param {string} manifest manifest module source
 */
function install(dir, pkg, manifest) {
  const pkgDir = path.join(tmpDir, 'node_modules', ...dir.split('/'));
  fs.mkdirSync(pkgDir, {recursive: true});
  fs.writeFileSync(path.join(pkgDir, 'package.json'), JSON.stringify(pkg));
  fs.writeFileSync(path.join(pkgDir, 'astryx.integration.mjs'), manifest);
}

/** An autolinked `@acme/a` and an `@acme/other` that claims its provider ID. */
function autolinkedWithRival() {
  fs.writeFileSync(
    path.join(tmpDir, 'package.json'),
    JSON.stringify({name: 'consumer', dependencies: {'@acme/a': '1.0.0'}}),
  );
  install(
    '@acme/a',
    {name: '@acme/a', version: '1.0.0'},
    'export default {};\n',
  );
  install(
    '@acme/other',
    {name: '@acme/other', version: '1.0.0'},
    "export default {providerId: '@acme/a'};\n",
  );
}

/**
 * The package each resolution lets contribute under a provider ID.
 * @param {Map<string, any>} ledger
 * @param {string} providerId
 */
function winnerOf(ledger, providerId) {
  return [...ledger.values()].find(
    entry => entry.outcome === 'contributes' && entry.providerId === providerId,
  )?.key;
}

/** @param {Array<import('../../foundation/integrations/integrations.mjs').LoadedIntegration>} integrations */
function claims(integrations) {
  return integrations.map(integration => [
    integration.name,
    integration.__providerConflict?.claimedBy ?? null,
  ]);
}

describe('upgrade and Project on an autolinked package named with --integration', () => {
  it('agree when the autolinked package is named first', async () => {
    autolinkedWithRival();
    const project = await Project.load(tmpDir, {fresh: true});
    const upgrade = await loadProjectContext(tmpDir, [
      '@acme/a',
      '@acme/other',
    ]);

    expect(claims(upgrade.integrations)).toEqual([
      ['@acme/a', null],
      ['@acme/other', '@acme/a'],
    ]);
    expect(winnerOf(upgrade.ledger, '@acme/a')).toBe(
      winnerOf(providerLedgerOf(project), '@acme/a'),
    );
  });

  it.fails(
    'agree when an extra that claims its ID is named first',
    async () => {
      autolinkedWithRival();
      const project = await Project.load(tmpDir, {fresh: true});
      // Today upgrade runs @acme/other and reports @acme/a, which every other
      // command uses, as contributing nothing.
      const upgrade = await loadProjectContext(tmpDir, [
        '@acme/other',
        '@acme/a',
      ]);

      expect(winnerOf(upgrade.ledger, '@acme/a')).toBe(
        winnerOf(providerLedgerOf(project), '@acme/a'),
      );
      expect(claims(upgrade.integrations)).toEqual([
        ['@acme/other', '@acme/a'],
        ['@acme/a', null],
      ]);
    },
  );

  it.fails(
    'agree when a copy of it in another directory is named',
    async () => {
      autolinkedWithRival();
      // The same name@version in another directory, with a manifest that fails.
      install(
        '@acme/a-copy',
        {name: '@acme/a', version: '1.0.0'},
        "throw new Error('broken copy');\n",
      );
      const project = await Project.load(tmpDir, {fresh: true});
      // Today the broken copy stands in for @acme/a by name@version, so upgrade
      // has no claimant left for the ID and @acme/other takes it.
      const upgrade = await loadProjectContext(tmpDir, [
        '@acme/a-copy',
        '@acme/other',
      ]);

      expect(winnerOf(upgrade.ledger, '@acme/a')).toBe(
        winnerOf(providerLedgerOf(project), '@acme/a'),
      );
    },
  );
});

// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Colocated tests for the provider resolver: one outcome per real package
 * directory, precedence, and the wrappers that keep their old results.
 *
 * Fixtures live under a repo-local temp dir, not /tmp, because Vite refuses to
 * dynamically import a module from outside the project root.
 */

import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {packageKey, resolveProviders} from './provider-resolution.mjs';
import {markProviderConflicts} from './integrations.mjs';
import {autolinkIntegrations} from './autolink.mjs';
import {Project, providerLedgerOf} from '../config/project.mjs';

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(
    path.join(process.cwd(), '.astryx-provider-resolution-'),
  );
});

afterEach(() => {
  fs.rmSync(tmpDir, {recursive: true, force: true});
});

/**
 * A loaded-integration record in a real directory.
 * @param {string} dir directory under the temp root
 * @param {Record<string, unknown>} fields
 * @returns {any}
 */
function record(dir, fields) {
  const packageDir = path.join(tmpDir, dir);
  fs.mkdirSync(packageDir, {recursive: true});
  return {
    providerId: fields.name,
    __spec: fields.name,
    __packageDir: packageDir,
    __manifestFile: path.join(packageDir, 'astryx.integration.mjs'),
    ...fields,
  };
}

/**
 * @param {string} source
 * @param {any} integration
 */
const candidate = (source, integration) => ({
  source,
  integration,
  spec: integration.__spec,
});

/** @param {Map<string, any>} ledger */
function outcomes(ledger) {
  return [...ledger.values()].map(entry => [entry.label, entry.outcome]);
}

describe('resolveProviders ledger', () => {
  it('records one outcome for every candidate, keyed by real directory', () => {
    const widgets = record('widgets', {
      name: '@acme/widgets',
      version: '1.0.0',
    });
    const renamed = record('renamed', {
      name: '@acme/renamed',
      version: '2.0.0',
      providerId: '@acme/widgets',
    });
    const broken = record('broken', {
      name: '@acme/broken',
      version: '1.0.0',
      __loadError: 'boom',
    });
    const {integrations, ledger} = resolveProviders([
      candidate('configured', widgets),
      candidate('configured', renamed),
      candidate('configured', broken),
    ]);

    expect([...ledger.keys()]).toEqual(
      [widgets, renamed, broken].map(entry => packageKey(entry.__packageDir)),
    );
    expect(outcomes(ledger)).toEqual([
      ['@acme/widgets@1.0.0', 'contributes'],
      ['@acme/renamed@2.0.0', 'set-aside'],
      ['@acme/broken@1.0.0', 'load-failed'],
    ]);
    const setAside = ledger.get(packageKey(renamed.__packageDir));
    expect(setAside).toMatchObject({
      winner: packageKey(widgets.__packageDir),
      reason: 'claimed-earlier',
      integration: integrations[1],
    });
    expect(integrations[1].__providerConflict.claimedBy).toBe('@acme/widgets');
  });

  it('keeps two packages that share a name apart', () => {
    const old = record('widgets-old', {
      name: '@acme/widgets',
      version: '1.0.0',
      __spec: 'widgets-old',
    });
    const next = record('widgets-next', {
      name: '@acme/widgets',
      version: '2.0.0',
      __spec: 'widgets-next',
    });
    const {ledger} = resolveProviders([
      candidate('configured', old),
      candidate('configured', next),
    ]);

    expect(outcomes(ledger)).toEqual([
      ['@acme/widgets@1.0.0', 'contributes'],
      ['@acme/widgets@2.0.0', 'set-aside'],
    ]);
  });

  it('folds every spelling of one real directory into one entry', () => {
    const ui = record('ui', {name: '@acme/ui', version: '0.1.22'});
    const link = path.join(tmpDir, 'legacy-ui');
    fs.symlinkSync(ui.__packageDir, link, 'dir');
    const legacy = {...ui, __spec: '@acme/legacy-ui', __packageDir: link};
    const {integrations, ledger} = resolveProviders([
      candidate('configured', ui),
      candidate('configured', legacy),
    ]);

    expect(integrations).toEqual([ui]);
    expect([...ledger.keys()]).toEqual([packageKey(ui.__packageDir)]);
    const [entry] = ledger.values();
    expect(entry.outcome).toBe('contributes');
    expect(entry.refs.map(ref => ref.spec)).toEqual([
      '@acme/ui',
      '@acme/legacy-ui',
    ]);
  });

  it('records an autolinked copy of a loaded package as alias-of it', () => {
    const ui = record('ui', {name: '@acme/ui', version: '0.1.22'});
    const copy = record('legacy-ui', {
      name: '@acme/ui',
      version: '0.1.22',
      __spec: '@acme/legacy-ui',
      __autolinked: true,
    });
    const {integrations, ledger} = resolveProviders([
      candidate('configured', ui),
      candidate('autolinked', copy),
    ]);

    expect(integrations).toEqual([ui]);
    expect(ledger.get(packageKey(copy.__packageDir))).toMatchObject({
      outcome: 'alias-of',
      aliasOf: packageKey(ui.__packageDir),
    });
  });

  it('records an autolinked package that failed to load, and lists it nowhere', () => {
    const packageDir = path.join(tmpDir, 'unreadable');
    const {integrations, ledger} = resolveProviders([
      {
        source: 'autolinked',
        spec: '@acme/unreadable',
        packageDir,
        error: 'bad json',
      },
    ]);

    expect(integrations).toEqual([]);
    expect(ledger.get(packageKey(packageDir))).toMatchObject({
      outcome: 'load-failed',
      error: 'bad json',
    });
  });

  it('lets the package being authored replace its installed copy and claim first', () => {
    const installed = record('installed', {
      name: '@acme/widgets',
      version: '1.0.0',
    });
    const rival = record('rival', {
      name: '@acme/rival',
      version: '1.0.0',
      providerId: '@acme/widgets',
    });
    const local = record('local', {
      name: '@acme/widgets',
      version: '2.0.0-dev',
      __local: true,
    });
    const {integrations, ledger} = resolveProviders([
      candidate('configured', rival),
      candidate('configured', installed),
      candidate('local', local),
    ]);

    expect(integrations.map(entry => entry.name)).toEqual([
      '@acme/rival',
      '@acme/widgets',
    ]);
    expect(integrations[1]).toBe(local);
    expect(ledger.get(packageKey(installed.__packageDir))).toMatchObject({
      outcome: 'set-aside',
      reason: 'replaced-by-authored',
      winner: packageKey(local.__packageDir),
    });
    expect(ledger.get(packageKey(rival.__packageDir))).toMatchObject({
      outcome: 'set-aside',
      reason: 'authored-claims',
      winner: packageKey(local.__packageDir),
    });
  });

  it('keeps configured precedence ahead of autolinked', () => {
    const configured = record('configured', {
      name: '@acme/one',
      version: '1.0.0',
    });
    const autolinked = record('autolinked', {
      name: '@acme/two',
      version: '1.0.0',
      providerId: '@acme/one',
      __autolinked: true,
    });
    const {ledger} = resolveProviders([
      candidate('configured', configured),
      candidate('autolinked', autolinked),
    ]);

    expect(outcomes(ledger)).toEqual([
      ['@acme/one@1.0.0', 'contributes'],
      ['@acme/two@1.0.0', 'set-aside'],
    ]);
  });

  it('under the codemod policy, records the installed copy standing in', () => {
    const local = record('local', {
      name: '@acme/widgets',
      version: '2.0.0-dev',
      __local: true,
    });
    const installed = record('installed', {
      name: '@acme/widgets',
      version: '1.0.0',
    });
    const {integrations, ledger} = resolveProviders(
      [candidate('configured', local), candidate('installed', installed)],
      {codemods: true},
    );

    expect(integrations).toEqual([installed]);
    expect(ledger.get(packageKey(local.__packageDir))).toMatchObject({
      outcome: 'set-aside',
      reason: 'installed-stands-in',
      winner: packageKey(installed.__packageDir),
    });
  });
});

describe('markProviderConflicts', () => {
  const a = {name: 'a', version: '1', providerId: 'x', __spec: 'a'};
  const b = {name: 'b', version: '1', providerId: 'x', __spec: 'b'};
  const alias = {name: 'a', version: '1', providerId: 'x', __spec: 'a-alias'};
  const local = {
    name: 'l',
    version: '1',
    providerId: 'x',
    __spec: 'l',
    __local: true,
  };
  /** @param {any[]} list */
  const claimsOf = list =>
    markProviderConflicts(list).map(entry => [
      entry?.name ?? null,
      entry?.__providerConflict?.claimedBy ?? null,
    ]);

  it('drops an alias of the winner and keeps a record listed twice', () => {
    expect(claimsOf([a, b, alias, a, undefined])).toEqual([
      ['a', null],
      ['b', 'a'],
      ['a', null],
      [null, null],
    ]);
  });

  it('lets the package being authored claim first', () => {
    expect(claimsOf([a, undefined, b, alias, a, local])).toEqual([
      ['a', 'l'],
      [null, null],
      ['b', 'l'],
      ['a', 'l'],
      ['a', 'l'],
      ['l', null],
    ]);
  });
});

describe('Project.load keeps a ledger', () => {
  /**
   * @param {string} dir node_modules key
   * @param {{name: string, version: string}} pkg
   */
  function install(dir, pkg) {
    const pkgDir = path.join(tmpDir, 'node_modules', ...dir.split('/'));
    fs.mkdirSync(pkgDir, {recursive: true});
    fs.writeFileSync(path.join(pkgDir, 'package.json'), JSON.stringify(pkg));
    fs.writeFileSync(
      path.join(pkgDir, 'astryx.integration.mjs'),
      'export default {};\n',
    );
    return pkgDir;
  }

  it('records the autolink alias it drops as alias-of the loaded copy', async () => {
    fs.writeFileSync(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({
        name: 'consumer',
        dependencies: {
          '@acme/legacy-ui': 'npm:@acme/ui@0.1.22',
          '@acme/ui': '0.1.22',
        },
      }),
    );
    const legacy = install('@acme/legacy-ui', {
      name: '@acme/ui',
      version: '0.1.22',
    });
    const ui = install('@acme/ui', {name: '@acme/ui', version: '0.1.22'});

    const project = await Project.load(tmpDir, {fresh: true});
    expect(project.loadedIntegrations.map(entry => entry.__spec)).toEqual([
      '@acme/legacy-ui',
    ]);
    const ledger = providerLedgerOf(project);
    expect(ledger.get(packageKey(ui))).toMatchObject({
      outcome: 'alias-of',
      aliasOf: packageKey(legacy),
    });
    expect(await autolinkIntegrations({projectDir: tmpDir})).toHaveLength(1);
  });

  it('records a dependency key that repeats a configured package', async () => {
    fs.writeFileSync(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({name: 'consumer', dependencies: {'@acme/ui': '0.1.22'}}),
    );
    fs.writeFileSync(
      path.join(tmpDir, 'astryx.config.mjs'),
      "export default {integrations: ['@acme/ui']};\n",
    );
    const ui = install('@acme/ui', {name: '@acme/ui', version: '0.1.22'});

    const ledger = providerLedgerOf(await Project.load(tmpDir, {fresh: true}));
    expect([...ledger.keys()]).toEqual([packageKey(ui)]);
    expect(ledger.get(packageKey(ui))?.refs.map(ref => ref.source)).toEqual([
      'configured',
      'autolinked',
    ]);
  });
});

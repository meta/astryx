// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Matching a project to a host's package sets (architecture:cli-surface
 * INV30): one root per run, the first that qualifies in the host's order, the
 * versions a project would install, nothing filled that ships an integration
 * manifest, and the integrations a host approves for use outside a project.
 */

import {describe, it, expect, afterEach} from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  cleanupFixtures,
  project,
  tempDir,
  writeJson,
} from '../../test-utils/release-fixtures.mjs';
import {projectAstryxPins} from './locked-versions.mjs';
import {qualifyingRoot, rootPackage, satisfiesInstall} from './package-set.mjs';
import {scanComputerIntegrations} from '../integrations/computer-integrations.mjs';
import {findCoreDir} from '../fs/paths.mjs';
import {
  _resetHostedRun,
  activateHostedRun,
  recordResolved,
  recordResolvedIntegrations,
  resolvedPackages,
} from './package-root.mjs';

afterEach(cleanupFixtures);

/**
 * Write a package into `dir`'s node_modules.
 * @param {string} dir
 * @param {string} name
 * @param {Record<string, unknown>} pkg
 * @param {{manifest?: boolean, bin?: boolean, hostEntry?: boolean}} [options]
 * @returns {string} the package folder
 */
function install(dir, name, pkg, options = {}) {
  const pkgDir = path.join(dir, 'node_modules', ...name.split('/'));
  writeJson(path.join(pkgDir, 'package.json'), {
    name,
    ...pkg,
    ...(options.bin ? {bin: {astryx: './bin.cjs'}} : {}),
  });
  if (options.bin) fs.writeFileSync(path.join(pkgDir, 'bin.cjs'), '');
  if (options.hostEntry) {
    fs.mkdirSync(path.join(pkgDir, 'host'), {recursive: true});
    fs.writeFileSync(path.join(pkgDir, 'host', 'index.mjs'), '');
  }
  if (options.manifest) {
    fs.writeFileSync(
      path.join(pkgDir, 'astryx.integration.mjs'),
      'export default {};\n',
    );
  }
  return pkgDir;
}

/**
 * A package set: a root holding a CLI and Core of `version`.
 * @param {string} version
 * @param {{hostEntry?: boolean, bin?: boolean}} [options]
 * @returns {string}
 */
function packageSet(version, options = {}) {
  const root = tempDir('set');
  install(
    root,
    '@astryxdesign/cli',
    {version},
    {bin: options.bin ?? true, hostEntry: options.hostEntry},
  );
  install(root, '@astryxdesign/core', {version});
  return root;
}

describe('the versions a project would install', () => {
  it('reads each declared @astryxdesign/* package with its lockfile and installed versions', () => {
    const root = project(tempDir(), {
      '@astryxdesign/core': '^0.7.0',
      '@astryxdesign/cli': '0.7.0',
      react: '^19.0.0',
    });
    install(root, '@astryxdesign/cli', {version: '0.7.0'});
    writeJson(path.join(root, 'package-lock.json'), {
      lockfileVersion: 3,
      packages: {
        '': {},
        'node_modules/@astryxdesign/core': {version: '0.7.1'},
        'node_modules/@astryxdesign/cli': {version: '0.7.0'},
      },
    });
    expect(projectAstryxPins(root)).toEqual([
      {
        name: '@astryxdesign/core',
        declared: '^0.7.0',
        locked: '0.7.1',
        installed: null,
      },
      {
        name: '@astryxdesign/cli',
        declared: '0.7.0',
        locked: '0.7.0',
        installed: '0.7.0',
      },
    ]);
  });
});

describe('a version the project would install for a range', () => {
  it.each([
    ['0.7.1', '^0.7.0', true],
    ['0.8.0', '^0.7.0', false],
    ['0.7.1-canary.1', '^0.7.0', false],
    ['0.7.1-canary.1', '^0.7.1-canary.0', true],
    ['0.7.1', 'file:../core', false],
    ['0.7.1', 'workspace:*', false],
    [null, '^0.7.0', false],
  ])('%s for %s: %s', (version, range, expected) => {
    expect(satisfiesInstall(version, range)).toBe(expected);
  });
});

describe('the package set that serves a run another release answers', () => {
  it('serves from the first set whose CLI and Core are that release', () => {
    const older = packageSet('0.6.8');
    const first = packageSet('0.7.0');
    const second = packageSet('0.7.0');
    const root = project(tempDir(), {'@astryxdesign/core': '0.7.0'});
    const served = qualifyingRoot({
      release: '0.7.0',
      projectDir: root,
      roots: [older, first, second],
    });
    expect(served).toMatchObject({root: first, hostEntry: null});
    expect(/** @type {any} */ (served).bin).toBe(
      path.join(first, 'node_modules', '@astryxdesign', 'cli', 'bin.cjs'),
    );
  });

  it('skips a set whose Core is another release, or missing', () => {
    const mixed = tempDir('set');
    install(mixed, '@astryxdesign/cli', {version: '0.7.0'}, {bin: true});
    install(mixed, '@astryxdesign/core', {version: '0.7.1'});
    const bare = tempDir('set');
    install(bare, '@astryxdesign/cli', {version: '0.7.0'}, {bin: true});
    const root = project(tempDir(), {'@astryxdesign/core': '0.7.0'});
    expect(
      qualifyingRoot({
        release: '0.7.0',
        projectDir: root,
        roots: [mixed, bare],
      }),
    ).toEqual({
      reason:
        "no package set the host passed holds CLI 0.7.0 with this project's packages",
    });
  });

  it("holds the lockfile's version of each package it fills, else one in the declared range", () => {
    const locked = project(tempDir(), {
      '@astryxdesign/core': '^0.7.0',
      '@astryxdesign/charts': '^0.7.0',
    });
    writeJson(path.join(locked, 'package-lock.json'), {
      lockfileVersion: 3,
      packages: {
        '': {},
        'node_modules/@astryxdesign/core': {version: '0.7.0'},
        'node_modules/@astryxdesign/charts': {version: '0.7.0'},
      },
    });
    const newer = packageSet('0.7.0');
    install(newer, '@astryxdesign/charts', {version: '0.7.2'});
    const exact = packageSet('0.7.0');
    install(exact, '@astryxdesign/charts', {version: '0.7.0'});
    expect(
      qualifyingRoot({
        release: '0.7.0',
        projectDir: locked,
        roots: [newer, exact],
      }),
    ).toMatchObject({root: exact});

    const ranged = project(tempDir(), {
      '@astryxdesign/core': '^0.7.0',
      '@astryxdesign/charts': '^0.7.0',
    });
    expect(
      qualifyingRoot({release: '0.7.0', projectDir: ranged, roots: [newer]}),
    ).toMatchObject({root: newer});
  });

  it('keeps out a set whose copy the project declares as a path and has not locked', () => {
    const root = project(tempDir(), {
      '@astryxdesign/core': '0.7.0',
      '@astryxdesign/charts': 'file:../charts',
    });
    const set = packageSet('0.7.0');
    install(set, '@astryxdesign/charts', {version: '0.7.0'});
    expect(
      qualifyingRoot({release: '0.7.0', projectDir: root, roots: [set]}),
    ).toHaveProperty('reason');
  });

  it('never fills an @astryxdesign/* integration, so its version never keeps a set out', () => {
    const root = project(tempDir(), {
      '@astryxdesign/core': '0.7.0',
      '@astryxdesign/richtext': '^0.9.0',
    });
    const set = packageSet('0.7.0');
    install(
      set,
      '@astryxdesign/richtext',
      {version: '0.7.0'},
      {manifest: true},
    );
    expect(
      qualifyingRoot({release: '0.7.0', projectDir: root, roots: [set]}),
    ).toMatchObject({root: set});
  });

  it('fills nothing the project installed', () => {
    const root = project(tempDir(), {
      '@astryxdesign/core': '0.7.0',
      '@astryxdesign/charts': '^0.6.0',
    });
    install(root, '@astryxdesign/charts', {version: '0.6.3'});
    const set = packageSet('0.7.0');
    install(set, '@astryxdesign/charts', {version: '0.7.0'});
    expect(
      qualifyingRoot({release: '0.7.0', projectDir: root, roots: [set]}),
    ).toMatchObject({root: set});
  });

  it('needs a host entry when asked to', () => {
    const plain = packageSet('0.7.0');
    const hosted = packageSet('0.7.0', {hostEntry: true});
    const root = project(tempDir(), {'@astryxdesign/core': '0.7.0'});
    expect(
      qualifyingRoot({
        release: '0.7.0',
        projectDir: root,
        roots: [plain, hosted],
        needsHostEntry: true,
      }),
    ).toMatchObject({
      root: hosted,
      hostEntry: path.join(
        hosted,
        'node_modules',
        '@astryxdesign',
        'cli',
        'host',
        'index.mjs',
      ),
    });
  });

  it("reads a root's own node_modules only", () => {
    const outer = tempDir('outer');
    install(outer, '@astryxdesign/core', {version: '0.7.0'});
    const set = path.join(outer, 'set');
    install(set, '@astryxdesign/cli', {version: '0.7.0'}, {bin: true});
    expect(rootPackage(set, '@astryxdesign/core')).toBeNull();
    expect(
      qualifyingRoot({release: '0.7.0', projectDir: null, roots: [set]}),
    ).toHaveProperty('reason');
  });
});

describe('the integrations a host approves', () => {
  it('load by name from the package set that holds the CLI, with the same checks', () => {
    const set = tempDir('set');
    const cliDir = install(set, '@astryxdesign/cli', {version: '0.7.2'});
    // The set declares only the CLI and Core, so FR12's scan finds nothing.
    writeJson(path.join(set, 'package.json'), {
      dependencies: {'@astryxdesign/cli': '0.7.2'},
    });
    install(set, 'acme-widgets', {version: '1.0.0'}, {manifest: true});
    install(
      set,
      'acme-old',
      {version: '1.0.0', peerDependencies: {'@astryxdesign/core': '^0.6.0'}},
      {manifest: true},
    );
    install(set, 'acme-plain', {version: '1.0.0'});
    expect(
      scanComputerIntegrations({cliRoot: cliDir, release: '0.7.2'}),
    ).toEqual([]);
    const found = scanComputerIntegrations({
      cliRoot: cliDir,
      release: '0.7.2',
      approved: ['acme-widgets', 'acme-old', 'acme-plain', 'acme-missing'],
    });
    expect(found.map(c => [c.name, c.incompatible])).toEqual([
      ['acme-widgets', null],
      [
        'acme-old',
        "it needs @astryxdesign/core ^0.6.0, and this computer's CLI is 0.7.2",
      ],
    ]);
    expect(found[0].packageDir).toBe(
      path.join(set, 'node_modules', 'acme-widgets'),
    );
  });

  it('never takes an approved name from a folder above the package set', () => {
    const outer = tempDir('outer');
    install(outer, 'acme-outer', {version: '1.0.0'}, {manifest: true});
    const set = path.join(outer, 'set');
    const cliDir = install(set, '@astryxdesign/cli', {version: '0.7.2'});
    writeJson(path.join(set, 'package.json'), {
      dependencies: {'@astryxdesign/cli': '0.7.2'},
    });
    expect(
      scanComputerIntegrations({
        cliRoot: cliDir,
        release: '0.7.2',
        approved: ['acme-outer'],
      }),
    ).toEqual([]);
  });
});

describe('where each package a hosted run resolved came from', () => {
  afterEach(() => _resetHostedRun());

  /**
   * @param {string} root
   * @param {string} name
   */
  const at = (root, name) =>
    path.join(root, 'node_modules', ...name.split('/'));

  it("names the project's packages as the project's when the host's CLI is installed in the project", () => {
    const app = tempDir('app');
    activateHostedRun({startingRoot: app, projectRoot: app});
    recordResolved('@astryxdesign/cli', '0.7.2', at(app, '@astryxdesign/cli'));
    recordResolved(
      '@astryxdesign/core',
      '0.7.2',
      at(app, '@astryxdesign/core'),
      'project',
    );
    recordResolvedIntegrations([
      {
        name: 'acme-widgets',
        version: '1.0.0',
        __packageDir: at(app, 'acme-widgets'),
      },
    ]);
    expect(resolvedPackages()).toEqual([
      {name: '@astryxdesign/cli', version: '0.7.2', source: 'project'},
      {name: '@astryxdesign/core', version: '0.7.2', source: 'project'},
      {name: 'acme-widgets', version: '1.0.0', source: 'project'},
    ]);
  });

  it("names what a package set holds as the package set's, and the project's integrations as the project's", () => {
    const set = tempDir('set');
    const app = tempDir('app');
    activateHostedRun({startingRoot: set, projectRoot: app});
    recordResolved('@astryxdesign/cli', '0.7.2', at(set, '@astryxdesign/cli'));
    recordResolved(
      '@astryxdesign/core',
      '0.7.2',
      at(set, '@astryxdesign/core'),
    );
    recordResolvedIntegrations([
      {
        name: 'acme-tools',
        version: '2.0.0',
        __packageDir: at(set, 'acme-tools'),
        __computer: true,
      },
      {
        name: 'acme-widgets',
        version: '1.0.0',
        __packageDir: at(app, 'acme-widgets'),
      },
    ]);
    expect(resolvedPackages()).toEqual([
      {name: '@astryxdesign/cli', version: '0.7.2', source: 'package-set'},
      {name: '@astryxdesign/core', version: '0.7.2', source: 'package-set'},
      {name: 'acme-tools', version: '2.0.0', source: 'package-set'},
      {name: 'acme-widgets', version: '1.0.0', source: 'project'},
    ]);
  });

  it("names what the project loaded or found above itself, as a workspace hoists it, as the project's", () => {
    // The host's CLI sits in the workspace root, which is its package set,
    // and the project is a workspace package whose packages are hoisted there.
    const mono = tempDir('mono');
    writeJson(path.join(mono, 'package.json'), {
      private: true,
      workspaces: ['packages/*'],
    });
    const app = path.join(mono, 'packages', 'app');
    writeJson(path.join(app, 'package.json'), {
      name: 'app',
      dependencies: {'@astryxdesign/core': '0.7.2', 'acme-widgets': '1.0.0'},
    });
    install(mono, '@astryxdesign/core', {version: '0.7.2'});
    activateHostedRun({startingRoot: mono, projectRoot: app});
    expect(findCoreDir(app)).toBe(at(mono, '@astryxdesign/core'));
    recordResolvedIntegrations([
      {
        name: 'acme-widgets',
        version: '1.0.0',
        __packageDir: at(mono, 'acme-widgets'),
      },
    ]);
    expect(resolvedPackages()).toEqual([
      {name: '@astryxdesign/core', version: '0.7.2', source: 'project'},
      {name: 'acme-widgets', version: '1.0.0', source: 'project'},
    ]);
  });

  it('names a package set inside the project folder as a package set', () => {
    const app = tempDir('app');
    const set = path.join(app, '.tools', 'astryx');
    activateHostedRun({startingRoot: set, projectRoot: app});
    recordResolved('@astryxdesign/cli', '0.7.2', at(set, '@astryxdesign/cli'));
    expect(resolvedPackages()).toEqual([
      {name: '@astryxdesign/cli', version: '0.7.2', source: 'package-set'},
    ]);
  });
});

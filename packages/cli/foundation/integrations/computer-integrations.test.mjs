// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Computer-level integrations (spec AST-081 FR12): which install root
 * counts, which packages in it are integrations, and the peer-range check.
 */

import {afterEach, describe, expect, it} from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  computerInstallRoot,
  computerInstallRoots,
  loadComputerIntegrations,
  peerProblem,
  scanComputerIntegrations,
} from './computer-integrations.mjs';
import {
  cleanupFixtures,
  tempDir,
  writeJson,
} from '../../test-utils/release-fixtures.mjs';

afterEach(cleanupFixtures);

/**
 * A package at `dir`, with a manifest when `manifest` is set.
 * @param {string} dir
 * @param {Record<string, unknown>} pkg
 * @param {string | null} [manifest]
 */
function pkgAt(dir, pkg, manifest = 'export default {};\n') {
  writeJson(path.join(dir, 'package.json'), pkg);
  if (manifest != null) {
    fs.writeFileSync(path.join(dir, 'astryx.integration.mjs'), manifest);
  }
  return dir;
}

/** An npm-style global folder (no package.json) holding the CLI and others. */
function npmGlobal() {
  const root = path.join(tempDir('prefix'), 'lib');
  const modules = path.join(root, 'node_modules');
  const cli = pkgAt(
    path.join(modules, '@astryxdesign', 'cli'),
    {name: '@astryxdesign/cli', version: '0.8.0'},
    null,
  );
  pkgAt(path.join(modules, '@astryxdesign', 'core'), {
    name: '@astryxdesign/core',
    version: '0.8.0',
  });
  pkgAt(path.join(modules, '@acme', 'widgets'), {
    name: '@acme/widgets',
    version: '1.2.0',
    description: 'Acme widgets',
  });
  pkgAt(path.join(modules, 'plain-tool'), {name: 'plain-tool'}, null);
  pkgAt(path.join(modules, 'zeta-kit'), {
    name: 'zeta-kit',
    version: '2.0.0',
    peerDependencies: {'@astryxdesign/core': '>=9.0.0'},
  });
  return {root, cli};
}

describe('computerInstallRoot', () => {
  it('is the folder whose node_modules holds the CLI; none for a runner cache or a folder outside node_modules', () => {
    const {root, cli} = npmGlobal();
    expect(computerInstallRoot(cli)).toBe(fs.realpathSync(root));
    const runner = pkgAt(
      path.join(
        tempDir('npx'),
        '_npx',
        'ab12',
        'node_modules',
        '@astryxdesign',
        'cli',
      ),
      {name: '@astryxdesign/cli', version: '0.8.0'},
      null,
    );
    expect(computerInstallRoot(runner)).toBeNull();
    expect(computerInstallRoot(tempDir('checkout'))).toBeNull();
  });

  it('is none for a release in the per-user release cache', () => {
    const cacheDir = tempDir('cache');
    const cli = pkgAt(
      path.join(
        cacheDir,
        'releases',
        '0.8.0',
        'node_modules',
        '@astryxdesign',
        'cli',
      ),
      {name: '@astryxdesign/cli', version: '0.8.0'},
      null,
    );
    expect(computerInstallRoot(cli, {cacheDir})).toBeNull();
  });
});

describe('computerInstallRoots', () => {
  it("is pnpm's shared global folder before pnpm 11", () => {
    const g5 = path.join(tempDir('pnpm'), 'global', '5');
    const cli = pkgAt(
      path.join(
        g5,
        '.pnpm',
        '@astryxdesign+cli@0.8.0',
        'node_modules',
        '@astryxdesign',
        'cli',
      ),
      {name: '@astryxdesign/cli', version: '0.8.0'},
      null,
    );
    expect(computerInstallRoots(cli)).toEqual([fs.realpathSync(g5)]);
  });

  it('is every pnpm global folder since pnpm 11, when one of them installs this CLI', () => {
    const home = tempDir('pnpm-home');
    const cli = pkgAt(
      path.join(
        home,
        'store',
        'v11',
        'links',
        '@astryxdesign',
        'cli',
        '0.8.0',
        'h',
        'node_modules',
        '@astryxdesign',
        'cli',
      ),
      {name: '@astryxdesign/cli', version: '0.8.0'},
      null,
    );
    const a = path.join(home, 'global', 'v11', 'a');
    const b = path.join(home, 'global', 'v11', 'b');
    writeJson(path.join(b, 'package.json'), {
      dependencies: {'@acme/widgets': '1.0.0'},
    });
    // No global folder installs this CLI yet: only its own install root.
    expect(computerInstallRoots(cli)).toHaveLength(1);
    writeJson(path.join(a, 'package.json'), {
      dependencies: {'@astryxdesign/cli': '0.8.0'},
    });
    fs.mkdirSync(path.join(a, 'node_modules', '@astryxdesign'), {
      recursive: true,
    });
    fs.symlinkSync(cli, path.join(a, 'node_modules', '@astryxdesign', 'cli'));
    expect(computerInstallRoots(cli)).toEqual([a, b]);
  });

  it("is every pnpm global folder when the CLI's files sit inside its own global folder (pnpm 12)", () => {
    const globalDir = path.join(tempDir('pnpm12'), 'global', 'v11');
    const a = path.join(globalDir, 'a');
    const b = path.join(globalDir, 'b');
    writeJson(path.join(a, 'package.json'), {
      dependencies: {'@astryxdesign/cli': '0.8.0'},
    });
    const cli = pkgAt(
      path.join(
        a,
        'node_modules',
        '.pnpm',
        '@astryxdesign+cli@0.8.0',
        'node_modules',
        '@astryxdesign',
        'cli',
      ),
      {name: '@astryxdesign/cli', version: '0.8.0'},
      null,
    );
    fs.mkdirSync(path.join(a, 'node_modules', '@astryxdesign'), {
      recursive: true,
    });
    fs.symlinkSync(cli, path.join(a, 'node_modules', '@astryxdesign', 'cli'));
    writeJson(path.join(b, 'package.json'), {
      dependencies: {'@acme/widgets': '1.0.0'},
    });
    pkgAt(path.join(b, 'node_modules', '@acme', 'widgets'), {
      name: '@acme/widgets',
      version: '1.0.0',
    });
    expect(computerInstallRoots(cli)).toEqual([
      fs.realpathSync(a),
      fs.realpathSync(b),
    ]);
    expect(
      scanComputerIntegrations({cliRoot: cli, release: '0.8.0'}).map(
        c => c.name,
      ),
    ).toEqual(['@acme/widgets']);
  });
});

describe('scanComputerIntegrations', () => {
  it('lists every package beside the CLI that ships a manifest, never the CLI or Core, and marks an incompatible one', () => {
    const {cli} = npmGlobal();
    const found = scanComputerIntegrations({cliRoot: cli, release: '0.8.0'});
    expect(found.map(c => [c.name, c.version, c.incompatible])).toEqual([
      ['@acme/widgets', '1.2.0', null],
      [
        'zeta-kit',
        '2.0.0',
        "it needs @astryxdesign/core >=9.0.0, and this computer's CLI is 0.8.0",
      ],
    ]);
    expect(found[0].description).toBe('Acme widgets');
  });

  it("reads a door's package set from the root's declared dependencies", () => {
    const root = tempDir('runtime');
    writeJson(path.join(root, 'package.json'), {
      name: 'runtime',
      private: true,
      dependencies: {
        '@astryxdesign/cli': '0.8.0',
        '@astryxdesign/core': '0.8.0',
        '@acme/meta-kit': '3.0.0',
      },
    });
    const modules = path.join(root, 'node_modules');
    const cli = pkgAt(
      path.join(modules, '@astryxdesign', 'cli'),
      {name: '@astryxdesign/cli', version: '0.8.0'},
      null,
    );
    pkgAt(path.join(modules, '@acme', 'meta-kit'), {
      name: '@acme/meta-kit',
      version: '3.0.0',
    });
    // Installed but not declared: not part of the set.
    pkgAt(path.join(modules, 'stray-kit'), {name: 'stray-kit'});
    expect(
      scanComputerIntegrations({cliRoot: cli, release: '0.8.0'}).map(
        c => c.name,
      ),
    ).toEqual(['@acme/meta-kit']);
  });

  it('lists nothing for a copy with no install root', () => {
    expect(
      scanComputerIntegrations({
        cliRoot: tempDir('checkout'),
        release: '0.8.0',
      }),
    ).toEqual([]);
  });
});

describe('peerProblem', () => {
  it('checks the Core and CLI peer ranges against the answering release', () => {
    expect(peerProblem({}, '0.8.0')).toBeNull();
    expect(
      peerProblem(
        {peerDependencies: {'@astryxdesign/core': '^0.8.0'}},
        '0.8.2',
      ),
    ).toBeNull();
    expect(
      peerProblem(
        {peerDependencies: {'@astryxdesign/cli': '>=0.9.0'}},
        '0.8.2',
      ),
    ).toBe(
      "it needs @astryxdesign/cli >=0.9.0, and this computer's CLI is 0.8.2",
    );
    expect(
      peerProblem({peerDependencies: {react: '>=99'}}, '0.8.2'),
    ).toBeNull();
  });
});

describe('loadComputerIntegrations', () => {
  it("loads the compatible ones, marked as the computer's, and leaves out excluded and incompatible ones", async () => {
    const {cli} = npmGlobal();
    const found = scanComputerIntegrations({cliRoot: cli, release: '0.8.0'});
    const loaded = await loadComputerIntegrations(found);
    expect(loaded.map(c => [c.spec, c.integration?.__computer])).toEqual([
      ['@acme/widgets', true],
    ]);
    expect(
      await loadComputerIntegrations(found, {exclude: ['@acme/widgets']}),
    ).toEqual([]);
  });
});

// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, it, expect, afterEach} from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  findDeclaringPackage,
  findLockfile,
  findProjectCli,
  findReadCore,
  lockedVersion,
  readReleaseFacts,
} from './project.mjs';
import {
  cleanupFixtures,
  installCore,
  installStandInCli,
  project,
  tempDir,
  writeJson,
} from '../../test-utils/release-fixtures.mjs';

afterEach(cleanupFixtures);

describe('findReadCore', () => {
  it('finds the installed Core in the folder or up to four above it, and from the declaring package.json at any depth (b30)', () => {
    const root = project(tempDir(), {'@astryxdesign/core': '0.6.8'});
    installCore(root, '0.6.8');
    const deep = path.join(root, 'a', 'b', 'c', 'd');
    fs.mkdirSync(deep, {recursive: true});
    expect(findReadCore(deep)?.version).toBe('0.6.8');
    const tooDeep = path.join(deep, 'e', 'f', 'g');
    fs.mkdirSync(tooDeep, {recursive: true});
    expect(findReadCore(tooDeep)?.version).toBe('0.6.8');
    // With no package.json that declares Astryx, the reach stays four folders.
    const plain = tempDir();
    writeJson(path.join(plain, 'package.json'), {name: 'plain'});
    installCore(plain, '0.6.8');
    const plainDeep = path.join(plain, 'a', 'b', 'c', 'd', 'e');
    fs.mkdirSync(plainDeep, {recursive: true});
    expect(findReadCore(plainDeep)).toBeNull();
  });

  it("skips a workspace's packages/core that is another package", () => {
    const root = tempDir();
    writeJson(path.join(root, 'packages', 'core', 'package.json'), {
      name: '@acme/core',
      version: '1.0.0',
    });
    installCore(root, '0.7.1');
    expect(findReadCore(root)?.version).toBe('0.7.1');
  });

  it("takes a workspace's own CLI package, at the root and inside it (b13)", () => {
    const root = tempDir();
    writeJson(path.join(root, 'package.json'), {name: 'repo', private: true});
    writeJson(path.join(root, 'packages', 'core', 'package.json'), {
      name: '@astryxdesign/core',
      version: '0.7.4',
    });
    writeJson(path.join(root, 'packages', 'cli', 'package.json'), {
      name: '@astryxdesign/cli',
      version: '0.7.4',
    });
    const cliDir = path.join(root, 'packages', 'cli');
    for (const dir of [root, cliDir, path.join(root, 'apps', 'site')]) {
      fs.mkdirSync(dir, {recursive: true});
      expect(findProjectCli(dir)).toEqual({dir: cliDir, version: '0.7.4'});
    }
    writeJson(path.join(root, 'packages', 'cli', 'package.json'), {
      name: 'some-other-cli',
      version: '1.0.0',
    });
    expect(findProjectCli(root)).toBeNull();
  });

  it("takes a workspace's own Core package", () => {
    const root = tempDir();
    writeJson(path.join(root, 'packages', 'core', 'package.json'), {
      name: '@astryxdesign/core',
      version: '0.7.2',
    });
    expect(findReadCore(root)?.dir).toBe(path.join(root, 'packages', 'core'));
  });
});

describe('findDeclaringPackage', () => {
  it('finds the nearest package.json that declares Core or the CLI', () => {
    const root = project(tempDir(), {'@astryxdesign/core': '^0.6.8'});
    const nested = path.join(root, 'tools', 'pkg');
    writeJson(path.join(nested, 'package.json'), {
      name: 'pkg',
      dependencies: {'left-pad': '1'},
    });
    expect(findDeclaringPackage(nested)).toEqual({
      dir: root,
      core: '^0.6.8',
      cli: null,
    });
  });

  it('stops at the first folder with version-control metadata', () => {
    const root = project(tempDir(), {'@astryxdesign/core': '0.6.8'});
    const clone = path.join(root, 'vendor', 'repo');
    fs.mkdirSync(path.join(clone, '.git'), {recursive: true});
    expect(findDeclaringPackage(path.join(clone))).toBeNull();
  });

  it('reads peer and dev dependencies too', () => {
    const root = tempDir();
    writeJson(path.join(root, 'package.json'), {
      name: 'lib',
      peerDependencies: {'@astryxdesign/core': '>=0.7.0'},
      devDependencies: {'@astryxdesign/cli': '0.7.1'},
    });
    expect(findDeclaringPackage(root)).toEqual({
      dir: root,
      core: '>=0.7.0',
      cli: '0.7.1',
    });
  });
});

describe('lockedVersion', () => {
  it('reads an npm lockfile, member entry first', () => {
    const root = tempDir();
    writeJson(path.join(root, 'package-lock.json'), {
      lockfileVersion: 3,
      packages: {
        'node_modules/@astryxdesign/core': {version: '0.7.1'},
        'apps/legacy/node_modules/@astryxdesign/core': {version: '0.6.8'},
      },
    });
    const lock = path.join(root, 'package-lock.json');
    expect(lockedVersion(lock, root, '@astryxdesign/core', '0.7.1')).toBe(
      '0.7.1',
    );
    expect(
      lockedVersion(
        lock,
        path.join(root, 'apps', 'legacy'),
        '@astryxdesign/core',
        '0.6.8',
      ),
    ).toBe('0.6.8');
  });

  it('reads a pnpm lockfile importer, dropping the peer suffix', () => {
    const root = tempDir();
    const lock = path.join(root, 'pnpm-lock.yaml');
    fs.writeFileSync(
      lock,
      [
        "lockfileVersion: '9.0'",
        '',
        'importers:',
        '',
        '  .:',
        '    dependencies:',
        "      '@astryxdesign/core':",
        '        specifier: ^0.6.8',
        '        version: 0.6.8(react@19.0.0)',
        '',
        '  apps/web:',
        '    dependencies:',
        "      '@astryxdesign/core':",
        '        specifier: 0.7.1',
        '        version: 0.7.1',
        '',
        'packages:',
        '',
      ].join('\n'),
    );
    expect(lockedVersion(lock, root, '@astryxdesign/core', '^0.6.8')).toBe(
      '0.6.8',
    );
    expect(
      lockedVersion(
        lock,
        path.join(root, 'apps', 'web'),
        '@astryxdesign/core',
        '0.7.1',
      ),
    ).toBe('0.7.1');
  });

  it('reads classic and Berry yarn lockfiles by the declared range', () => {
    const root = tempDir();
    const classic = path.join(root, 'yarn.lock');
    fs.writeFileSync(
      classic,
      [
        '# yarn lockfile v1',
        '',
        '"@astryxdesign/core@^0.6.0":',
        '  version "0.6.8"',
        '',
        '"@astryxdesign/core@0.7.1":',
        '  version "0.7.1"',
        '',
      ].join('\n'),
    );
    expect(lockedVersion(classic, root, '@astryxdesign/core', '^0.6.0')).toBe(
      '0.6.8',
    );
    const berryDir = tempDir();
    const berry = path.join(berryDir, 'yarn.lock');
    fs.writeFileSync(
      berry,
      [
        '__metadata:',
        '  version: 8',
        '',
        '"@astryxdesign/core@npm:^0.6.8":',
        '  version: 0.6.8',
        '  resolution: "@astryxdesign/core@npm:0.6.8"',
        '',
      ].join('\n'),
    );
    expect(lockedVersion(berry, berryDir, '@astryxdesign/core', '^0.6.8')).toBe(
      '0.6.8',
    );
  });

  it('reads a bun lockfile', () => {
    const root = tempDir();
    const lock = path.join(root, 'bun.lock');
    fs.writeFileSync(
      lock,
      '{\n  "lockfileVersion": 1,\n  "packages": {\n    "@astryxdesign/core": ["@astryxdesign/core@0.6.8", "", {}, "sha512-x"],\n  },\n}\n',
    );
    expect(lockedVersion(lock, root, '@astryxdesign/core', '^0.6.0')).toBe(
      '0.6.8',
    );
  });

  it('finds the lockfile above a workspace member', () => {
    const root = tempDir();
    fs.writeFileSync(
      path.join(root, 'pnpm-lock.yaml'),
      "lockfileVersion: '9.0'\n",
    );
    const member = path.join(root, 'apps', 'web');
    fs.mkdirSync(member, {recursive: true});
    expect(findLockfile(member)).toBe(path.join(root, 'pnpm-lock.yaml'));
  });
});

describe('readReleaseFacts', () => {
  it('reports a fresh clone from its package.json and lockfile', () => {
    const root = project(tempDir(), {
      '@astryxdesign/core': '^0.6.0',
      '@astryxdesign/cli': '^0.6.0',
    });
    writeJson(path.join(root, 'package-lock.json'), {
      lockfileVersion: 3,
      packages: {
        'node_modules/@astryxdesign/core': {version: '0.6.8'},
        'node_modules/@astryxdesign/cli': {version: '0.6.8'},
      },
    });
    expect(readReleaseFacts(root)).toMatchObject({
      inProject: true,
      core: null,
      cli: null,
      lockedCoreVersion: '0.6.8',
      lockedCliVersion: '0.6.8',
    });
  });

  it('reports the installed Core and CLI', () => {
    const root = project(tempDir(), {'@astryxdesign/core': '0.7.1'});
    installCore(root, '0.7.1');
    installStandInCli(root, '0.6.8');
    const facts = readReleaseFacts(root);
    expect(facts.core?.version).toBe('0.7.1');
    expect(facts.cli?.version).toBe('0.6.8');
  });

  it('reports a folder with no Astryx as outside a project', () => {
    const root = tempDir();
    writeJson(path.join(root, 'package.json'), {
      name: 'x',
      dependencies: {react: '19'},
    });
    expect(readReleaseFacts(root).inProject).toBe(false);
  });
});

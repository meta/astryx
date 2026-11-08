// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, it, expect, afterEach} from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  chooseRelease,
  isComputerLevel,
  isGlobalCopy,
  matchedVersionOf,
  namesWhoAnswered,
} from './choose.mjs';
import {
  cleanupFixtures,
  installCore,
  installStandInCli,
  project,
  seedRelease,
  tempDir,
  writeJson,
} from '../../test-utils/release-fixtures.mjs';

afterEach(cleanupFixtures);

/**
 * A running copy installed somewhere that is not a project or a global
 * folder: a package runner's temporary install.
 * @param {string} version
 */
function runnerCopy(version) {
  const dir = path.join(tempDir('runner'), '_npx', 'abc');
  project(dir, {'@astryxdesign/cli': version});
  return {version, root: installStandInCli(dir, version)};
}

/**
 * A copy installed for the computer the way npm does it: a node_modules
 * folder whose owner holds no package.json.
 * @param {string} version
 */
function globalCopy(version) {
  const prefix = path.join(tempDir('global'), 'lib');
  fs.mkdirSync(prefix, {recursive: true});
  return {version, root: installStandInCli(prefix, version)};
}

describe('chooseRelease in a project', () => {
  it('hands off to the project CLI when it matches the project Core', () => {
    const root = project(tempDir(), {'@astryxdesign/core': '0.6.8'});
    installCore(root, '0.6.8');
    const cli = installStandInCli(root, '0.6.8');
    const choice = chooseRelease({
      cwd: root,
      self: globalCopy('0.7.2'),
      cacheDir: tempDir('cache'),
    });
    expect(choice).toMatchObject({
      copy: 'project',
      answer: 'project-cli',
      version: '0.6.8',
    });
    expect(choice.bin).toBe(path.join(cli, 'bin.cjs'));
  });

  it('answers itself when it is the project CLI', () => {
    const root = project(tempDir(), {'@astryxdesign/core': '0.6.8'});
    installCore(root, '0.6.8');
    const cli = installStandInCli(root, '0.6.8');
    const choice = chooseRelease({
      cwd: root,
      self: {version: '0.6.8', root: cli},
      cacheDir: tempDir('cache'),
    });
    expect(choice).toMatchObject({copy: 'project', answer: 'self'});
  });

  it("lets the project's own CLI answer even when it is another release than Core, both ways", () => {
    for (const [cliVersion, coreVersion] of [
      ['0.6.8', '0.7.0'],
      ['0.7.1', '0.6.8'],
    ]) {
      const root = project(tempDir(), {'@astryxdesign/core': coreVersion});
      installCore(root, coreVersion);
      const cli = installStandInCli(root, cliVersion);
      expect(
        chooseRelease({
          cwd: root,
          self: {version: cliVersion, root: cli},
          cacheDir: tempDir('cache'),
        }),
      ).toMatchObject({copy: 'project', answer: 'self', version: cliVersion});
      expect(
        chooseRelease({
          cwd: root,
          self: globalCopy('0.7.2'),
          cacheDir: tempDir('cache'),
        }),
      ).toMatchObject({
        copy: 'project',
        answer: 'project-cli',
        version: cliVersion,
      });
    }
  });

  it("hands a run to the project's own CLI even from a copy equal to the project's Core", () => {
    const root = project(tempDir(), {'@astryxdesign/core': '0.7.2'});
    installCore(root, '0.7.2');
    installStandInCli(root, '0.6.8');
    expect(
      chooseRelease({
        cwd: root,
        self: runnerCopy('0.7.2'),
        cacheDir: tempDir('cache'),
      }),
    ).toMatchObject({copy: 'project', answer: 'project-cli', version: '0.6.8'});
  });

  it('answers a Core-only project with the copy that started the run, as released, naming its Core', () => {
    const root = project(tempDir(), {'@astryxdesign/core': '0.6.8'});
    installCore(root, '0.6.8');
    for (const self of [runnerCopy('0.7.1'), globalCopy('0.6.8')]) {
      expect(
        chooseRelease({cwd: root, self, cacheDir: tempDir('cache')}),
      ).toMatchObject({
        copy: 'starting',
        answer: 'self',
        version: self.version,
        coreVersion: '0.6.8',
        inProject: true,
      });
    }
  });

  it('answers a workspace member with its own Core with the root CLI, as before global mode', () => {
    const ws = tempDir();
    writeJson(path.join(ws, 'package.json'), {
      name: 'ws',
      workspaces: ['apps/*'],
      devDependencies: {'@astryxdesign/cli': '0.7.1'},
      dependencies: {'@astryxdesign/core': '0.7.1'},
    });
    installCore(ws, '0.7.1');
    installStandInCli(ws, '0.7.1');
    const legacy = project(path.join(ws, 'apps', 'legacy'), {
      '@astryxdesign/core': '0.6.8',
    });
    installCore(legacy, '0.6.8');
    const choice = chooseRelease({
      cwd: legacy,
      self: globalCopy('0.7.2'),
      cacheDir: tempDir('cache'),
    });
    expect(choice).toMatchObject({copy: 'project', version: '0.7.1'});
    const web = project(path.join(ws, 'apps', 'web'), {
      '@astryxdesign/core': '0.7.1',
    });
    expect(
      chooseRelease({
        cwd: web,
        self: globalCopy('0.7.2'),
        cacheDir: tempDir('cache'),
      }),
    ).toMatchObject({
      copy: 'project',
      answer: 'project-cli',
      version: '0.7.1',
    });
  });

  it('answers a fresh clone with the copy that started the run, naming the Core its lockfile records', () => {
    const root = project(tempDir(), {'@astryxdesign/core': '^0.6.0'});
    writeJson(path.join(root, 'package-lock.json'), {
      lockfileVersion: 3,
      packages: {'node_modules/@astryxdesign/core': {version: '0.6.8'}},
    });
    /** @type {string[]} */
    const asked = [];
    expect(
      chooseRelease({
        cwd: root,
        self: runnerCopy('0.7.2'),
        cacheDir: tempDir('cache'),
        resolve: (name, spec) => {
          asked.push(`${name}@${spec}`);
          return null;
        },
      }),
    ).toMatchObject({copy: 'starting', version: '0.7.2', coreVersion: '0.6.8'});
    // No registry question for a project the starting copy answers.
    expect(asked).toEqual([]);
  });

  it('matches a project whose own CLI cannot start from its lockfile, else its declared range, else reports the range unavailable', () => {
    const root = project(tempDir(), {'@astryxdesign/core': '^0.6.0'});
    installStandInCli(root, '0.6.0', {bin: false});
    writeJson(path.join(root, 'package-lock.json'), {
      lockfileVersion: 3,
      packages: {'node_modules/@astryxdesign/core': {version: '0.6.8'}},
    });
    expect(
      chooseRelease({
        cwd: root,
        self: runnerCopy('0.7.2'),
        cacheDir: tempDir('cache'),
      }),
    ).toMatchObject({copy: 'matched', version: '0.6.8'});
    const bare = project(tempDir(), {'@astryxdesign/core': '^0.6.0'});
    installStandInCli(bare, '0.6.0', {bin: false});
    /** @type {string[]} */
    const asked = [];
    expect(
      chooseRelease({
        cwd: bare,
        self: runnerCopy('0.7.2'),
        cacheDir: tempDir('cache'),
        resolve: (name, spec) => {
          asked.push(`${name}@${spec}`);
          return '0.6.8';
        },
      }),
    ).toMatchObject({copy: 'matched', answer: 'release', version: '0.6.8'});
    expect(asked).toEqual(['@astryxdesign/core@^0.6.0']);
    const none = project(tempDir(), {'@astryxdesign/core': '^9.0.0'});
    installStandInCli(none, '0.6.0', {bin: false});
    expect(
      chooseRelease({
        cwd: none,
        self: runnerCopy('0.7.2'),
        cacheDir: tempDir('cache'),
        resolve: () => null,
      }).unavailable,
    ).toMatch(/\^9\.0\.0/);
  });

  it("passes a project CLI with no astryx command over for the release matching the project's Core", () => {
    const root = project(tempDir(), {'@astryxdesign/core': '0.6.8'});
    installCore(root, '0.6.8');
    installStandInCli(root, '0.6.8', {bin: false});
    expect(
      chooseRelease({
        cwd: root,
        self: globalCopy('0.7.2'),
        cacheDir: tempDir('cache'),
      }),
    ).toMatchObject({copy: 'matched', answer: 'release', version: '0.6.8'});
  });

  it('ignores a version requested on the command line: the copy still hands off', () => {
    const root = project(tempDir(), {'@astryxdesign/core': '0.6.8'});
    installCore(root, '0.6.8');
    installStandInCli(root, '0.6.8');
    expect(
      chooseRelease({
        cwd: root,
        self: runnerCopy('0.7.0'),
        cacheDir: tempDir('cache'),
      }),
    ).toMatchObject({
      answer: 'project-cli',
      version: '0.6.8',
    });
  });
});

describe("chooseRelease for a workspace's own CLI package", () => {
  it('counts a copy inside the project, outside node_modules, as the project CLI', () => {
    const ws = tempDir();
    writeJson(path.join(ws, 'package.json'), {name: 'ws', private: true});
    writeJson(path.join(ws, 'packages', 'core', 'package.json'), {
      name: '@astryxdesign/core',
      version: '0.7.2',
    });
    const cli = path.join(ws, 'packages', 'cli');
    writeJson(path.join(cli, 'package.json'), {
      name: '@astryxdesign/cli',
      version: '0.7.2',
    });
    const self = {version: '0.7.2', root: cli};
    expect(
      chooseRelease({cwd: ws, self, cacheDir: tempDir('cache')}),
    ).toMatchObject({copy: 'project', answer: 'self'});
  });
});

describe('chooseRelease outside a project', () => {
  it('answers with the running copy, the global copy included, whatever releases are cached', () => {
    const empty = tempDir('empty');
    const cacheDir = tempDir('cache');
    seedRelease(cacheDir, '0.7.3');
    for (const self of [globalCopy('0.7.2'), runnerCopy('0.7.0')]) {
      expect(chooseRelease({cwd: empty, self, cacheDir})).toMatchObject({
        copy: 'carried',
        answer: 'self',
        version: self.version,
      });
    }
  });
});

describe('isGlobalCopy', () => {
  it('knows npm, pnpm, Yarn, and Bun global folders from project and runner copies', () => {
    const base = tempDir('globals');
    const cacheDir = tempDir('cache');
    /** @param {string} rel @param {boolean} [withPkg] */
    const at = (rel, withPkg = false) => {
      const owner = path.join(base, rel);
      fs.mkdirSync(owner, {recursive: true});
      if (withPkg) writeJson(path.join(owner, 'package.json'), {name: 'owner'});
      return installStandInCli(owner, '0.7.2');
    };
    // The package managers' settings, as on a computer whose home is `base`.
    const where = {
      home: base,
      platform: /** @type {const} */ ('linux'),
      env: {PNPM_HOME: path.join(base, 'share/pnpm')},
    };
    expect(isGlobalCopy(at('usr/lib'), cacheDir, where)).toBe(true);
    expect(isGlobalCopy(at('share/pnpm/global/5', true), cacheDir, where)).toBe(
      true,
    );
    // pnpm 11+: the global packages live in a store folder under global/v11/<id>.
    const pnpmOwner = path.join(base, 'share/pnpm/global/v11/2f9c1a');
    fs.mkdirSync(pnpmOwner, {recursive: true});
    writeJson(path.join(pnpmOwner, 'package.json'), {
      dependencies: {'@astryxdesign/cli': '0.7.2'},
    });
    const pnpmStore = path.join(
      pnpmOwner,
      'node_modules',
      '.pnpm',
      '@astryxdesign+cli@0.7.2',
    );
    fs.mkdirSync(pnpmStore, {recursive: true});
    expect(
      isGlobalCopy(installStandInCli(pnpmStore, '0.7.2'), cacheDir, where),
    ).toBe(true);
    expect(isGlobalCopy(at('.config/yarn/global', true), cacheDir, where)).toBe(
      true,
    );
    expect(isGlobalCopy(at('.bun/install/global', true), cacheDir, where)).toBe(
      true,
    );
    // Named like one, but no package manager's settings name it.
    expect(isGlobalCopy(at('other/pnpm/global/5', true), cacheDir, where)).toBe(
      false,
    );
    expect(isGlobalCopy(at('other/yarn/global', true), cacheDir, where)).toBe(
      false,
    );
    expect(isGlobalCopy(at('app', true), cacheDir, where)).toBe(false);
    expect(isGlobalCopy(at('npm/_npx/123', true), cacheDir, where)).toBe(false);
    const seeded = seedRelease(cacheDir, '0.7.2');
    expect(
      isGlobalCopy(
        path.join(seeded, 'node_modules', '@astryxdesign', 'cli'),
        cacheDir,
      ),
    ).toBe(false);
  });

  it("treats a project's pnpm store copy as the project's", () => {
    const app = tempDir('app');
    writeJson(path.join(app, 'package.json'), {name: 'app'});
    const store = path.join(
      app,
      'node_modules',
      '.pnpm',
      '@astryxdesign+cli@0.7.2',
    );
    fs.mkdirSync(store, {recursive: true});
    expect(
      isGlobalCopy(installStandInCli(store, '0.7.2'), tempDir('cache')),
    ).toBe(false);
  });
});

describe('matchedVersionOf', () => {
  it('takes an exact declared version without asking the registry', () => {
    expect(
      matchedVersionOf({
        inProject: true,
        core: null,
        cli: null,
        declaringDir: '/x',
        declaredCoreRange: '0.6.8',
        declaredCliRange: null,
        lockedCoreVersion: null,
        lockedCliVersion: null,
      }),
    ).toEqual({version: '0.6.8', range: null});
  });
});

describe('namesWhoAnswered', () => {
  it('is true for this release and false for a stand-in from before it', () => {
    expect(
      namesWhoAnswered(path.resolve(import.meta.dirname, '..', '..')),
    ).toBe(true);
    expect(namesWhoAnswered(installStandInCli(tempDir(), '0.6.8'))).toBe(false);
  });
});

describe('isComputerLevel', () => {
  it('is init --user, with root options anywhere before it', () => {
    expect(isComputerLevel(['init', '--user'])).toBe(true);
    expect(
      isComputerLevel(['--json', 'init', '--user', '--remove-agents']),
    ).toBe(true);
    expect(isComputerLevel(['--lang', 'zh', 'init', '--user'])).toBe(true);
    expect(isComputerLevel(['init'])).toBe(false);
    expect(isComputerLevel(['docs', 'init', '--user'])).toBe(false);
  });

  it('is docs global and its pages, whatever the options', () => {
    expect(isComputerLevel(['docs', 'global'])).toBe(true);
    expect(isComputerLevel(['--json', 'docs', 'global/problems'])).toBe(true);
    expect(isComputerLevel(['docs', '--depth', '2', 'global'])).toBe(true);
    expect(isComputerLevel(['docs', '--lang', 'zh', 'global/updates'])).toBe(
      true,
    );
    expect(isComputerLevel(['docs'])).toBe(false);
    expect(isComputerLevel(['docs', 'globals'])).toBe(false);
    expect(isComputerLevel(['docs', 'cli/global'])).toBe(false);
    expect(isComputerLevel(['search', 'global'])).toBe(false);
  });
});

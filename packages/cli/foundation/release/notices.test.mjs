// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Update notices (spec AST-081 FR10): when each one applies, its exact
 * two lines, the upgrade command for each package manager, and that it prints
 * at most once a day and never when the environment turns notices off.
 */

import {afterEach, describe, expect, it} from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {spawn} from 'node:child_process';
import {
  recordDeclaredCliCommands,
  runWithCliDoor,
} from '../env/cli-command.mjs';
import {
  NOTICE_INTERVAL_MS,
  availableLine,
  globalBehind,
  globalUpgradeCommand,
  noticeLines,
  oldGlobalCommand,
  oldGlobalLines,
  projectLag,
  alignCliAndCore,
  lastNoticeSkip,
  recordNoticeSkip,
  takeNotice,
  upgradeLine,
} from './notices.mjs';
import {
  readGlobalState,
  stateLockHolder,
  tryStateLock,
  updateGlobalState,
} from './global-state.mjs';
import {
  cleanupFixtures,
  installCore,
  installStandInCli,
  project,
  tempDir,
  writeJson,
} from '../../test-utils/release-fixtures.mjs';

afterEach(cleanupFixtures);

const DAY = 24 * 60 * 60_000;

/**
 * An Astryx CLI package on a search path folder, with or without the hand-off.
 * @param {string} version
 * @param {{handsOff?: boolean, prefix?: string[]}} [options]
 */
function cliOnPath(version, {handsOff = false, prefix = ['lib']} = {}) {
  const root = tempDir('prefix');
  const pkg = path.join(
    root,
    ...prefix,
    'node_modules',
    '@astryxdesign',
    'cli',
  );
  fs.mkdirSync(pkg, {recursive: true});
  writeJson(path.join(pkg, 'package.json'), {
    name: '@astryxdesign/cli',
    version,
  });
  fs.writeFileSync(path.join(pkg, 'bin.mjs'), '#!/usr/bin/env node\n');
  fs.chmodSync(path.join(pkg, 'bin.mjs'), 0o755);
  if (handsOff) {
    fs.mkdirSync(path.join(pkg, 'foundation', 'release'), {recursive: true});
    fs.writeFileSync(path.join(pkg, 'foundation', 'release', 'choose.mjs'), '');
  }
  fs.mkdirSync(path.join(root, 'bin'));
  fs.symlinkSync(path.join(pkg, 'bin.mjs'), path.join(root, 'bin', 'astryx'));
  return {bin: path.join(root, 'bin'), pkg, root};
}

/** A state folder whose last check found `version`, needing Node `node`. */
function checked(version = '0.7.3', node = null) {
  const stateDir = tempDir('state');
  updateGlobalState(
    {latest: version, latestNode: node, checkOkAt: 1},
    stateDir,
  );
  return stateDir;
}

describe('takeNotice', () => {
  it('lets a notice print once in any 24 hours, per key', () => {
    const stateDir = tempDir('state');
    expect(takeNotice('a', {stateDir, now: 1000})).toBe(true);
    expect(takeNotice('a', {stateDir, now: 1000 + DAY - 1})).toBe(false);
    expect(takeNotice('b', {stateDir, now: 2000})).toBe(true);
    expect(takeNotice('a', {stateDir, now: 1000 + NOTICE_INTERVAL_MS})).toBe(
      true,
    );
    expect(readGlobalState(stateDir).notifiedAt).toEqual({
      a: 1000 + NOTICE_INTERVAL_MS,
      b: 2000,
    });
  });

  it('lets exactly one of many runs finishing at once take a notice (b18)', async () => {
    const stateDir = tempDir('state');
    const notices = new URL('./notices.mjs', import.meta.url).href;
    const source = `
      const {takeNotice} = await import(${JSON.stringify(notices)});
      const at = Number(process.argv[1]);
      while (Date.now() < at) {}
      process.stdout.write(takeNotice('global', {stateDir: ${JSON.stringify(stateDir)}}) ? 'took' : 'skip');
    `;
    const at = String(Date.now() + 1500);
    const runs = await Promise.all(
      Array.from(
        {length: 10},
        () =>
          new Promise(resolve => {
            const child = spawn(
              process.execPath,
              ['--input-type=module', '-e', source, at],
              {stdio: ['ignore', 'pipe', 'inherit']},
            );
            let out = '';
            child.stdout.on('data', d => (out += d));
            child.on('close', () => resolve(out));
          }),
      ),
    );
    expect(runs.filter(r => r === 'took')).toHaveLength(1);
    expect(runs.filter(r => r === 'skip')).toHaveLength(9);
    expect(fs.existsSync(path.join(stateDir, '.lock-state'))).toBe(false);
  });

  it('prints nothing when the time cannot be recorded', () => {
    const file = path.join(tempDir('state'), 'file');
    fs.writeFileSync(file, '');
    expect(takeNotice('a', {stateDir: file, now: 1})).toBe(false);
  });
});

describe('why a notice did not print (diagnostic state)', () => {
  it('records an already-shown skip, at most once an hour for the same reason', () => {
    const stateDir = tempDir('state');
    expect(takeNotice('global', {stateDir, now: 1000})).toBe(true);
    expect(takeNotice('global', {stateDir, now: 2000})).toBe(false);
    expect(readGlobalState(stateDir).noticeSkips).toEqual({
      global: {reason: 'already-shown', at: 2000},
    });
    // Within the hour: not rewritten.
    expect(takeNotice('global', {stateDir, now: 3000})).toBe(false);
    expect(readGlobalState(stateDir).noticeSkips?.global.at).toBe(2000);
    // After it: recorded again.
    expect(takeNotice('global', {stateDir, now: 2000 + 60 * 60_000})).toBe(
      false,
    );
    expect(readGlobalState(stateDir).noticeSkips?.global.at).toBe(
      2000 + 60 * 60_000,
    );
    expect(lastNoticeSkip({stateDir})).toEqual({
      key: 'global',
      reason: 'already-shown',
      at: 2000 + 60 * 60_000,
    });
  });

  it('says a held lock timed out, and who holds it', () => {
    const stateDir = tempDir('state');
    const lockDir = path.join(stateDir, '.lock-state');
    fs.mkdirSync(lockDir, {recursive: true});
    fs.writeFileSync(
      path.join(lockDir, 'owner.json'),
      JSON.stringify({pid: process.pid, host: os.hostname(), at: Date.now()}),
    );
    expect(tryStateLock(stateDir, () => 'ran')).toEqual({
      ran: false,
      reason: 'lock-timeout',
    });
    expect(stateLockHolder(stateDir)).toMatchObject({pid: process.pid});
    fs.rmSync(lockDir, {recursive: true});
    expect(stateLockHolder(stateDir)).toBeNull();
    // Nothing is recorded where no state file exists yet.
    recordNoticeSkip('global', 'no-newer', {stateDir, now: 4});
    expect(fs.existsSync(path.join(stateDir, 'state.json'))).toBe(false);
  }, 10_000);

  it('records nothing for a notice the lock kept from printing, and writes no other file', () => {
    const stateDir = tempDir('state');
    updateGlobalState({latest: '0.7.1'}, stateDir);
    const lockDir = path.join(stateDir, '.lock-state');
    fs.mkdirSync(lockDir, {recursive: true});
    expect(takeNotice('global', {stateDir, now: 6})).toBe(false);
    fs.rmSync(lockDir, {recursive: true});
    expect(lastNoticeSkip({stateDir})).toBeNull();
    expect(fs.readdirSync(stateDir).sort()).toEqual(['state.json']);
  }, 10_000);
});

describe('the lines', () => {
  it('match the gh form, naming the Node a release needs', () => {
    expect(availableLine('0.7.2', '0.7.3')).toBe(
      'A new release of Astryx is available: 0.7.2 → 0.7.3',
    );
    expect(
      upgradeLine('npm i -g @astryxdesign/cli@latest', '>=20', '22.0.0'),
    ).toBe('To upgrade, run: npm i -g @astryxdesign/cli@latest');
    expect(
      upgradeLine('npm i -g @astryxdesign/cli@latest', '>=24', '22.13.0'),
    ).toBe(
      'To upgrade, install Node >=24 (this computer runs Node 22.13.0), then run: npm i -g @astryxdesign/cli@latest',
    );
  });

  it('upgrade a CLI that npm installed under its own prefix into that prefix', () => {
    const linux = {
      execPath: '/usr/bin/node',
      home: '/home/a',
      platform: /** @type {const} */ ('linux'),
      env: {},
    };
    expect(
      globalUpgradeCommand(
        '/home/a/.local/lib/node_modules/@astryxdesign/cli',
        linux,
      ),
    ).toBe('npm i -g --prefix ~/.local @astryxdesign/cli@latest');
    expect(
      globalUpgradeCommand(
        '/home/a/.npm-global/lib/node_modules/@astryxdesign/cli',
        linux,
      ),
    ).toBe('npm i -g --prefix ~/.npm-global @astryxdesign/cli@latest');
    expect(
      globalUpgradeCommand(
        '/opt/tools/lib/node_modules/@astryxdesign/cli',
        linux,
      ),
    ).toBe('npm i -g --prefix /opt/tools @astryxdesign/cli@latest');
    // npm's default prefixes: Node's own, /usr/local, /usr.
    for (const cli of [
      '/usr/local/lib/node_modules/@astryxdesign/cli',
      '/usr/lib/node_modules/@astryxdesign/cli',
    ]) {
      expect(globalUpgradeCommand(cli, linux)).toBe(
        'npm i -g @astryxdesign/cli@latest',
      );
    }
    expect(
      globalUpgradeCommand(
        '/home/a/.nvm/versions/node/v22.1.0/lib/node_modules/@astryxdesign/cli',
        {
          ...linux,
          execPath: '/home/a/.nvm/versions/node/v22.1.0/bin/node',
        },
      ),
    ).toBe('npm i -g @astryxdesign/cli@latest');
    const win = {
      execPath: 'C:\\Program Files\\nodejs\\node.exe',
      home: 'C:\\Users\\a',
      platform: /** @type {const} */ ('win32'),
      env: {APPDATA: 'C:\\Users\\a\\AppData\\Roaming'},
    };
    expect(
      globalUpgradeCommand(
        'C:\\Users\\a\\AppData\\Roaming\\npm\\node_modules\\@astryxdesign\\cli',
        win,
      ),
    ).toBe('npm i -g @astryxdesign/cli@latest');
    expect(
      globalUpgradeCommand(
        'D:\\tools\\npm\\node_modules\\@astryxdesign\\cli',
        win,
      ),
    ).toBe('npm i -g --prefix D:\\tools\\npm @astryxdesign/cli@latest');
  });

  it('name the package manager that installed the global copy', () => {
    const at = (/** @type {string} */ p) =>
      globalUpgradeCommand(path.join(path.sep, ...p.split('/')), {
        home: '/home/a',
        platform: 'linux',
        env: {PNPM_HOME: '/home/a/pn'},
      });
    expect(at('usr/local/lib/node_modules/@astryxdesign/cli')).toBe(
      'npm i -g @astryxdesign/cli@latest',
    );
    expect(at('home/a/pn/global/5/node_modules/@astryxdesign/cli')).toBe(
      'pnpm add -g @astryxdesign/cli@latest',
    );
    expect(at('home/a/pn/global/v11/3f2a/node_modules/@astryxdesign/cli')).toBe(
      'pnpm add -g @astryxdesign/cli@latest',
    );
    expect(
      at('home/a/.config/yarn/global/node_modules/@astryxdesign/cli'),
    ).toBe('yarn global add @astryxdesign/cli@latest');
    expect(
      at('home/a/.bun/install/global/node_modules/@astryxdesign/cli'),
    ).toBe('bun add -g @astryxdesign/cli@latest');
    expect(
      at(
        'home/a/.volta/tools/image/packages/@astryxdesign/cli/lib/node_modules/@astryxdesign/cli',
      ),
    ).toBe('volta install @astryxdesign/cli@latest');
  });
});

describe('globalBehind and projectLag', () => {
  it('need a completed check, and never report a current, newer, or prerelease version', () => {
    const self = {
      version: '0.7.2',
      root: '/usr/lib/node_modules/@astryxdesign/cli',
    };
    expect(globalBehind({self, stateDir: tempDir('state')})).toBeNull();
    const stateDir = checked('0.7.3', '>=24');
    expect(globalBehind({self, stateDir})).toEqual({
      current: '0.7.2',
      newest: '0.7.3',
      node: '>=24',
      command: 'npm i -g @astryxdesign/cli@latest',
    });
    for (const version of ['0.7.3', '0.8.0', '0.7.2-canary.1']) {
      expect(globalBehind({self: {...self, version}, stateDir})).toBeNull();
    }
  });

  it("name a project's install and upgrade commands for its package manager", () => {
    const stateDir = checked('0.7.3');
    const coreOnly = project(tempDir(), {'@astryxdesign/core': '0.7.1'});
    writeJson(path.join(coreOnly, 'package-lock.json'), {lockfileVersion: 3});
    installCore(coreOnly, '0.7.1');
    expect(
      projectLag({cwd: coreOnly, current: '0.7.1', stateDir}),
    ).toMatchObject({
      root: coreOnly,
      install: 'npm install @astryxdesign/core@0.7.3 @astryxdesign/cli@0.7.3',
      upgrade: 'npx astryx upgrade --from 0.7.1 --apply',
    });
    const pnpm = project(tempDir(), {
      '@astryxdesign/core': '0.7.1',
      '@astryxdesign/cli': '0.7.1',
    });
    fs.writeFileSync(
      path.join(pnpm, 'pnpm-lock.yaml'),
      "lockfileVersion: '9.0'\n",
    );
    installCore(pnpm, '0.7.1');
    installStandInCli(pnpm, '0.7.1');
    expect(projectLag({cwd: pnpm, current: '0.7.1', stateDir})).toMatchObject({
      install: 'pnpm add @astryxdesign/core@0.7.3 @astryxdesign/cli@0.7.3',
      upgrade: 'pnpm exec astryx upgrade --from 0.7.1 --apply',
    });
  });
});

describe('projectLag from a tool folder inside a project', () => {
  it("uses the project's own CLI release, so the project gets one notice and one --from", () => {
    const stateDir = checked('0.7.3');
    const app = project(tempDir(), {
      '@astryxdesign/core': '0.7.1',
      '@astryxdesign/cli': '0.7.2',
    });
    writeJson(path.join(app, 'package-lock.json'), {lockfileVersion: 3});
    installCore(app, '0.7.1');
    installStandInCli(app, '0.7.2');
    const tool = path.join(app, 'tools', 'codegen');
    writeJson(path.join(tool, 'package.json'), {name: 'codegen'});
    installCore(tool, '0.7.0');

    const fromApp = projectLag({cwd: app, current: '0.7.2', stateDir});
    const fromTool = projectLag({cwd: tool, current: '0.7.0', stateDir});
    expect(fromTool).toMatchObject({root: app, current: '0.7.2'});
    expect(fromTool?.upgrade).toBe(`cd ${app} && ${fromApp?.upgrade}`);
  });
});

describe('the commands notices print go through the command-name picker (spec AST-081 FR5)', () => {
  /** A Core-only npm project behind the newest release. */
  const coreOnlyProject = () => {
    const dir = project(tempDir(), {'@astryxdesign/core': '0.7.1'});
    writeJson(path.join(dir, 'package-lock.json'), {lockfileVersion: 3});
    installCore(dir, '0.7.1');
    return dir;
  };

  it("use an integration's declared cliCommand for the upgrade step", () => {
    const stateDir = checked('0.7.3');
    const dir = coreOnlyProject();
    recordDeclaredCliCommands(dir, [
      {name: '@acme/a', cliCommand: 'acme astryx'},
    ]);
    try {
      expect(projectLag({cwd: dir, current: '0.7.1', stateDir})?.upgrade).toBe(
        'acme astryx upgrade --from 0.7.1 --apply',
      );
      expect(alignCliAndCore({cwd: dir, cli: '0.7.3', core: '0.7.1'})).toBe(
        'npm install @astryxdesign/core@0.7.3, then acme astryx upgrade --from 0.7.1 --apply',
      );
    } finally {
      recordDeclaredCliCommands(dir, []);
    }
  });

  it("use a host's door when nothing is declared", () => {
    const stateDir = checked('0.7.3');
    const dir = coreOnlyProject();
    runWithCliDoor('host astryx', () => {
      expect(projectLag({cwd: dir, current: '0.7.1', stateDir})?.upgrade).toBe(
        'host astryx upgrade --from 0.7.1 --apply',
      );
      expect(alignCliAndCore({cwd: dir, cli: '0.7.3', core: '0.7.1'})).toBe(
        'npm install @astryxdesign/core@0.7.3, then host astryx upgrade --from 0.7.1 --apply',
      );
    });
  });

  it("fall back to the project's own installed CLI", () => {
    const dir = coreOnlyProject();
    expect(alignCliAndCore({cwd: dir, cli: '0.7.3', core: '0.7.1'})).toBe(
      'npm install @astryxdesign/core@0.7.3, then npx astryx upgrade --from 0.7.1 --apply',
    );
  });
});

describe.skipIf(process.platform === 'win32')('oldGlobalCommand', () => {
  it('names a first astryx that predates the hand-off with its own package manager, and not one that hands off', () => {
    const old = cliOnPath('0.7.1', {prefix: ['global', '5']});
    expect(oldGlobalCommand({searchPath: old.bin, platform: 'linux'})).toEqual({
      file: path.join(old.bin, 'astryx'),
      version: '0.7.1',
      command: 'pnpm add -g @astryxdesign/cli@latest',
    });
    expect(
      oldGlobalLines({
        version: '0.7.1',
        command: 'npm i -g @astryxdesign/cli@latest',
      }),
    ).toEqual([
      'The astryx command on this computer runs CLI 0.7.1, which answers every folder itself.',
      'To upgrade, run: npm i -g @astryxdesign/cli@latest',
    ]);
    const current = cliOnPath('0.8.0', {handsOff: true});
    expect(
      oldGlobalCommand({
        searchPath: [current.bin, old.bin].join(path.delimiter),
        platform: 'linux',
      }),
    ).toBeNull();
    expect(
      oldGlobalCommand({
        selfRoot: old.pkg,
        searchPath: old.bin,
        platform: 'linux',
      }),
    ).toBeNull();
  });
});

describe.skipIf(process.platform === 'win32')('noticeLines', () => {
  /** A global copy, outside a project. */
  const outside = () => {
    const global = cliOnPath('0.7.2', {handsOff: true});
    return {
      global,
      cwd: tempDir('empty'),
      self: {version: '0.7.2', root: global.pkg},
      choice: {inProject: false, version: '0.7.2'},
      cacheDir: tempDir('cache'),
      searchPath: global.bin,
      env: {},
    };
  };

  it('tells the global copy about a newer release, once a day', () => {
    const {global, ...input} = {...outside(), stateDir: checked('0.7.3')};
    // The fixture's global folder is a prefix of its own, so the upgrade
    // names it.
    const prefix = fs.realpathSync(global.root);
    expect(noticeLines({...input, now: 10})).toEqual([
      'A new release of Astryx is available: 0.7.2 → 0.7.3',
      `To upgrade, run: npm i -g --prefix ${prefix} @astryxdesign/cli@latest`,
    ]);
    expect(noticeLines({...input, now: 20})).toEqual([]);
    expect(lastNoticeSkip({stateDir: input.stateDir})).toEqual({
      key: 'global',
      reason: 'already-shown',
      at: 20,
    });
    expect(noticeLines({...input, now: 10 + DAY})).toHaveLength(2);
  });

  it('records that nothing newer was known when the global copy is current', () => {
    const {global: _global, ...input} = {
      ...outside(),
      stateDir: checked('0.7.2'),
    };
    expect(noticeLines({...input, now: 30})).toEqual([]);
    expect(lastNoticeSkip({stateDir: input.stateDir})).toEqual({
      key: 'global',
      reason: 'no-newer',
      at: 30,
    });
  });

  it('prints nothing with --json, in CI, or with NO_UPDATE_NOTIFIER, and keeps the notice for later', () => {
    const {global: _global, ...input} = {
      ...outside(),
      stateDir: checked('0.7.3'),
    };
    expect(noticeLines({...input, json: true, now: 10})).toEqual([]);
    expect(noticeLines({...input, env: {CI: 'true'}, now: 10})).toEqual([]);
    expect(
      noticeLines({...input, env: {NO_UPDATE_NOTIFIER: '1'}, now: 10}),
    ).toEqual([]);
    expect(noticeLines({...input, now: 10})).toHaveLength(2);
  });

  it('tells a project about its release, and an old astryx first on the search path, even with no check', () => {
    const stateDir = checked('0.7.3');
    const dir = project(tempDir(), {'@astryxdesign/core': '0.7.1'});
    writeJson(path.join(dir, 'package-lock.json'), {lockfileVersion: 3});
    installCore(dir, '0.7.1');
    const old = cliOnPath('0.7.1');
    const oldUpgrade = `To upgrade, run: npm i -g --prefix ${fs.realpathSync(old.root)} @astryxdesign/cli@latest`;
    const input = {
      cwd: dir,
      self: {version: '0.7.1', root: tempDir('self')},
      choice: {inProject: true, version: '0.7.1'},
      searchPath: old.bin,
      env: {},
    };
    expect(noticeLines({...input, stateDir, now: 10})).toEqual([
      'A new release of Astryx is available: 0.7.1 → 0.7.3',
      'To upgrade, run: npm install @astryxdesign/core@0.7.3 @astryxdesign/cli@0.7.3, then npx astryx upgrade --from 0.7.1 --apply',
      'The astryx command on this computer runs CLI 0.7.1, which answers every folder itself.',
      oldUpgrade,
    ]);
    expect(
      noticeLines({...input, stateDir: tempDir('fresh'), now: 10}),
    ).toEqual([
      'The astryx command on this computer runs CLI 0.7.1, which answers every folder itself.',
      oldUpgrade,
    ]);
  });

  it('says nothing in a run inside the release cache, the CLI checking a release it installed', () => {
    const cacheDir = tempDir('cache');
    const tmp = path.join(cacheDir, 'releases', '.tmp-0.7.2-1-abc');
    fs.mkdirSync(tmp, {recursive: true});
    const stateDir = checked('0.7.3');
    const old = cliOnPath('0.7.1');
    const input = {
      cwd: tmp,
      self: {version: '0.7.2', root: tempDir('self')},
      choice: {inProject: true, version: '0.7.2'},
      cacheDir,
      stateDir,
      searchPath: old.bin,
      env: {},
      now: 10,
    };
    expect(noticeLines(input)).toEqual([]);
    expect(readGlobalState(stateDir).notifiedAt).toBeUndefined();
  });

  it('says nothing about a copy that is not the global copy outside a project', () => {
    const runner = {
      ...outside(),
      self: {
        version: '0.7.2',
        root: path.join(
          tempDir('npx'),
          '_npx',
          'x',
          'node_modules',
          '@astryxdesign',
          'cli',
        ),
      },
      stateDir: checked('0.7.3'),
    };
    expect(noticeLines({...runner, now: 10})).toEqual([]);
  });
});

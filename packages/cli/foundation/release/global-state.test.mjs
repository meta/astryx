// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, it, expect, afterEach} from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {
  AGENT_TEXT_RETRY_MS,
  CHECK_INTERVAL_MS,
  knownLatest,
  knownLatestRelease,
  lastCheckFailure,
  maybeFetchCore,
  maybeKeepAgentText,
  maybeStartCheck,
  readGlobalState,
  recordAgentTextWritten,
  runCheck,
  stateFile,
  updateGlobalState,
} from './global-state.mjs';
import {
  CLI_VERSION,
  cleanupFixtures,
  tempDir,
} from '../../test-utils/release-fixtures.mjs';
import {
  computerAgentTextSettings,
  recordComputerAgentTextSettings,
} from '../env/user-settings.mjs';
import {userConfigDir} from '../env/user-dirs.mjs';
import {renderComputerAgentText} from '../agent-docs/computer-agent-text.mjs';
import {isCi, updateNoticesOff} from './update-notice-env.mjs';

afterEach(cleanupFixtures);

describe('maybeStartCheck', () => {
  it('never checks in the first day, then at most once a day', () => {
    const stateDir = tempDir('state');
    /** @type {number[]} */
    const started = [];
    const start = () => started.push(1);
    const env = {};
    const t0 = 1_000_000;
    expect(CHECK_INTERVAL_MS).toBe(24 * 60 * 60_000);
    expect(maybeStartCheck({stateDir, env, now: t0, start})).toBe(false);
    expect(
      maybeStartCheck({stateDir, env, now: t0 + CHECK_INTERVAL_MS - 1, start}),
    ).toBe(false);
    expect(
      maybeStartCheck({stateDir, env, now: t0 + CHECK_INTERVAL_MS, start}),
    ).toBe(true);
    expect(
      maybeStartCheck({stateDir, env, now: t0 + CHECK_INTERVAL_MS + 10, start}),
    ).toBe(false);
    expect(
      maybeStartCheck({stateDir, env, now: t0 + 2 * CHECK_INTERVAL_MS, start}),
    ).toBe(true);
    expect(started).toHaveLength(2);
    expect(stateFile(stateDir)).toBe(path.join(stateDir, 'state.json'));
  });

  it.each([
    [{CI: 'true'}],
    [{CI: '1'}],
    [{NO_UPDATE_NOTIFIER: ''}],
    [{NO_UPDATE_NOTIFIER: '1'}],
  ])('never checks, nor writes state, with %o', env => {
    const stateDir = tempDir('state');
    updateGlobalState({firstRunAt: 0}, stateDir);
    const start = () => {
      throw new Error('started');
    };
    expect(
      maybeStartCheck({stateDir, env, now: 10 * CHECK_INTERVAL_MS, start}),
    ).toBe(false);
    expect(readGlobalState(stateDir)).toEqual({firstRunAt: 0});
  });

  it('starts nothing when its start time cannot be recorded', () => {
    const stateDir = path.join(tempDir('state'), 'file');
    fs.writeFileSync(stateDir, '');
    const start = () => {
      throw new Error('started');
    };
    expect(maybeStartCheck({stateDir, env: {}, now: 1, start})).toBe(false);
    expect(maybeStartCheck({stateDir, env: {}, now: 1e12, start})).toBe(false);
  });
});

describe('update-notice-env', () => {
  it('reads CI the usual way, and NO_UPDATE_NOTIFIER as set or not', () => {
    for (const value of ['true', '1', 'yes', 'github']) {
      expect(isCi({CI: value})).toBe(true);
    }
    for (const value of [undefined, '', '0', 'false', 'FALSE']) {
      expect(isCi({CI: value})).toBe(false);
    }
    expect(updateNoticesOff({})).toBe(false);
    expect(updateNoticesOff({NO_UPDATE_NOTIFIER: ''})).toBe(true);
  });
});

describe('runCheck', () => {
  it('records the newest release and its Node range, and installs nothing', () => {
    const stateDir = tempDir('state');
    const state = runCheck({
      stateDir,
      resolve: () => ({version: '0.7.3', node: '>=24'}),
    });
    expect(state).toMatchObject({latest: '0.7.3', latestNode: '>=24'});
    expect(typeof state.checkOkAt).toBe('number');
    expect(knownLatest(stateDir)).toEqual({version: '0.7.3', node: '>=24'});
    expect(knownLatestRelease(stateDir)).toBe('0.7.3');
    expect(fs.readdirSync(stateDir).sort()).toEqual(['state.json']);
  });

  it('records why when the registry cannot be reached, and a later check that reaches it clears that', () => {
    const stateDir = tempDir('state');
    updateGlobalState({firstRunAt: 1}, stateDir);
    const failed = runCheck({
      stateDir,
      resolve: ({onFailure} = {}) => {
        onFailure?.('npm-failed: ECONNREFUSED');
        return null;
      },
    });
    expect(failed).toEqual({
      firstRunAt: 1,
      checkFailed: {at: expect.any(Number), reason: 'npm-failed: ECONNREFUSED'},
    });
    expect(knownLatest(stateDir)).toBeNull();
    expect(lastCheckFailure(stateDir)).toEqual({
      at: failed.checkFailed?.at,
      reason: 'npm-failed: ECONNREFUSED',
    });
    runCheck({stateDir, resolve: () => ({version: '0.7.3', node: null})});
    expect(readGlobalState(stateDir).checkFailed).toBeUndefined();
    expect(lastCheckFailure(stateDir)).toBeNull();
  });

  it('keeps the state in the per-user configuration folder', () => {
    expect(path.dirname(stateFile())).toBe(userConfigDir());
  });
});

describe('maybeFetchCore', () => {
  /** A release folder with the step, and no Core beside it. */
  const release = () => {
    const parent = tempDir('scope');
    const root = path.join(parent, 'cli');
    fs.mkdirSync(path.join(root, 'foundation', 'release'), {recursive: true});
    fs.writeFileSync(
      path.join(root, 'foundation', 'release', 'core-worker.mjs'),
      '',
    );
    return {version: '0.8.0', root};
  };

  it("starts the step that installs this release's Core when none is beside it or cached, never in CI", () => {
    /** @type {string[]} */
    const started = [];
    const start = (/** @type {string} */ worker) => started.push(worker);
    const r = release();
    const cacheDir = tempDir('cache');
    expect(
      maybeFetchCore({release: r, cacheDir, env: {CI: 'true'}, start}),
    ).toBe(false);
    expect(
      maybeFetchCore({release: r, cacheDir, env: {}, start, platform: 'linux'}),
    ).toBe(true);
    expect(started).toEqual([
      path.join(r.root, 'foundation', 'release', 'core-worker.mjs'),
    ]);
    // A Core beside the CLI, as a door's package set carries: nothing to do.
    const beside = path.join(path.dirname(r.root), 'core', 'package.json');
    fs.mkdirSync(path.dirname(beside), {recursive: true});
    fs.writeFileSync(
      beside,
      JSON.stringify({name: '@astryxdesign/core', version: '0.8.0'}),
    );
    expect(
      maybeFetchCore({release: r, cacheDir, env: {}, start, platform: 'linux'}),
    ).toBe(false);
  });

  it('never starts on Windows, where the caller would wait on inherited pipes', () => {
    const start = () => {};
    const r = release();
    const cacheDir = tempDir('cache');
    const base = {
      release: r,
      cacheDir,
      env: {},
      start,
      platform: /** @type {const} */ ('win32'),
    };
    expect(maybeFetchCore(base)).toBe(false);
    expect(maybeFetchCore({...base, platform: 'linux'})).toBe(true);
    expect(maybeFetchCore({...base, platform: 'darwin'})).toBe(true);
  });

  it('waits out a recent failure and an install under way', () => {
    const start = () => {};
    const r = release();
    const cacheDir = tempDir('cache');
    const releases = path.join(cacheDir, 'releases');
    fs.mkdirSync(path.join(releases, '.lock-0.8.0'), {recursive: true});
    expect(
      maybeFetchCore({release: r, cacheDir, env: {}, start, platform: 'linux'}),
    ).toBe(false);
    fs.rmSync(path.join(releases, '.lock-0.8.0'), {recursive: true});
    fs.writeFileSync(
      path.join(releases, '.failed-0.8.0.json'),
      JSON.stringify({at: Date.now(), reason: 'offline', failures: 1}),
    );
    expect(
      maybeFetchCore({release: r, cacheDir, env: {}, start, platform: 'linux'}),
    ).toBe(false);
    fs.writeFileSync(
      path.join(releases, '.failed-0.8.0.json'),
      JSON.stringify({
        at: Date.now() - 3 * 60_000,
        reason: 'offline',
        failures: 1,
      }),
    );
    expect(
      maybeFetchCore({release: r, cacheDir, env: {}, start, platform: 'linux'}),
    ).toBe(true);
  });
});

describe('maybeKeepAgentText', () => {
  /** @param {string} stateDir */
  const setup = stateDir => {
    const root = tempDir('cli');
    fs.mkdirSync(path.join(root, 'foundation', 'release'), {recursive: true});
    fs.writeFileSync(
      path.join(root, 'foundation', 'release', 'agent-text-worker.mjs'),
      '',
    );
    return {release: {version: '0.8.0', root}, stateDir};
  };

  it("starts the answering release's step once per release, retrying after an hour", () => {
    const stateDir = tempDir('state');
    const configDir = tempDir('config');
    /** @type {string[]} */
    const started = [];
    const start = (/** @type {string} */ worker) => started.push(worker);
    const base = {...setup(stateDir), configDir, start};
    expect(maybeKeepAgentText({...base, now: 1000})).toBe(true);
    expect(started[0]).toBe(
      path.join(
        base.release.root,
        'foundation',
        'release',
        'agent-text-worker.mjs',
      ),
    );
    expect(maybeKeepAgentText({...base, now: 2000})).toBe(false);
    expect(maybeKeepAgentText({...base, now: 1000 + AGENT_TEXT_RETRY_MS})).toBe(
      true,
    );
    recordAgentTextWritten('0.8.0', stateDir);
    expect(
      maybeKeepAgentText({...base, now: 1000 + 3 * AGENT_TEXT_RETRY_MS}),
    ).toBe(false);
    // A switch to another release writes its text again.
    expect(
      maybeKeepAgentText({
        ...base,
        release: {...base.release, version: '0.8.1'},
        now: 1000 + 3 * AGENT_TEXT_RETRY_MS,
      }),
    ).toBe(true);
    expect(started).toHaveLength(3);
  });

  it('starts nothing after the person turned the text off, or for a release without the step', () => {
    const stateDir = tempDir('state');
    const configDir = tempDir('config');
    const start = () => {
      throw new Error('started');
    };
    recordComputerAgentTextSettings({install: false, links: []}, configDir);
    expect(maybeKeepAgentText({...setup(stateDir), configDir, start})).toBe(
      false,
    );
    const other = tempDir('config');
    expect(
      maybeKeepAgentText({
        release: {version: '0.7.0', root: tempDir('old')},
        stateDir,
        configDir: other,
        start,
      }),
    ).toBe(false);
  });

  it('starts nothing when the attempt cannot be recorded', () => {
    const stateDir = path.join(tempDir('state'), 'file');
    fs.writeFileSync(stateDir, '');
    const start = () => {
      throw new Error('started');
    };
    expect(
      maybeKeepAgentText({
        ...setup(stateDir),
        configDir: tempDir('config'),
        start,
      }),
    ).toBe(false);
  });
});

describe('agent-text-worker.mjs', () => {
  it('writes the file with this release, links it, records both, and keeps an edited file', () => {
    const home = tempDir('home');
    const stateDir = path.join(home, '.config', 'astryx');
    const env = {
      ...process.env,
      HOME: home,
      USERPROFILE: home,
      XDG_CONFIG_HOME: path.join(home, '.config'),
      APPDATA: path.join(home, 'AppData', 'Roaming'),
    };
    const configDir = userConfigDir({home, env});
    const worker = fileURLToPath(
      new URL('./agent-text-worker.mjs', import.meta.url),
    );
    const run = () =>
      spawnSync(process.execPath, [worker, stateDir], {env, encoding: 'utf8'});
    const first = run();
    expect(first.status).toBe(0);
    expect(first.stdout + first.stderr).toBe('');
    const file = path.join(home, '.agents', 'skills', 'astryx', 'SKILL.md');
    const claude = path.join(home, '.claude', 'skills', 'astryx');
    expect(fs.readFileSync(file, 'utf8')).toBe(
      renderComputerAgentText({command: 'astryx'}),
    );
    expect(fs.lstatSync(claude).isSymbolicLink()).toBe(true);
    expect(computerAgentTextSettings(configDir)).toEqual({
      install: true,
      links: [claude],
    });
    expect(readGlobalState(stateDir).agentText).toEqual({
      writtenBy: CLI_VERSION,
    });
    fs.appendFileSync(file, 'mine\n');
    expect(run().status).toBe(0);
    expect(fs.readFileSync(file, 'utf8')).toMatch(/mine\n$/u);
  });

  it('writes nothing when the text is turned off', () => {
    const home = tempDir('home');
    const env = {
      ...process.env,
      HOME: home,
      USERPROFILE: home,
      XDG_CONFIG_HOME: path.join(home, '.config'),
    };
    recordComputerAgentTextSettings(
      {install: false, links: []},
      userConfigDir({home, env}),
    );
    const worker = fileURLToPath(
      new URL('./agent-text-worker.mjs', import.meta.url),
    );
    expect(
      spawnSync(
        process.execPath,
        [worker, path.join(home, '.config', 'astryx')],
        {env},
      ).status,
    ).toBe(0);
    expect(fs.existsSync(path.join(home, '.agents'))).toBe(false);
  });
});

// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The hand-off through the real bin: a run started in this copy, in a
 * project whose release is another one, is answered by that release with the
 * same arguments, folder, standard streams, and exit status, and one line on
 * standard error in text mode (spec AST-081 FR2, FR9).
 */

import {describe, it, expect, afterEach} from 'vitest';
import {spawnSync} from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {fileURLToPath} from 'node:url';
import {
  CLI_VERSION,
  cleanupFixtures,
  installCore,
  linkThisCliAsProjectCli,
  installStandInCli,
  project,
  seedRelease,
  tempDir,
  writeJson,
} from '../../test-utils/release-fixtures.mjs';

const BIN = fileURLToPath(
  new URL('../../clients/cli/bin/astryx.mjs', import.meta.url),
);
const SELF_VERSION = JSON.parse(
  fs.readFileSync(
    fileURLToPath(new URL('../../package.json', import.meta.url)),
    'utf-8',
  ),
).version;

afterEach(cleanupFixtures);

/**
 * Run this copy's bin in `cwd` with a private home and cache.
 * @param {string} cwd
 * @param {string[]} args
 * @param {{input?: string, cache?: string, home?: string, env?: Record<string, string>}} [options]
 */
function run(cwd, args, options = {}) {
  const home = options.home ?? tempDir('home');
  const cache = options.cache ?? tempDir('cache');
  const result = spawnSync(process.execPath, [BIN, ...args], {
    cwd,
    encoding: 'utf-8',
    input: options.input ?? '',
    env: {
      // Not the package manager running the tests: its npm_* settings would
      // name it as the project's package manager. Nor the test runner's CI
      // or NO_UPDATE_NOTIFIER, which turn update notices off.
      ...Object.fromEntries(
        Object.entries(process.env).filter(
          ([key]) => !/^(?:npm_|CI$|NO_UPDATE_NOTIFIER$)/iu.test(key),
        ),
      ),
      HOME: home,
      USERPROFILE: home,
      XDG_CACHE_HOME: cache,
      LOCALAPPDATA: cache,
      XDG_CONFIG_HOME: path.join(home, '.config'),
      APPDATA: path.join(home, 'AppData', 'Roaming'),
      NO_COLOR: '1',
      ...options.env,
    },
    timeout: 60_000,
  });
  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
    /** The stand-in's report, when a stand-in answered. */
    report: () => JSON.parse(result.stdout.trim().split('\n').pop() ?? 'null'),
  };
}

describe('hand-off to the project CLI', () => {
  it('passes argv, folder, stdin and the exit status, with one stderr line', () => {
    const root = project(tempDir(), {'@astryxdesign/core': '0.6.8'});
    installCore(root, '0.6.8');
    installStandInCli(root, '0.6.8');
    const src = path.join(root, 'src');
    fs.mkdirSync(src);
    const result = run(src, ['component', 'Button', '--exit', '7'], {
      input: 'piped',
    });
    expect(result.status).toBe(7);
    expect(result.report()).toEqual({
      version: '0.6.8',
      args: ['component', 'Button', '--exit', '7'],
      cwd: src,
      stdin: 'piped',
    });
    const lines = result.stderr.trim().split('\n');
    expect(lines).toEqual([
      `astryx: answered by this project's CLI 0.6.8, handed over from CLI ${SELF_VERSION}`,
      'stand-in 0.6.8',
    ]);
  });

  it('prints no line with --json', () => {
    const root = project(tempDir(), {'@astryxdesign/core': '0.6.8'});
    installCore(root, '0.6.8');
    installStandInCli(root, '0.6.8');
    const result = run(root, ['docs', '--json']);
    expect(result.status).toBe(0);
    expect(result.stderr.trim()).toBe('stand-in 0.6.8');
  });

  it("a project CLI that cannot start: the release matching the project's Core answers; offline, this copy, with the warning", () => {
    const root = project(tempDir(), {'@astryxdesign/core': '0.6.8'});
    installCore(root, '0.6.8');
    installStandInCli(root, '0.6.8', {bin: false});
    const offline = {npm_config_registry: 'http://127.0.0.1:9'};
    const json = run(root, ['docs', '--json'], {env: offline});
    expect(json.status).toBe(0);
    expect(JSON.parse(json.stdout).meta.answeredBy.copy).toBe('fallback');
    const text = run(root, ['--version'], {env: offline});
    expect(text.status).toBe(0);
    expect(text.stdout.trim()).toBe(SELF_VERSION);
    expect(text.stderr).toMatch(
      /astryx: could not get Astryx 0\.6\.8 to match this project's Core/u,
    );
  });
});

describe('hand-off to the matched release', () => {
  it("runs the project's own CLI even when its version differs from the project's Core", () => {
    const cache = tempDir('cache');
    seedRelease(path.join(cache, 'astryx'), '0.7.0');
    const root = project(tempDir(), {'@astryxdesign/core': '0.7.0'});
    installCore(root, '0.7.0');
    installStandInCli(root, '0.6.8');
    const result = run(root, ['upgrade', '--from', '0.6.8'], {cache});
    expect(result.status).toBe(0);
    expect(result.report()).toMatchObject({
      version: '0.6.8',
      args: ['upgrade', '--from', '0.6.8'],
    });
  });

  it("runs the cached release equal to the project's Core when the project's own CLI cannot start", () => {
    const cache = tempDir('cache');
    seedRelease(path.join(cache, 'astryx'), '0.7.0');
    const root = project(tempDir(), {'@astryxdesign/core': '0.7.0'});
    installCore(root, '0.7.0');
    installStandInCli(root, '0.6.8', {bin: false});
    const result = run(root, ['upgrade', '--from', '0.6.8'], {cache});
    expect(result.status).toBe(0);
    expect(result.report()).toMatchObject({
      version: '0.7.0',
      args: ['upgrade', '--from', '0.6.8'],
    });
    expect(result.stderr.trim().split('\n')).toEqual([
      "astryx: answered by CLI 0.7.0 with Core 0.7.0, the release that matches this project's Core",
      'stand-in 0.7.0',
    ]);
  });

  it('answers a Core-only project itself, as released, with no line and no install', () => {
    const cache = tempDir('cache');
    const root = project(tempDir(), {'@astryxdesign/core': '0.7.0'});
    installCore(root, '0.7.0');
    const result = run(root, ['docs', '--json'], {cache});
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout).meta.answeredBy).toEqual({
      cli: SELF_VERSION,
      core: '0.7.0',
      copy: 'starting',
    });
    expect(fs.existsSync(path.join(cache, 'astryx', 'releases', '0.7.0'))).toBe(
      false,
    );
  });
});

describe('answering itself', () => {
  it('outside a project: one line in text mode, answeredBy in JSON', () => {
    const empty = tempDir('empty');
    const text = run(empty, ['--version']);
    expect(text.stdout.trim()).toBe(SELF_VERSION);
    expect(text.stderr.trim()).toBe(
      `astryx: answered by CLI ${SELF_VERSION} with Core ${SELF_VERSION}, outside a project`,
    );
    const json = run(empty, ['docs', '--json']);
    expect(json.stderr).toBe('');
    expect(JSON.parse(json.stdout).meta.answeredBy).toEqual({
      cli: SELF_VERSION,
      core: SELF_VERSION,
      copy: 'carried',
    });
  });
});

describe('answeredBy on every successful JSON result', () => {
  it('covers the manifest, the version, and help', () => {
    const empty = tempDir('empty');
    for (const args of [
      ['manifest', '--json'],
      ['--json'],
      ['--version', '--json'],
      ['component', '--help', '--json'],
    ]) {
      const result = run(empty, args);
      expect(result.status, args.join(' ')).toBe(0);
      expect(
        JSON.parse(result.stdout).meta?.answeredBy,
        args.join(' '),
      ).toEqual({
        cli: SELF_VERSION,
        core: SELF_VERSION,
        copy: 'carried',
      });
    }
  });
});

describe('computer-level commands are never handed to a project', () => {
  it('answers init --user itself inside a project whose CLI is another release', () => {
    const root = project(tempDir(), {'@astryxdesign/core': '0.6.8'});
    installCore(root, '0.6.8');
    installStandInCli(root, '0.6.8');
    for (const args of [
      ['init', '--user'],
      ['--json', 'init', '--user', '--remove-agents'],
    ]) {
      const result = run(root, args);
      expect(result.status, result.stderr).toBe(0);
      expect(result.stdout).not.toContain('"version":"0.6.8"');
      expect(result.stderr).not.toContain('stand-in');
    }
    const text = run(root, ['init', '--user']);
    expect(text.stderr.split('\n')[0]).toBe(
      `astryx: answered by CLI ${SELF_VERSION} with Core ${SELF_VERSION}, for this computer`,
    );
  });
});

describe('update notices through the real bin (FR10)', () => {
  it('prints the project notice after the command, once a day, never with --json, in CI, or with NO_UPDATE_NOTIFIER', () => {
    const [major, minor, patch] = CLI_VERSION.split(/[.-]/u).map(Number);
    const newest = `${major}.${minor}.${patch + 1}`;
    const root = project(tempDir(), {
      '@astryxdesign/core': CLI_VERSION,
      '@astryxdesign/cli': CLI_VERSION,
    });
    installCore(root, CLI_VERSION);
    linkThisCliAsProjectCli(root);
    writeJson(path.join(root, 'package-lock.json'), {lockfileVersion: 3});
    const cache = tempDir('cache');
    const home = tempDir('home');
    writeJson(path.join(home, '.config', 'astryx', 'state.json'), {
      latest: newest,
      checkOkAt: 1,
    });
    const notice = [
      `A new release of Astryx is available: ${CLI_VERSION} → ${newest}`,
      `To upgrade, run: npm install @astryxdesign/core@${newest} @astryxdesign/cli@${newest}, then npx astryx upgrade --from ${CLI_VERSION} --apply`,
    ];
    for (const env of [{CI: 'true'}, {NO_UPDATE_NOTIFIER: '1'}]) {
      const off = run(root, ['--version'], {cache, home, env});
      expect(off.stderr).not.toContain('A new release');
    }
    const json = run(root, ['--version', '--json'], {cache, home});
    expect(json.status).toBe(0);
    expect(json.stderr).not.toContain('A new release');
    const first = run(root, ['--version'], {cache, home});
    expect(first.status).toBe(0);
    expect(first.stdout.trim()).toBe(CLI_VERSION);
    expect(first.stderr.trim().split('\n').slice(-2)).toEqual(notice);
    const second = run(root, ['--version'], {cache, home});
    expect(second.stderr).not.toContain('A new release');
  });
});

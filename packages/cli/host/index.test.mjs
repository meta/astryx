// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The host entry, `@astryxdesign/cli/host` (spec AST-081 FR1): every
 * input is checked before anything runs, one run per process, a run matches
 * the bin's, printed commands start with the host's command name, and a
 * project CLI the host declined is never run (FR2, FR9).
 */

import {describe, it, expect, afterEach} from 'vitest';
import {spawnSync} from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {fileURLToPath} from 'node:url';
import {
  cleanupFixtures,
  installCore,
  installStandInCli,
  project,
  tempDir,
} from '../test-utils/release-fixtures.mjs';
import {runHostedCli} from './index.mjs';

const HOST = fileURLToPath(new URL('./index.mjs', import.meta.url));
const BIN = fileURLToPath(
  new URL('../clients/cli/bin/astryx.mjs', import.meta.url),
);
const SELF_VERSION = JSON.parse(
  fs.readFileSync(
    fileURLToPath(new URL('../package.json', import.meta.url)),
    'utf-8',
  ),
).version;

afterEach(cleanupFixtures);

/**
 * A private home and cache, offline, and none of the test runner's package
 * manager or CI settings.
 * @returns {Record<string, string>}
 */
function cleanEnv() {
  const home = tempDir('home');
  const cache = tempDir('cache');
  return {
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
    npm_config_registry: 'http://127.0.0.1:9',
  };
}

/**
 * Start a host process that calls `runHostedCli` with `options` (once, or
 * twice with `{twice: true}`) and exits with the returned status.
 * @param {Record<string, unknown>} options
 * @param {{twice?: boolean, env?: Record<string, string>}} [extra]
 */
function host(options, extra = {}) {
  const script = `
const {runHostedCli} = await import(${JSON.stringify(HOST)});
const options = ${JSON.stringify(options)};
${
  extra.twice
    ? `const first = runHostedCli(options);
try { await runHostedCli(options); } catch (err) { process.stderr.write('second: ' + err.message + '\\n'); }
const {status} = await first;`
    : `const {status} = await runHostedCli(options);`
}
process.exitCode = status;
`;
  const result = spawnSync(
    process.execPath,
    ['--input-type=module', '-e', script],
    {
      cwd: tempDir('host-cwd'),
      encoding: 'utf-8',
      env: extra.env ?? cleanEnv(),
      timeout: 60_000,
    },
  );
  return {status: result.status, stdout: result.stdout, stderr: result.stderr};
}

/**
 * Run the bin itself in `cwd`.
 * @param {string} cwd
 * @param {string[]} args
 * @param {Record<string, string>} env
 */
function bin(cwd, args, env) {
  const result = spawnSync(process.execPath, [BIN, ...args], {
    cwd,
    encoding: 'utf-8',
    env,
    timeout: 60_000,
  });
  return {status: result.status, stdout: result.stdout, stderr: result.stderr};
}

describe('inputs', () => {
  it('rejects every invalid input before running anything', async () => {
    const before = process.cwd();
    const cases = [
      [null, /options must be an object/u],
      [['--version'], /options must be an object/u],
      [{handlers: {}}, /unknown option "handlers"/u],
      [
        {projectCliAlreadyHandled: true},
        /unknown option "projectCliAlreadyHandled"/u,
      ],
      [{roots: '/tmp'}, /roots must be an array of folder paths/u],
      [{roots: ['']}, /roots must be an array of folder paths/u],
      [
        {roots: [path.join(tempDir(), 'missing')]},
        /roots names a path that is not a folder/u,
      ],
      [
        {integrations: 'acme'},
        /integrations must be an array of package names/u,
      ],
      [
        {integrations: ['Acme Widgets']},
        /integrations must be an array of package names/u,
      ],
      [
        {integrations: ['../acme']},
        /integrations must be an array of package names/u,
      ],
      [
        {discoverSources: [{}]},
        /discoverSources must be an array of functions/u,
      ],
      [{argv: '--version'}, /argv must be an array of strings/u],
      [{argv: [1]}, /argv must be an array of strings/u],
      [{cwd: 7}, /cwd must be a folder path/u],
      [{cwd: path.join(tempDir(), 'missing')}, /cwd is not a folder/u],
      [{cliCommand: ''}, /cliCommand/u],
      [{cliCommand: ' acme astryx'}, /cliCommand/u],
      [{cliCommand: 'acme\nastryx'}, /cliCommand/u],
      [{cliCommand: 'a'.repeat(121)}, /cliCommand/u],
      [{cliCommand: 'acme ASTRYX:START'}, /cliCommand/u],
      [
        {declinedProjectCli: ''},
        /declinedProjectCli must be a non-blank single line/u,
      ],
      [
        {declinedProjectCli: 'a\nb'},
        /declinedProjectCli must be a non-blank single line/u,
      ],
      [
        {declinedProjectCli: ' untrusted'},
        /declinedProjectCli must be a non-blank single line/u,
      ],
      [
        {declinedProjectCli: 'x'.repeat(121)},
        /declinedProjectCli must be a non-blank single line/u,
      ],
      [
        {declinedProjectCli: 3},
        /declinedProjectCli must be a non-blank single line/u,
      ],
    ];
    for (const [options, message] of cases) {
      await expect(runHostedCli(/** @type {any} */ (options))).rejects.toThrow(
        message,
      );
    }
    await expect(
      runHostedCli(/** @type {any} */ ({argv: 'x'})),
    ).rejects.toBeInstanceOf(TypeError);
    expect(process.cwd()).toBe(before);
  });
});

describe('one run per process', () => {
  it('fails a second call before it runs anything, and the first run completes', () => {
    const empty = tempDir('empty');
    const result = host({argv: ['--version'], cwd: empty}, {twice: true});
    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe(SELF_VERSION);
    expect(result.stderr).toMatch(
      /second: runHostedCli: a run already started in this process/u,
    );
  });
});

describe('a hosted run matches the bin', () => {
  it('gives the same exit status, output, and standard-error line', () => {
    const empty = tempDir('empty');
    const env = cleanEnv();
    for (const args of [
      ['--version'],
      ['component', 'Buttn'],
      ['docs', '--json'],
    ]) {
      const direct = bin(empty, args, env);
      const hosted = host({argv: args, cwd: empty}, {env});
      expect(hosted.status).toBe(direct.status);
      expect(hosted.stdout).toBe(direct.stdout);
      expect(hosted.stderr).toBe(direct.stderr);
    }
  });
});

describe('the command name', () => {
  it('starts the commands help prints with the host name', () => {
    const empty = tempDir('empty');
    const hosted = host({
      argv: ['--help'],
      cwd: empty,
      cliCommand: 'acme astryx',
    });
    expect(hosted.status).toBe(0);
    expect(hosted.stdout).toContain('See acme astryx docs global.');
    const direct = host({argv: ['--help'], cwd: empty});
    expect(direct.stdout).not.toContain('acme astryx');
  });
});

describe('a project CLI the host declined', () => {
  /** A project whose own CLI is a stand-in that reports when it runs. */
  function projectWithCli(version, core = version) {
    const root = project(tempDir(), {
      '@astryxdesign/core': core,
      '@astryxdesign/cli': version,
    });
    installCore(root, core);
    installStandInCli(root, version);
    return root;
  }

  it('without a reason, the run is handed to the project CLI', () => {
    const root = projectWithCli('0.6.8');
    const result = host({argv: ['--version'], cwd: root});
    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe('0.6.8');
  });

  it.each(['cannot-start', 'untrusted'])(
    '%s: another release answers itself, with the fallback warning naming the reason',
    reason => {
      const root = projectWithCli('0.6.8');
      const text = host({
        argv: ['--version'],
        cwd: root,
        declinedProjectCli: reason,
      });
      expect(text.status).toBe(0);
      expect(text.stdout.trim()).toBe(SELF_VERSION);
      expect(text.stderr).not.toContain('stand-in');
      expect(text.stderr.trim()).toBe(
        `astryx: could not get Astryx 0.6.8 to match this project's Core (project CLI skipped: ${reason}); answering with CLI ${SELF_VERSION} instead`,
      );
      const json = host({
        argv: ['docs', '--json'],
        cwd: root,
        declinedProjectCli: reason,
      });
      expect(json.status).toBe(0);
      expect(json.stderr).toBe('');
      expect(JSON.parse(json.stdout).meta.answeredBy.copy).toBe('fallback');
    },
  );

  it("the declined CLI's own release answers in its place, named as that CLI's release", () => {
    // The project's CLI is this release while its Core is another, so the
    // answer is the project CLI's release, not the release matched to Core.
    const root = projectWithCli(SELF_VERSION, '0.6.8');
    const json = host({
      argv: ['docs', '--json'],
      cwd: root,
      declinedProjectCli: 'untrusted',
    });
    expect(json.status).toBe(0);
    expect(json.stderr).toBe('');
    expect(JSON.parse(json.stdout).meta.answeredBy).toMatchObject({
      cli: SELF_VERSION,
      core: '0.6.8',
      copy: 'project',
    });
    const text = host({
      argv: ['--version'],
      cwd: root,
      declinedProjectCli: 'untrusted',
    });
    expect(text.status).toBe(0);
    expect(text.stdout.trim()).toBe(SELF_VERSION);
    expect(text.stderr.trim()).toBe(
      `astryx: answered by CLI ${SELF_VERSION}, the release of this project's CLI, in its place (project CLI skipped: untrusted)`,
    );
  });
});

// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file One test per row of AST-081's "Who answers when global and project
 * copies meet" table (spec AST-081 FR11). Each row runs real copies of this
 * CLI, packed the way it is published and labeled with test versions, in the
 * install layouts the row names, with a private home folder, cache, and
 * search path, and checks who answered and what the run printed.
 *
 * Rows that depend on an operating system's own file system (G25, G26) test
 * their path rules here; on macOS and Windows themselves they run only in
 * the cross-platform smoke workflow.
 */

import {afterAll, afterEach, beforeAll, describe, expect, it} from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {spawn, spawnSync} from 'node:child_process';
import {
  globalCli,
  packedCli,
  placeCli,
  seedPackedRelease,
  startRegistry,
} from '../test-utils/global-local-fixtures.mjs';
import {
  CLI_VERSION,
  cleanupFixtures,
  installCore,
  project,
  tempDir,
  writeJson,
} from '../test-utils/release-fixtures.mjs';
import {installPlaceOf, isGlobalCopy} from '../foundation/release/choose.mjs';
import {globalUpgradeCommand} from '../foundation/release/notices.mjs';
import {relativeWithin, samePath} from '../foundation/fs/path-compare.mjs';
import {userCacheDir} from '../foundation/env/user-dirs.mjs';
import {astryxCommandsOnSearchPath} from '../foundation/env/search-path.mjs';
import {npmCommand, tryLock} from '../foundation/release/cache.mjs';
import {LEASE_SILENCE_MS} from '../foundation/release/lock-lease.mjs';

const POSIX = process.platform !== 'win32';
const ROOT = typeof process.getuid === 'function' && process.getuid() === 0;
const OFFLINE = 'http://127.0.0.1:9/';

beforeAll(() => {
  packedCli();
}, 120_000);
afterEach(cleanupFixtures);
afterAll(() => {
  fs.rmSync(path.dirname(packedCli()), {recursive: true, force: true});
});

/**
 * A private computer: a home folder, a cache, and a search path.
 * @param {{path?: string[]}} [options]
 */
function computer(options = {}) {
  const home = tempDir('home');
  const cache = path.join(home, '.cache');
  // A `node` command for scripts that start with `#!/usr/bin/env node`, and
  // the runner's npm, linked to its entry file as distributions install it,
  // so a run finds npm wherever this Node keeps it.
  const nodeBin = tempDir('node-bin');
  fs.symlinkSync(process.execPath, path.join(nodeBin, 'node'));
  const npm = npmCommand();
  if (POSIX && npm.prefix.length > 0) {
    fs.symlinkSync(npm.prefix[0], path.join(nodeBin, 'npm'));
  }
  return {
    home,
    cache,
    /** The `astryx` cache folder global mode uses. */
    astryxCache: path.join(cache, 'astryx'),
    path: [...(options.path ?? []), nodeBin],
  };
}

/**
 * The environment a run gets on a private computer.
 * @param {ReturnType<typeof computer>} pc
 * @param {Record<string, string | undefined>} [env]
 */
function envOf(pc, env = {}) {
  const base = Object.fromEntries(
    Object.entries(process.env).filter(
      // A proxy would carry the request for the local test registry away.
      ([k]) =>
        !/^(?:npm_|XDG_|ASTRYX|CI$|NO_UPDATE_NOTIFIER$|(?:https?|all|no)_proxy$)/iu.test(
          k,
        ),
    ),
  );
  return {
    ...base,
    HOME: pc.home,
    USERPROFILE: pc.home,
    XDG_CACHE_HOME: pc.cache,
    XDG_CONFIG_HOME: path.join(pc.home, '.config'),
    PATH: pc.path.join(path.delimiter),
    npm_config_registry: OFFLINE,
    npm_config_update_notifier: 'false',
    // An unreachable registry fails at once instead of after npm's backoff.
    npm_config_fetch_retry_mintimeout: '50',
    npm_config_fetch_retry_maxtimeout: '100',
    NO_COLOR: '1',
    ...env,
  };
}

/**
 * Run an `astryx` entry file with node, on a private computer.
 * @param {string} bin
 * @param {string[]} args
 * @param {{cwd: string, pc: ReturnType<typeof computer>, env?: Record<string, string | undefined>}} options
 */
function run(bin, args, {cwd, pc, env = {}}) {
  const result = spawnSync(process.execPath, [bin, ...args], {
    cwd,
    encoding: 'utf8',
    env: envOf(pc, env),
    timeout: 60_000,
  });
  return {
    status: result.status,
    stdout: result.stdout.trim(),
    stderr: result.stderr,
    /** The stderr lines that start with `astryx: `. */
    lines: result.stderr
      .split(/\r?\n/u)
      .filter(line => line.startsWith('astryx: ')),
    /** The update notice lines (FR10). */
    notice: result.stderr
      .split(/\r?\n/u)
      .filter(line =>
        /^(?:A new release of Astryx|To upgrade|The astryx command)/u.test(
          line,
        ),
      ),
  };
}

/**
 * A project with Core installed at `core`, and its own CLI at `cli`.
 * @param {{core?: string, cli?: string, brokenCli?: string, declare?: Record<string, string>}} spec
 */
function makeProject({core, cli, brokenCli, declare}) {
  const deps = {
    ...(core ? {'@astryxdesign/core': core} : {}),
    ...(cli ? {'@astryxdesign/cli': cli} : {}),
    ...(brokenCli ? {'@astryxdesign/cli': brokenCli} : {}),
    ...declare,
  };
  const dir = project(tempDir('project'), deps);
  if (core) installCore(dir, core);
  if (cli)
    placeCli(path.join(dir, 'node_modules', '@astryxdesign', 'cli'), cli);
  // A project CLI that cannot start: its package, with no astryx command.
  if (brokenCli) {
    writeJson(
      path.join(dir, 'node_modules', '@astryxdesign', 'cli', 'package.json'),
      {
        name: '@astryxdesign/cli',
        version: brokenCli,
      },
    );
  }
  return dir;
}

/**
 * What discover lists as available beyond the official Astryx list, which it
 * always reads.
 * @param {any} discover
 * @returns {any[]}
 */
const notOfficial = discover =>
  (discover.meta?.available ?? []).filter(
    (/** @type {any} */ entry) => entry.source !== 'Astryx',
  );

/** doctor's fix where no install command fits (spec AST-081 FR2). */
const DOCTOR_RUN_FROM_PROJECT =
  "Run this from the Astryx project's folder, or declare an Astryx package in this folder's package.json to make it a project of its own.";

/**
 * The hint's advice in a folder whose package.json is not the project's: the
 * same words as doctor's, naming no command (spec AST-081 FR5).
 */
const RUN_FROM_PROJECT = DOCTOR_RUN_FROM_PROJECT;

/**
 * The once-a-day hint in a project with no CLI of its own.
 * @param {string} answered
 * @param {string} core
 */
const noCliHint = (answered, core) =>
  `astryx: this project has no Astryx CLI installed; answered by CLI ${answered} while its Core is ${core}. To match, run: npm install @astryxdesign/cli@${core}`;

/** @param {string} version */
const handedTo = version => (/** @type {string} */ from) =>
  `astryx: answered by this project's CLI ${version}, handed over from CLI ${from}`;
/** @param {string} version */
const matchedLine = version =>
  `astryx: answered by CLI ${version} with Core ${version}, the release that matches this project's Core`;
/** @param {string} version */
const outsideLine = version =>
  `astryx: answered by CLI ${version} with Core ${version}, outside a project`;

/**
 * Every file under `dir`, for before-and-after comparisons.
 * @param {string} dir
 * @returns {string[]}
 */
function filesIn(dir) {
  /** @type {string[]} */
  const out = [];
  const walk = (/** @type {string} */ d) => {
    for (const entry of fs.readdirSync(d, {withFileTypes: true})) {
      const p = path.join(d, entry.name);
      if (entry.isDirectory()) walk(p);
      else out.push(path.relative(dir, p));
    }
  };
  walk(dir);
  return out.sort();
}

/**
 * Write the global copy's state.
 * @param {ReturnType<typeof computer>} pc
 * @param {Record<string, unknown>} state
 */
function globalState(pc, state) {
  writeJson(path.join(pc.home, '.config', 'astryx', 'state.json'), state);
}

/**
 * The saved state.
 * @param {ReturnType<typeof computer>} pc
 * @returns {Record<string, any>}
 */
function readState(pc) {
  try {
    return JSON.parse(
      fs.readFileSync(
        path.join(pc.home, '.config', 'astryx', 'state.json'),
        'utf8',
      ),
    );
  } catch {
    return {};
  }
}

/**
 * An integration (by default `@acme/widgets`) installed in `root`'s
 * node_modules, with one doc topic; `manifest` replaces its manifest's text.
 * @param {string} root
 * @param {{topic: string, peers?: Record<string, string>, name?: string, manifest?: string}} options
 */
function acmeWidgets(root, {topic, peers, name = '@acme/widgets', manifest}) {
  const dir = path.join(root, 'node_modules', ...name.split('/'));
  writeJson(path.join(dir, 'package.json'), {
    name,
    version: '1.0.0',
    ...(peers ? {peerDependencies: peers} : {}),
  });
  fs.writeFileSync(
    path.join(dir, 'astryx.integration.mjs'),
    manifest ?? "export default {docs: './docs'};\n",
  );
  fs.mkdirSync(path.join(dir, 'docs'), {recursive: true});
  fs.writeFileSync(
    path.join(dir, 'docs', `${topic}.doc.mjs`),
    `export const docs = ${JSON.stringify({
      type: 'generic',
      name: topic,
      title: 'Deploying',
      description: 'How to ship an app built with Acme widgets.',
      category: 'guide',
      sections: [
        {
          title: 'Overview',
          content: [{type: 'prose', text: 'Push the button.'}],
        },
      ],
    })};\n`,
  );
  return dir;
}

/** The two lines of a newer-release notice. */
const available = (/** @type {string} */ cur, /** @type {string} */ next) =>
  `A new release of Astryx is available: ${cur} → ${next}`;

describe.skipIf(!POSIX)(
  'who answers when global and project copies meet',
  () => {
    it('G1 global copy newer than the project CLI, which matches its Core', () => {
      const pc = computer();
      const g = globalCli('npm', '9.0.1', {root: pc.home});
      const dir = makeProject({core: '9.0.0', cli: '9.0.0'});
      const r = run(g.bin, ['--version'], {cwd: dir, pc});
      expect(r.status).toBe(0);
      expect(r.stdout).toBe('9.0.0');
      expect(r.lines).toEqual([handedTo('9.0.0')('9.0.1')]);
    });

    it('G2 global copy older than the project CLI', () => {
      const pc = computer();
      const g = globalCli('npm', '9.0.0', {root: pc.home});
      const dir = makeProject({core: '9.0.1', cli: '9.0.1'});
      const r = run(g.bin, ['--version'], {cwd: dir, pc});
      expect(r.stdout).toBe('9.0.1');
      expect(r.lines).toEqual([handedTo('9.0.1')('9.0.0')]);
    });

    it("G3 the project CLI differs from its Core: the project's own CLI answers, as before global mode", () => {
      const pc = computer();
      const g = globalCli('npm', '9.0.5', {root: pc.home});
      seedPackedRelease(pc.astryxCache, '9.0.1');
      const dir = makeProject({core: '9.0.1', cli: '9.0.0'});
      const r = run(g.bin, ['--version'], {cwd: dir, pc});
      expect(r.stdout).toBe('9.0.0');
      expect(r.lines).toEqual([handedTo('9.0.0')('9.0.5')]);
    });

    it('G4 Core only, no CLI: the copy that started the run answers, as released, with a hint once a day; nothing is installed', () => {
      const pc = computer();
      const g = globalCli('npm', '9.0.0', {root: pc.home});
      const dir = makeProject({core: '9.0.1'});
      const r = run(g.bin, ['--version'], {cwd: dir, pc});
      expect(r.stdout).toBe('9.0.0');
      expect(r.lines).toEqual([noCliHint('9.0.0', '9.0.1')]);
      // Once a day per project.
      expect(run(g.bin, ['--version'], {cwd: dir, pc}).lines).toEqual([]);
      const json = run(g.bin, ['docs', '--json'], {cwd: dir, pc});
      expect(JSON.parse(json.stdout).meta.answeredBy).toEqual({
        cli: '9.0.0',
        core: '9.0.1',
        copy: 'starting',
      });
      // Nothing is installed for the project (the global copy's own Core
      // step, G52, is the only thing that may touch the cache).
      expect(
        fs.existsSync(path.join(pc.astryxCache, 'releases', '9.0.1')),
      ).toBe(false);
      expect(
        fs.existsSync(
          path.join(pc.astryxCache, 'releases', '.failed-9.0.1.json'),
        ),
      ).toBe(false);
      // A copy equal to the project's Core prints no hint.
      const same = makeProject({core: '9.0.0'});
      expect(run(g.bin, ['--version'], {cwd: same, pc}).lines).toEqual([]);
    });

    it('G5 a fresh clone, nothing installed: the copy that started the run answers, naming the Core its lockfile records, writing nothing there', () => {
      const pc = computer();
      const g = globalCli('npm', '9.0.0', {root: pc.home});
      const dir = makeProject({declare: {'@astryxdesign/core': '^9.0.0'}});
      writeJson(path.join(dir, 'package-lock.json'), {
        lockfileVersion: 3,
        packages: {
          '': {dependencies: {'@astryxdesign/core': '^9.0.0'}},
          'node_modules/@astryxdesign/core': {version: '9.0.1'},
        },
      });
      const before = filesIn(dir);
      const r = run(g.bin, ['--version'], {cwd: dir, pc});
      expect(r.stdout).toBe('9.0.0');
      expect(r.lines).toEqual([noCliHint('9.0.0', '9.0.1')]);
      // A command that reads Core uses the answering release's own Core; when
      // it cannot be downloaded, the error says so for this project.
      const offline = run(g.bin, ['component', 'Button', '--json'], {
        cwd: dir,
        pc,
      });
      const error = JSON.parse(offline.stdout);
      expect(error.code).toBe('ERR_VERSIONS_UNAVAILABLE');
      expect(error.error).toMatch(
        /^This project has no Core installed, and Core 9\.0\.0 could not be downloaded \(.+\)\. Install the project's dependencies, then run again\.$/u,
      );
      expect(error.error).not.toMatch(/Outside a project/u);
      expect(filesIn(dir)).toEqual(before);
    });

    it("in a fresh clone, doctor names the lockfile's Core as the daily hint and notice do", () => {
      const pc = computer();
      const g = globalCli('npm', '9.0.0', {root: pc.home});
      globalState(pc, {
        latest: '9.0.5',
        checkOkAt: Date.now(),
        firstRunAt: Date.now() - 2 * 24 * 60 * 60_000,
      });
      const dir = makeProject({declare: {'@astryxdesign/core': '^9.0.0'}});
      writeJson(path.join(dir, 'package-lock.json'), {
        lockfileVersion: 3,
        packages: {
          '': {dependencies: {'@astryxdesign/core': '^9.0.0'}},
          'node_modules/@astryxdesign/core': {version: '9.0.1'},
        },
      });
      const notice = run(g.bin, ['--version'], {cwd: dir, pc}).notice;
      expect(notice[1]).toBe(
        'To upgrade, run: npm install @astryxdesign/core@9.0.5 @astryxdesign/cli@9.0.5, then npx astryx upgrade --from 9.0.1 --apply',
      );
      const doctor = JSON.parse(
        run(g.bin, ['doctor', '--json'], {cwd: dir, pc}).stdout,
      );
      const check = (/** @type {string} */ id) =>
        doctor.data.checks.find((/** @type {any} */ c) => c.id === id);
      // FR2's warning, with the Core the lockfile records.
      expect(check('version-alignment')).toMatchObject({
        status: 'warn',
        message:
          'This project has no Astryx CLI installed; CLI 9.0.0, the one you started, answered while its Core is 9.0.1.',
        fix: 'To match, run: npm install @astryxdesign/cli@9.0.1.',
      });
      // The same release and upgrade step as the notice.
      expect(check('newest-release').message).toBe(
        'This project uses Astryx 9.0.1; 9.0.5 is the newest.',
      );
      expect(check('newest-release').fix).toContain(
        'npx astryx upgrade --from 9.0.1 --apply',
      );
    });

    it("in a tool folder that installs its own Core inside a project, the hint and doctor say to run from the project's folder, and the notice upgrades the project", () => {
      const pc = computer();
      const g = globalCli('npm', '9.0.0', {root: pc.home});
      globalState(pc, {
        latest: '9.0.7',
        checkOkAt: Date.now(),
        firstRunAt: Date.now() - 2 * 24 * 60 * 60_000,
      });
      const app = makeProject({core: '9.0.1'});
      writeJson(path.join(app, 'package-lock.json'), {lockfileVersion: 3});
      const tool = path.join(app, 'tools', 'codegen');
      writeJson(path.join(tool, 'package.json'), {name: 'codegen'});
      installCore(tool, '9.0.5');
      const before = fs.readFileSync(path.join(tool, 'package.json'), 'utf8');

      const r = run(g.bin, ['--version'], {cwd: tool, pc});
      expect(r.lines).toContain(
        `astryx: this project has no Astryx CLI installed; answered by CLI 9.0.0 while its Core is 9.0.5. ${RUN_FROM_PROJECT}`,
      );
      expect(r.notice).toEqual([
        'A new release of Astryx is available: 9.0.1 → 9.0.7',
        `To upgrade, run: cd ${app} && npm install @astryxdesign/core@9.0.7 @astryxdesign/cli@9.0.7, then cd ${app} && npx astryx upgrade --from 9.0.1 --apply`,
      ]);
      const doctor = JSON.parse(
        run(g.bin, ['doctor', '--json'], {cwd: tool, pc}).stdout,
      );
      // The same comparison and Core as the hint: the Core the run reads.
      expect(
        doctor.data.checks.find(
          (/** @type {any} */ c) => c.id === 'version-alignment',
        ),
      ).toMatchObject({
        status: 'warn',
        message:
          'This project has no Astryx CLI installed; CLI 9.0.0, the one you started, answered while its Core is 9.0.5.',
        fix: DOCTOR_RUN_FROM_PROJECT,
      });
      expect(doctor.meta.answeredBy.core).toBe('9.0.5');
      // Nothing above suggests adding Astryx to the tool's own package.json.
      expect(
        [...r.lines, ...r.notice].some(line => /run: npm install/u.test(line)),
      ).toBe(false);
      expect(fs.readFileSync(path.join(tool, 'package.json'), 'utf8')).toBe(
        before,
      );
    });

    it('in a tool folder whose Core matches the CLI inside a project on another Core, neither the hint nor doctor warns', () => {
      const pc = computer();
      const g = globalCli('npm', '9.0.0', {root: pc.home});
      const app = makeProject({core: '9.0.1'});
      writeJson(path.join(app, 'package-lock.json'), {lockfileVersion: 3});
      const tool = path.join(app, 'tools', 'codegen');
      writeJson(path.join(tool, 'package.json'), {name: 'codegen'});
      installCore(tool, '9.0.0');

      const r = run(g.bin, ['--version'], {cwd: tool, pc});
      expect(r.lines.filter(line => line.includes('no Astryx CLI'))).toEqual(
        [],
      );
      const doctor = JSON.parse(
        run(g.bin, ['doctor', '--json'], {cwd: tool, pc}).stdout,
      );
      const check = doctor.data.checks.find(
        (/** @type {any} */ c) => c.id === 'version-alignment',
      );
      expect(check.status).toBe('info');
      expect(check).not.toHaveProperty('fix');
    });

    it('in a folder with no package.json inside a home folder that installs Astryx, gives no project advice', () => {
      const pc = computer();
      const g = globalCli('npm', '9.0.0', {root: pc.home});
      globalState(pc, {
        latest: '9.0.7',
        checkOkAt: Date.now(),
        firstRunAt: Date.now() - 2 * 24 * 60 * 60_000,
      });
      writeJson(path.join(pc.home, 'package.json'), {
        name: 'home',
        dependencies: {'@astryxdesign/core': '9.0.1'},
      });
      writeJson(path.join(pc.home, 'package-lock.json'), {lockfileVersion: 3});
      installCore(pc.home, '9.0.1');
      const folder = path.join(pc.home, 'notes');
      fs.mkdirSync(folder, {recursive: true});

      const r = run(g.bin, ['--version'], {cwd: folder, pc});
      expect(r.lines.filter(line => line.includes('no Astryx CLI'))).toEqual(
        [],
      );
      expect(r.notice).toEqual([]);
    });

    it("in a tool folder whose project installs its own CLI, doctor's alignment fix points at the project, not at a command that leaves the warning", () => {
      const pc = computer();
      const g = globalCli('npm', '9.0.0', {root: pc.home});
      const app = makeProject({core: '9.0.1', cli: '9.0.0'});
      writeJson(path.join(app, 'package-lock.json'), {lockfileVersion: 3});
      const tool = path.join(app, 'tools', 'codegen');
      writeJson(path.join(tool, 'package.json'), {name: 'codegen'});
      installCore(tool, '9.0.5');

      const doctor = JSON.parse(
        run(g.bin, ['doctor', '--json'], {cwd: tool, pc}).stdout,
      );
      const check = doctor.data.checks.find(
        (/** @type {any} */ c) => c.id === 'version-alignment',
      );
      expect(check).toMatchObject({
        status: 'warn',
        fix: DOCTOR_RUN_FROM_PROJECT,
      });
      // The message keeps naming the Core this folder reads.
      expect(check.message).toContain('Core is 9.0.5');
    });

    it('in a folder that installs Core with no Astryx project above, gives no install advice', () => {
      const pc = computer();
      const g = globalCli('npm', '9.0.0', {root: pc.home});
      globalState(pc, {
        latest: '9.0.7',
        checkOkAt: Date.now(),
        firstRunAt: Date.now() - 2 * 24 * 60 * 60_000,
      });
      const tool = tempDir('tool');
      writeJson(path.join(tool, 'package.json'), {name: 'codegen'});
      writeJson(path.join(tool, 'package-lock.json'), {lockfileVersion: 3});
      installCore(tool, '9.0.5');

      const r = run(g.bin, ['--version'], {cwd: tool, pc});
      expect(r.lines.filter(line => line.includes('To match'))).toEqual([]);
      expect(r.notice).toEqual([]);
      const doctor = JSON.parse(
        run(g.bin, ['doctor', '--json'], {cwd: tool, pc}).stdout,
      );
      expect(
        doctor.data.checks.find(
          (/** @type {any} */ c) => c.id === 'version-alignment',
        ),
      ).toMatchObject({
        status: 'warn',
        fix: DOCTOR_RUN_FROM_PROJECT,
      });
      // The skip says why, so doctor does not claim nothing newer is known.
      expect(readState(pc).noticeSkips?.project?.reason).toBe('no-project');
    });

    it("in a member its workspace lists, which declares no Astryx package, the advice stays the member's own, as before", () => {
      const pc = computer();
      const g = globalCli('npm', '9.0.0', {root: pc.home});
      globalState(pc, {
        latest: '9.0.7',
        checkOkAt: Date.now(),
        firstRunAt: Date.now() - 2 * 24 * 60 * 60_000,
      });
      const root = makeProject({core: '9.0.1'});
      const rootPkg = JSON.parse(
        fs.readFileSync(path.join(root, 'package.json'), 'utf8'),
      );
      writeJson(path.join(root, 'package.json'), {
        ...rootPkg,
        workspaces: ['apps/*'],
      });
      writeJson(path.join(root, 'package-lock.json'), {lockfileVersion: 3});
      const member = path.join(root, 'apps', 'web');
      writeJson(path.join(member, 'package.json'), {name: 'web'});
      installCore(member, '9.0.5');

      const r = run(g.bin, ['--version'], {cwd: member, pc});
      const all = [...r.lines, ...r.notice].join('\n');
      expect(all).not.toContain(`cd ${root}`);
      expect(r.lines).toContain(noCliHint('9.0.0', '9.0.5'));
    });

    it('G6 the installed Core wins over a lockfile that disagrees, for the release a project whose CLI cannot start gets', () => {
      const pc = computer();
      const g = globalCli('npm', '9.0.0', {root: pc.home});
      seedPackedRelease(pc.astryxCache, '9.0.1');
      const dir = makeProject({core: '9.0.1', brokenCli: '9.0.0'});
      writeJson(path.join(dir, 'package-lock.json'), {
        lockfileVersion: 3,
        packages: {'node_modules/@astryxdesign/core': {version: '9.0.0'}},
      });
      const r = run(g.bin, ['--version'], {cwd: dir, pc});
      expect(r.stdout).toBe('9.0.1');
      expect(r.lines).toEqual([matchedLine('9.0.1')]);
    });

    it('G7 a workspace member with its own Core but no CLI of its own, and any other member, use the root CLI', () => {
      const pc = computer();
      const g = globalCli('npm', '9.0.5', {root: pc.home});
      seedPackedRelease(pc.astryxCache, '9.0.1');
      const root = makeProject({core: '9.0.0', cli: '9.0.0'});
      const member = path.join(root, 'packages', 'app');
      project(member, {'@astryxdesign/core': '9.0.1'});
      installCore(member, '9.0.1');
      const other = path.join(root, 'packages', 'docs');
      fs.mkdirSync(other, {recursive: true});
      expect(run(g.bin, ['--version'], {cwd: member, pc}).stdout).toBe('9.0.0');
      const r = run(g.bin, ['--version'], {cwd: other, pc});
      expect(r.stdout).toBe('9.0.0');
      expect(r.lines).toEqual([handedTo('9.0.0')('9.0.5')]);
    });

    it('G8 a folder inside another project answers with the enclosing project (the released read reach)', () => {
      const pc = computer();
      const g = globalCli('npm', '9.0.5', {root: pc.home});
      const root = makeProject({core: '9.0.0', cli: '9.0.0'});
      const nested = path.join(root, 'apps', 'nested');
      project(nested, {'@astryxdesign/core': '9.0.1'});
      fs.mkdirSync(path.join(root, 'vendor', 'repo', '.git'), {
        recursive: true,
      });
      for (const cwd of [nested, path.join(root, 'vendor', 'repo')]) {
        expect(run(g.bin, ['--version'], {cwd, pc}).stdout).toBe('9.0.0');
      }

      // What prints there (spec AST-040 FR9): an enclosing project with no
      // CLI of its own and a Core the global copy does not match. A cloned
      // repository with its own .git belongs to no project, so it gets no
      // hint and no notice; a tool folder inside the project is told to run
      // from the project's folder.
      const pc2 = computer();
      const g2 = globalCli('npm', '9.0.0', {root: pc2.home});
      globalState(pc2, {
        latest: '9.0.7',
        checkOkAt: Date.now(),
        firstRunAt: Date.now() - 2 * 24 * 60 * 60_000,
      });
      const app = makeProject({core: '9.0.1'});
      writeJson(path.join(app, 'package-lock.json'), {lockfileVersion: 3});
      const clone = path.join(app, 'vendor', 'repo');
      fs.mkdirSync(path.join(clone, '.git'), {recursive: true});
      const inClone = run(g2.bin, ['--version'], {cwd: clone, pc: pc2});
      expect(inClone.stdout).toBe('9.0.0');
      expect(
        inClone.lines.filter(line => line.includes('no Astryx CLI')),
      ).toEqual([]);
      expect(inClone.notice).toEqual([]);
      const tool = path.join(app, 'tools', 'codegen');
      writeJson(path.join(tool, 'package.json'), {name: 'codegen'});
      installCore(tool, '9.0.5');
      expect(run(g2.bin, ['--version'], {cwd: tool, pc: pc2}).lines).toContain(
        `astryx: this project has no Astryx CLI installed; answered by CLI 9.0.0 while its Core is 9.0.5. ${RUN_FROM_PROJECT}`,
      );
    });

    it('G9 outside a project: every copy answers itself, the global copy included, whatever releases are cached', () => {
      const pc = computer();
      const g = globalCli('npm', '9.0.0', {root: pc.home});
      seedPackedRelease(pc.astryxCache, '9.0.2');
      globalState(pc, {firstRunAt: Date.now()});
      const empty = tempDir('empty');
      const r = run(g.bin, ['--version'], {cwd: empty, pc});
      expect(r.stdout).toBe('9.0.0');
      expect(r.lines).toEqual([outsideLine('9.0.0')]);
      const runner = placeCli(
        path.join(
          tempDir('npx'),
          '_npx',
          'abc',
          'node_modules',
          '@astryxdesign',
          'cli',
        ),
        '9.0.3',
      );
      const own = run(runner.bin, ['--version'], {cwd: empty, pc});
      expect(own.stdout).toBe('9.0.3');
      expect(own.lines).toEqual([outsideLine('9.0.3')]);
    });

    it("G10 a version typed on a package runner: exactly that release outside a project, the project's release inside one", () => {
      const pc = computer();
      const runner = placeCli(
        path.join(
          tempDir('npx'),
          '_npx',
          'def',
          'node_modules',
          '@astryxdesign',
          'cli',
        ),
        '9.0.3',
      );
      expect(
        run(runner.bin, ['--version'], {cwd: tempDir('empty'), pc}).stdout,
      ).toBe('9.0.3');
      const dir = makeProject({core: '9.0.1', cli: '9.0.1'});
      const r = run(runner.bin, ['--version'], {cwd: dir, pc});
      expect(r.stdout).toBe('9.0.1');
      expect(r.lines).toEqual([handedTo('9.0.1')('9.0.3')]);
    });

    it('G11 a global copy that predates the hand-off answers itself; newer copies and doctor name its replacement, even in a fresh home', () => {
      const pc = computer();
      // A release from before the hand-off: no release-choice module.
      const old = globalCli('npm', '9.0.0', {root: pc.home});
      fs.rmSync(path.join(old.dir, 'foundation', 'release', 'choose.mjs'));
      pc.path.unshift(old.binDir);
      const dir = makeProject({core: '9.0.1', cli: '9.0.1'});
      const projectBin = path.join(
        dir,
        'node_modules',
        '@astryxdesign',
        'cli',
        'clients',
        'cli',
        'bin',
        'astryx.mjs',
      );
      const r = run(projectBin, ['--version'], {cwd: dir, pc});
      expect(r.stdout).toBe('9.0.1');
      expect(r.lines).toEqual([]);
      expect(r.notice).toEqual([
        'The astryx command on this computer runs CLI 9.0.0, which answers every folder itself.',
        'To upgrade, run: npm i -g --prefix ~/.npm-global @astryxdesign/cli@latest',
      ]);
      expect(run(projectBin, ['--version'], {cwd: dir, pc}).notice).toEqual([]);
      const doctor = JSON.parse(
        run(projectBin, ['doctor', '--json'], {cwd: dir, pc}).stdout,
      );
      expect(
        doctor.data.checks.find(
          (/** @type {any} */ c) => c.id === 'cli-on-path',
        ),
      ).toMatchObject({
        status: 'warn',
        fix: 'To upgrade, run: `npm i -g --prefix ~/.npm-global @astryxdesign/cli@latest`.',
      });
    });

    it('G12 two global installs: the first on the search path starts and answers itself; doctor lists both', () => {
      const pc = computer();
      const npm = globalCli('npm', '9.0.0', {root: pc.home});
      const pnpm = globalCli('pnpm', '9.0.1', {root: pc.home});
      pc.path.unshift(npm.binDir, pnpm.binDir);
      const empty = tempDir('empty');
      expect(run(npm.bin, ['--version'], {cwd: empty, pc}).stdout).toBe(
        '9.0.0',
      );
      expect(run(pnpm.bin, ['--version'], {cwd: empty, pc}).stdout).toBe(
        '9.0.1',
      );
      const doctor = JSON.parse(
        run(npm.bin, ['doctor', '--json'], {cwd: empty, pc}).stdout,
      );
      const check = doctor.data.checks.find(
        (/** @type {any} */ c) => c.id === 'cli-on-path',
      );
      expect(check.status).toBe('pass');
      expect(check.message).toContain(path.join(npm.binDir, 'astryx'));
      expect(check.message).toContain(
        `Later on the search path: ${path.join(pnpm.binDir, 'astryx')} (CLI 9.0.1)`,
      );
    });

    it('G13 an astryx earlier on the search path that is not the Astryx CLI: init --user and doctor warn', () => {
      const pc = computer();
      const other = tempDir('other');
      fs.writeFileSync(path.join(other, 'astryx'), '#!/bin/sh\necho other\n');
      fs.chmodSync(path.join(other, 'astryx'), 0o755);
      const g = globalCli('npm', '9.0.0', {root: pc.home});
      pc.path.unshift(other, g.binDir);
      const empty = tempDir('empty');
      const init = JSON.parse(
        run(g.bin, ['--json', 'init', '--user'], {cwd: empty, pc}).stdout,
      );
      expect(init.data.warnings[0]).toContain('No `astryx` command');
      const doctor = JSON.parse(
        run(g.bin, ['doctor', '--json'], {cwd: empty, pc}).stdout,
      );
      expect(
        doctor.data.checks.find(
          (/** @type {any} */ c) => c.id === 'cli-on-path',
        ).status,
      ).toBe('warn');
    });

    it('the skill outlives the CLI installed for the computer: it repeats the step that installed it, and doctor names it too', () => {
      for (const [layout, step] of /** @type {const} */ ([
        // The npm layout is a prefix in the home folder, so the step names it.
        ['npm', 'npm i -g --prefix ~/.npm-global @astryxdesign/cli'],
        ['pnpm', 'pnpm add -g @astryxdesign/cli'],
        ['bun', 'bun add -g @astryxdesign/cli'],
      ])) {
        const pc = computer();
        let g;
        if (layout === 'bun') {
          // Bun's global folder, as `bun add -g` makes it.
          const global = path.join(pc.home, '.bun', 'install', 'global');
          writeJson(path.join(global, 'package.json'), {
            dependencies: {'@astryxdesign/cli': '9.0.0'},
          });
          fs.writeFileSync(path.join(global, 'bun.lock'), '{}');
          const placed = placeCli(
            path.join(global, 'node_modules', '@astryxdesign', 'cli'),
            '9.0.0',
          );
          const binDir = path.join(pc.home, '.bun', 'bin');
          fs.mkdirSync(binDir, {recursive: true});
          fs.symlinkSync(placed.bin, path.join(binDir, 'astryx'));
          g = {...placed, binDir};
        } else {
          g = globalCli(layout, '9.0.0', {root: pc.home});
        }
        pc.path.unshift(g.binDir);
        const empty = tempDir('empty');
        expect(run(g.bin, ['init', '--user'], {cwd: empty, pc}).status).toBe(0);
        const skill = path.join(
          pc.home,
          '.agents',
          'skills',
          'astryx',
          'SKILL.md',
        );
        expect(fs.readFileSync(skill, 'utf8')).toContain(
          `If \`astryx\` is not found, run \`${step}\` first.`,
        );
        // A restart removes the CLI installed for the computer and keeps the
        // home folder. The way back is a package runner, whose own temporary
        // copy answers; started directly, and with the runner's .bin folder
        // first on the search path, as npx and pnpm dlx put it. That copy
        // does not count, so doctor names the step either way.
        fs.rmSync(path.join(g.binDir, 'astryx'));
        fs.rmSync(g.dir, {recursive: true, force: true});
        pc.path.splice(pc.path.indexOf(g.binDir), 1);
        const runner = placeCli(
          path.join(
            tempDir('npx'),
            '_npx',
            'r1',
            'node_modules',
            '@astryxdesign',
            'cli',
          ),
          '9.0.0',
        );
        const runnerBin = path.join(
          path.dirname(path.dirname(runner.dir)),
          '.bin',
        );
        fs.mkdirSync(runnerBin, {recursive: true});
        fs.symlinkSync(runner.bin, path.join(runnerBin, 'astryx'));
        const agentText = () =>
          JSON.parse(
            run(runner.bin, ['doctor', '--json'], {cwd: empty, pc}).stdout,
          ).data.checks.find(
            (/** @type {any} */ c) => c.id === 'computer-agent-text',
          );
        for (const first of [false, true]) {
          if (first) pc.path.unshift(runnerBin);
          const check = agentText();
          expect(check.message).toContain(
            'but no `astryx` command is on the search path',
          );
          expect(check.fix).toBe(
            `Run \`${step}\`, the step the skill names for when \`astryx\` is not found.`,
          );
        }
        pc.path.shift();
      }
    });

    // Volta's command is a shim of its own, not a link into the package, so
    // the search-path scan cannot trace it; an astryx on the search path that
    // cannot be traced may run the CLI, so doctor never calls it gone.
    it("on a working Volta install, doctor does not report the skill's CLI as gone", () => {
      const pc = computer();
      const g = globalCli('volta', '9.0.0', {root: pc.home});
      fs.rmSync(path.join(g.binDir, 'astryx'));
      fs.writeFileSync(
        path.join(g.binDir, 'astryx'),
        '#!/bin/sh\n# volta-shim\nexit 0\n',
      );
      fs.chmodSync(path.join(g.binDir, 'astryx'), 0o755);
      pc.path.unshift(g.binDir);
      const empty = tempDir('empty');
      expect(run(g.bin, ['init', '--user'], {cwd: empty, pc}).status).toBe(0);
      const check = JSON.parse(
        run(g.bin, ['doctor', '--json'], {cwd: empty, pc}).stdout,
      ).data.checks.find(
        (/** @type {any} */ c) => c.id === 'computer-agent-text',
      );
      expect(check.message).toContain('matches this release');
      expect(check.message).not.toContain('no `astryx` command');
      expect(check.fix).toBeUndefined();
      // Run through a package runner's copy too, its .bin first on the
      // search path, as npx puts it: Volta's shim still counts.
      const runner = placeCli(
        path.join(
          tempDir('npx'),
          '_npx',
          'v1',
          'node_modules',
          '@astryxdesign',
          'cli',
        ),
        '9.0.0',
      );
      const runnerBin = path.join(
        path.dirname(path.dirname(runner.dir)),
        '.bin',
      );
      fs.mkdirSync(runnerBin, {recursive: true});
      fs.symlinkSync(runner.bin, path.join(runnerBin, 'astryx'));
      pc.path.unshift(runnerBin);
      const viaRunner = JSON.parse(
        run(runner.bin, ['doctor', '--json'], {cwd: empty, pc}).stdout,
      ).data.checks.find(
        (/** @type {any} */ c) => c.id === 'computer-agent-text',
      );
      expect(viaRunner.message).not.toContain('no `astryx` command');
      expect(viaRunner.fix).toBeUndefined();
    });

    // Any `astryx` the scan cannot trace, such as an asdf or mise shim, may
    // run the CLI: doctor stays quiet rather than call it gone.
    it("with an untraceable astryx shim on the search path, doctor run through a package runner does not report the skill's CLI as gone", () => {
      const pc = computer();
      const g = globalCli('npm', '9.0.0', {root: pc.home});
      pc.path.unshift(g.binDir);
      const empty = tempDir('empty');
      expect(run(g.bin, ['init', '--user'], {cwd: empty, pc}).status).toBe(0);
      pc.path.splice(pc.path.indexOf(g.binDir), 1);
      const shims = path.join(pc.home, '.asdf', 'shims');
      fs.mkdirSync(shims, {recursive: true});
      fs.writeFileSync(
        path.join(shims, 'astryx'),
        '#!/bin/sh\nexec asdf exec astryx "$@"\n',
      );
      fs.chmodSync(path.join(shims, 'astryx'), 0o755);
      pc.path.unshift(shims);
      const runner = placeCli(
        path.join(
          tempDir('npx'),
          '_npx',
          'a1',
          'node_modules',
          '@astryxdesign',
          'cli',
        ),
        '9.0.0',
      );
      const check = JSON.parse(
        run(runner.bin, ['doctor', '--json'], {cwd: empty, pc}).stdout,
      ).data.checks.find(
        (/** @type {any} */ c) => c.id === 'computer-agent-text',
      );
      expect(check.message).not.toContain('no `astryx` command');
      expect(check.fix).toBeUndefined();
    });

    it('with the global copy on the search path, doctor gives no restore report', () => {
      const pc = computer();
      const g = globalCli('npm', '9.0.0', {root: pc.home});
      pc.path.unshift(g.binDir);
      const empty = tempDir('empty');
      expect(run(g.bin, ['init', '--user'], {cwd: empty, pc}).status).toBe(0);
      const check = JSON.parse(
        run(g.bin, ['doctor', '--json'], {cwd: empty, pc}).stdout,
      ).data.checks.find(
        (/** @type {any} */ c) => c.id === 'computer-agent-text',
      );
      expect(check.message).toContain('matches this release');
      expect(check.message).not.toContain('no `astryx` command');
      expect(check.fix).toBeUndefined();
    });

    it('two global installs of one release find the same skill current, and neither rewrites the step the other wrote', () => {
      const pc = computer();
      const npm = globalCli('npm', '9.0.0', {root: pc.home});
      const pnpm = globalCli('pnpm', '9.0.0', {root: pc.home});
      pc.path.unshift(npm.binDir, pnpm.binDir);
      const empty = tempDir('empty');
      const skill = path.join(
        pc.home,
        '.agents',
        'skills',
        'astryx',
        'SKILL.md',
      );
      expect(run(npm.bin, ['init', '--user'], {cwd: empty, pc}).status).toBe(0);
      const written = fs.readFileSync(skill, 'utf8');
      expect(written).toContain(
        'run `npm i -g --prefix ~/.npm-global @astryxdesign/cli` first.',
      );
      const fromPnpm = JSON.parse(
        run(pnpm.bin, ['--json', 'init', '--user'], {cwd: empty, pc}).stdout,
      );
      expect(
        fromPnpm.data.files.find((/** @type {any} */ f) => f.path === skill)
          .action,
      ).toBe('unchanged');
      expect(fs.readFileSync(skill, 'utf8')).toBe(written);
      const doctor = JSON.parse(
        run(pnpm.bin, ['doctor', '--json'], {cwd: empty, pc}).stdout,
      );
      expect(
        doctor.data.checks.find(
          (/** @type {any} */ c) => c.id === 'computer-agent-text',
        ).message,
      ).toContain('matches this release');
    });

    it('G14 a Node version manager: each Node has its own global copy, which answers itself', () => {
      const pc = computer();
      for (const layout of /** @type {const} */ (['nvm', 'fnm', 'volta'])) {
        const copy = globalCli(layout, '9.0.0', {root: pc.home});
        expect(isGlobalCopy(copy.dir, pc.astryxCache)).toBe(true);
        expect(
          run(copy.bin, ['--version'], {cwd: tempDir('empty'), pc}).stdout,
        ).toBe('9.0.0');
      }
    });

    it('G15 a project pinned through a package manager shim: as for that project, and nothing written there', () => {
      const pc = computer();
      const g = globalCli('npm', '9.0.0', {root: pc.home});
      seedPackedRelease(pc.astryxCache, '9.0.1');
      const dir = makeProject({core: '9.0.1', brokenCli: '9.0.1'});
      const pkg = JSON.parse(
        fs.readFileSync(path.join(dir, 'package.json'), 'utf8'),
      );
      writeJson(path.join(dir, 'package.json'), {
        ...pkg,
        packageManager: 'pnpm@10.0.0',
      });
      const before = filesIn(dir);
      expect(run(g.bin, ['--version'], {cwd: dir, pc}).stdout).toBe('9.0.1');
      // A release that must be fetched and cannot be: the starting copy
      // answers, as before global mode, without touching the project.
      const missing = makeProject({core: '9.0.7', brokenCli: '9.0.7'});
      const missingBefore = filesIn(missing);
      const r = run(g.bin, ['--version'], {cwd: missing, pc});
      expect(r.status).toBe(0);
      expect(r.stdout).toBe('9.0.0');
      expect(filesIn(missing)).toEqual(missingBefore);
      expect(filesIn(dir)).toEqual(before);
    });

    it.skipIf(ROOT)(
      'G16 a global copy installed with administrator rights: nothing is written to its install folder',
      () => {
        const pc = computer();
        const g = globalCli('npm', '9.0.0', {root: pc.home});
        const prefix = path.join(pc.home, '.npm-global');
        const before = filesIn(prefix);
        fs.chmodSync(g.dir, 0o555);
        try {
          const r = run(g.bin, ['--version'], {cwd: tempDir('empty'), pc});
          expect(r.status).toBe(0);
          expect(r.stdout).toBe('9.0.0');
        } finally {
          fs.chmodSync(g.dir, 0o755);
        }
        expect(filesIn(prefix)).toEqual(before);
      },
    );

    it.skipIf(ROOT)(
      'G17 the cache cannot be written: the global copy still answers outside and in a Core-only project; when a project whose CLI cannot start needs a release, it answers instead, with a warning and copy fallback',
      () => {
        const pc = computer();
        const g = globalCli('npm', '9.0.0', {root: pc.home});
        fs.mkdirSync(pc.astryxCache, {recursive: true});
        fs.chmodSync(pc.astryxCache, 0o555);
        try {
          const outside = run(g.bin, ['--version'], {
            cwd: tempDir('empty'),
            pc,
          });
          expect(outside.status).toBe(0);
          expect(outside.stdout).toBe('9.0.0');
          const coreOnly = makeProject({core: '9.0.1'});
          expect(run(g.bin, ['--version'], {cwd: coreOnly, pc}).stdout).toBe(
            '9.0.0',
          );
          const dir = makeProject({core: '9.0.1', brokenCli: '9.0.1'});
          const text = run(g.bin, ['--version'], {cwd: dir, pc});
          expect(text.status).toBe(0);
          expect(text.stdout).toBe('9.0.0');
          expect(text.lines).toEqual([
            expect.stringMatching(
              /^astryx: could not get Astryx 9\.0\.1 to match this project's Core \(the release cache .* cannot be written.*\); answering with CLI 9\.0\.0 instead$/u,
            ),
          ]);
          const json = run(g.bin, ['docs', '--json'], {cwd: dir, pc});
          expect(json.status).toBe(0);
          expect(JSON.parse(json.stdout).meta.answeredBy.copy).toBe('fallback');
        } finally {
          fs.chmodSync(pc.astryxCache, 0o755);
        }
      },
    );

    it('G18 cache and configuration folders set by environment: absolute ones are used, relative ones ignored', () => {
      const pc = computer();
      const g = globalCli('npm', '9.0.0', {root: pc.home});
      const dir = makeProject({core: '9.0.0', cli: '9.0.0'});
      const before = filesIn(dir);
      const r = run(g.bin, ['--version'], {
        cwd: dir,
        pc,
        env: {XDG_CACHE_HOME: 'rel-cache', XDG_CONFIG_HOME: 'rel-config'},
      });
      expect(r.status).toBe(0);
      expect(filesIn(dir)).toEqual(before);
      expect(fs.existsSync(path.join(pc.home, '.config', 'astryx'))).toBe(true);
      expect(
        userCacheDir({
          home: pc.home,
          platform: 'linux',
          env: {XDG_CACHE_HOME: '/abs'},
        }),
      ).toBe(path.join('/abs', 'astryx'));
    });

    it('G19 continuous integration (CI set, a fresh home): no check and no notice; the guide is written in the background', async () => {
      const pc = computer();
      const g = globalCli('npm', '9.0.0', {root: pc.home});
      const r = run(g.bin, ['--version'], {
        cwd: tempDir('empty'),
        pc,
        env: {CI: 'true'},
      });
      expect(r.lines).toEqual([outsideLine('9.0.0')]);
      expect(r.notice).toEqual([]);
      expect(readState(pc).checkedAt).toBeUndefined();
      expect(readState(pc).firstRunAt).toBeUndefined();
      const skill = path.join(
        pc.home,
        '.agents',
        'skills',
        'astryx',
        'SKILL.md',
      );
      for (let i = 0; i < 100 && !fs.existsSync(skill); i++) {
        await new Promise(done => setTimeout(done, 100));
      }
      expect(fs.readFileSync(skill, 'utf8')).toContain('name: astryx');
    });

    it.skipIf(ROOT)(
      'G20 a read-only home folder: the run answers, and nothing is written',
      () => {
        const pc = computer();
        const g = globalCli('npm', '9.0.0', {root: pc.home});
        fs.chmodSync(pc.home, 0o555);
        try {
          const r = run(g.bin, ['--version'], {cwd: tempDir('empty'), pc});
          expect(r.status).toBe(0);
          expect(r.stdout).toBe('9.0.0');
          expect(fs.existsSync(path.join(pc.home, '.agents'))).toBe(false);
        } finally {
          fs.chmodSync(pc.home, 0o755);
        }
      },
    );

    it("G21 a shared cache: another computer's lock is taken over once it goes unrenewed", () => {
      const lock = path.join(tempDir('cache'), 'releases', '.lock-9.0.1');
      fs.mkdirSync(lock, {recursive: true});
      writeJson(path.join(lock, 'owner.json'), {
        pid: 7,
        host: 'another-computer',
      });
      const t0 = Date.now();
      expect(tryLock(lock, {now: t0})).toBe(false);
      expect(tryLock(lock, {now: t0 + LEASE_SILENCE_MS - 1})).toBe(false);
      expect(tryLock(lock, {now: t0 + LEASE_SILENCE_MS})).toBe(true);
    });

    it('G22 a project behind the newest release: the notice after the command, once a day, after a real check of the registry', async () => {
      const registry = await startRegistry({
        versions: ['9.0.1', '9.0.5'],
        latest: '9.0.5',
      });
      try {
        const pc = computer();
        const g = globalCli('npm', '9.0.0', {root: pc.home});
        globalState(pc, {firstRunAt: Date.now() - 2 * 24 * 60 * 60_000});
        const env = {npm_config_registry: registry.url};
        run(g.bin, ['--version'], {cwd: tempDir('empty'), pc, env});
        // That run started two background steps: the check and the
        // computer-level agent text. Each takes the state file's lock to
        // record its result, so a later run's notice could find the lock
        // held. Wait for both completion records, not for a time: the
        // check's latest release with its lock released, and the agent
        // text written for this release.
        const stateDir = path.join(pc.home, '.config', 'astryx');
        const settled = () => {
          const state = readState(pc);
          return (
            state.latest === '9.0.5' &&
            state.agentText?.writtenBy === '9.0.0' &&
            !fs.existsSync(path.join(stateDir, '.lock-check')) &&
            !fs.existsSync(path.join(stateDir, '.lock-state'))
          );
        };
        const deadline = Date.now() + 150_000;
        while (!settled() && Date.now() < deadline) {
          await new Promise(done => setTimeout(done, 100));
        }
        expect(readState(pc).latest).toBe('9.0.5');
        expect(readState(pc).agentText?.writtenBy).toBe('9.0.0');
        // The check installed nothing.
        expect(
          fs.existsSync(path.join(pc.astryxCache, 'releases', '9.0.5')),
        ).toBe(false);
        const dir = makeProject({core: '9.0.1', cli: '9.0.1'});
        writeJson(path.join(dir, 'package-lock.json'), {lockfileVersion: 3});
        const json = run(g.bin, ['--version', '--json'], {cwd: dir, pc, env});
        expect(json.notice).toEqual([]);
        const first = run(g.bin, ['--version'], {cwd: dir, pc, env});
        expect(first.lines).toEqual([handedTo('9.0.1')('9.0.0')]);
        expect(first.notice).toEqual([
          available('9.0.1', '9.0.5'),
          'To upgrade, run: npm install @astryxdesign/core@9.0.5 @astryxdesign/cli@9.0.5, then npx astryx upgrade --from 9.0.1 --apply',
        ]);
        // The notice comes after the command's own output.
        expect(first.stderr.trim().split('\n').at(-1)).toBe(first.notice[1]);
        expect(run(g.bin, ['--version'], {cwd: dir, pc, env}).notice).toEqual(
          [],
        );
      } finally {
        await registry.close();
      }
    }, 240_000);

    it("a host's door names the upgrade step of the project update notice, printed as the run ends (b32)", () => {
      const pc = computer();
      const g = globalCli('npm', '9.0.0', {root: pc.home});
      globalState(pc, {
        latest: '9.0.5',
        checkOkAt: Date.now(),
        firstRunAt: Date.now() - 2 * 24 * 60 * 60_000,
      });
      const dir = makeProject({core: '9.0.0'});
      writeJson(path.join(dir, 'package-lock.json'), {lockfileVersion: 3});
      // A host that runs the CLI inside its door, as the programmatic entry does.
      const host = path.join(tempDir('host'), 'host.mjs');
      fs.writeFileSync(
        host,
        [
          "import {pathToFileURL} from 'node:url';",
          `const at = rel => pathToFileURL(${JSON.stringify(g.dir)} + '/' + rel).href;`,
          "const {runWithCliDoor} = await import(at('foundation/env/cli-command.mjs'));",
          "const {startRun} = await import(at('foundation/release/handoff.mjs'));",
          `await runWithCliDoor('host astryx', () => startRun({cliRoot: ${JSON.stringify(g.dir)}, argv: ['--version']}));`,
          '',
        ].join('\n'),
      );
      const r = run(host, [], {cwd: dir, pc});
      expect(r.status).toBe(0);
      expect(r.notice).toEqual([
        available('9.0.0', '9.0.5'),
        'To upgrade, run: npm install @astryxdesign/core@9.0.5 @astryxdesign/cli@9.0.5, then host astryx upgrade --from 9.0.0 --apply',
      ]);
    });

    it('G23 the newest release needs a newer Node: the global copy answers, and the notice and doctor name the Node first', () => {
      const pc = computer();
      const g = globalCli('npm', '9.0.0', {root: pc.home});
      globalState(pc, {
        latest: '9.0.5',
        latestNode: '>=99',
        checkOkAt: Date.now(),
        checkedAt: Date.now(),
        firstRunAt: Date.now(),
      });
      const empty = tempDir('empty');
      const r = run(g.bin, ['--version'], {cwd: empty, pc});
      expect(r.stdout).toBe('9.0.0');
      expect(r.notice).toEqual([
        available('9.0.0', '9.0.5'),
        `To upgrade, install Node >=99 (this computer runs Node ${process.versions.node}), then run: npm i -g --prefix ~/.npm-global @astryxdesign/cli@latest`,
      ]);
      const doctor = JSON.parse(
        run(g.bin, ['doctor', '--json'], {cwd: empty, pc}).stdout,
      );
      expect(
        doctor.data.checks.find(
          (/** @type {any} */ c) => c.id === 'newest-release',
        ),
      ).toMatchObject({
        status: 'info',
        fix: `To upgrade, install Node >=99 (this computer runs Node ${process.versions.node}), then run: npm i -g --prefix ~/.npm-global @astryxdesign/cli@latest.`,
      });
    });

    it('G24 a link to a project folder answers as the folder does', () => {
      const pc = computer();
      const g = globalCli('npm', '9.0.5', {root: pc.home});
      const dir = makeProject({core: '9.0.0', cli: '9.0.0'});
      const link = path.join(tempDir('links'), 'app');
      fs.symlinkSync(dir, link, 'dir');
      const r = run(g.bin, ['--version'], {cwd: link, pc});
      expect(r.stdout).toBe('9.0.0');
      expect(r.lines).toEqual([handedTo('9.0.0')('9.0.5')]);
    });

    it('G25 a file system that ignores letter case: paths compare without case there (path rules)', () => {
      for (const platform of /** @type {const} */ (['darwin', 'win32'])) {
        expect(samePath('/Users/Ada/App', '/users/ada/app', platform)).toBe(
          true,
        );
      }
      expect(samePath('/home/ada/App', '/home/ada/app', 'linux')).toBe(false);
      expect(
        relativeWithin(
          '/Users/Ada/Proj',
          '/users/ada/proj/node_modules',
          'darwin',
        ),
      ).toBe('node_modules');
      expect(
        relativeWithin(
          'C:\\Users\\Ada\\Proj',
          'c:\\users\\ada\\PROJ\\sub',
          'win32',
        ),
      ).toBe('sub');
    });

    it('G26 Windows paths and installs follow the same rules (path rules)', () => {
      expect(
        installPlaceOf(
          'C:\\Users\\ada\\AppData\\Roaming\\npm\\node_modules\\@astryxdesign\\cli',
        ),
      ).toEqual({
        runner: false,
        owner: 'C:\\Users\\ada\\AppData\\Roaming\\npm',
        knownGlobal: false,
      });
      expect(
        installPlaceOf(
          'C:\\Users\\ada\\AppData\\Local\\Yarn\\Data\\global\\node_modules\\@astryxdesign\\cli',
        ).knownGlobal,
      ).toBe(true);
      expect(
        installPlaceOf(
          'C:\\Users\\ada\\AppData\\Local\\npm-cache\\_npx\\1a2b\\node_modules\\@astryxdesign\\cli',
        ).runner,
      ).toBe(true);
      expect(
        userCacheDir({
          home: 'C:\\Users\\ada',
          platform: 'win32',
          env: {LOCALAPPDATA: 'C:\\Users\\ada\\AppData\\Local'},
        }),
      ).toBe('C:\\Users\\ada\\AppData\\Local\\astryx\\Cache');
      // npm's Windows shim names the package beside it.
      const bin = tempDir('winbin');
      const pkg = path.join(bin, 'node_modules', '@astryxdesign', 'cli');
      writeJson(path.join(pkg, 'package.json'), {
        name: '@astryxdesign/cli',
        version: '9.0.0',
      });
      fs.writeFileSync(
        path.join(bin, 'astryx.cmd'),
        '@ECHO off\r\n"%~dp0\\node_modules\\@astryxdesign\\cli\\clients\\cli\\bin\\astryx.mjs" %*\r\n',
      );
      expect(
        astryxCommandsOnSearchPath({searchPath: bin, platform: 'win32'}),
      ).toEqual([
        {
          file: path.join(bin, 'astryx.cmd'),
          astryx: true,
          cliRoot: pkg,
          version: '9.0.0',
          handsOff: false,
        },
      ]);
    });

    it('G27 a package script puts the project CLI first: it answers, whatever its version', () => {
      const pc = computer();
      seedPackedRelease(pc.astryxCache, '9.0.1');
      const dir = makeProject({core: '9.0.1', cli: '9.0.0'});
      const binDir = path.join(dir, 'node_modules', '.bin');
      fs.mkdirSync(binDir, {recursive: true});
      const projectBin = path.join(
        dir,
        'node_modules',
        '@astryxdesign',
        'cli',
        'clients',
        'cli',
        'bin',
        'astryx.mjs',
      );
      fs.symlinkSync(projectBin, path.join(binDir, 'astryx'));
      pc.path.unshift(binDir);
      const result = spawnSync('astryx', ['--version'], {
        cwd: dir,
        encoding: 'utf8',
        env: {
          ...Object.fromEntries(
            Object.entries(process.env).filter(
              ([key]) => !/^(?:npm_|XDG_|CI$|NO_UPDATE_NOTIFIER$)/iu.test(key),
            ),
          ),
          HOME: pc.home,
          XDG_CACHE_HOME: pc.cache,
          XDG_CONFIG_HOME: path.join(pc.home, '.config'),
          PATH: pc.path.join(path.delimiter),
          npm_config_registry: OFFLINE,
        },
      });
      expect(result.stdout.trim()).toBe('9.0.0');
    });

    it("G28 a Yarn Plug'n'Play project, whose own CLI Astryx cannot see, is answered by the copy that started the run", () => {
      const pc = computer();
      const g = globalCli('npm', '9.0.0', {root: pc.home});
      const dir = makeProject({declare: {'@astryxdesign/core': '^9.0.0'}});
      fs.writeFileSync(path.join(dir, '.pnp.cjs'), '');
      fs.writeFileSync(
        path.join(dir, 'yarn.lock'),
        '__metadata:\n  version: 8\n\n"@astryxdesign/core@npm:^9.0.0":\n  version: 9.0.1\n',
      );
      const r = run(g.bin, ['--version'], {cwd: dir, pc});
      expect(r.stdout).toBe('9.0.0');
      expect(r.lines).toEqual([
        expect.stringMatching(
          /^astryx: this project has no Astryx CLI installed; answered by CLI 9\.0\.0 while its Core is 9\.0\.1\. To match, run: yarn add @astryxdesign\/cli@9\.0\.1$/u,
        ),
      ]);
    });

    it('G29 a package runner that reuses the global install answers as the global copy', () => {
      const pc = computer();
      const g = globalCli('npm', '9.0.0', {root: pc.home});
      const r = run(g.bin, ['--version'], {
        cwd: tempDir('empty'),
        pc,
        env: {npm_command: 'exec', npm_lifecycle_event: 'npx'},
      });
      expect(r.stdout).toBe('9.0.0');
      expect(r.lines).toEqual([outsideLine('9.0.0')]);
    });

    it('G30 init --user inside a project answers for the computer and writes nothing in the project', () => {
      const pc = computer();
      const g = globalCli('npm', '9.0.5', {root: pc.home});
      const dir = makeProject({core: '9.0.0', cli: '9.0.0'});
      const before = filesIn(dir);
      const r = run(g.bin, ['init', '--user'], {cwd: dir, pc});
      expect(r.status).toBe(0);
      expect(r.lines).toEqual([
        'astryx: answered by CLI 9.0.5 with Core 9.0.5, for this computer',
      ]);
      expect(
        fs.existsSync(
          path.join(pc.home, '.claude', 'skills', 'astryx', 'SKILL.md'),
        ),
      ).toBe(true);
      expect(filesIn(dir)).toEqual(before);
    });

    it('G31 a damaged cached release is not used: the run installs it again, or, when it cannot, the starting copy answers instead', () => {
      const pc = computer();
      const g = globalCli('npm', '9.0.0', {root: pc.home});
      const cached = seedPackedRelease(pc.astryxCache, '9.0.2');
      const dir = makeProject({core: '9.0.2', brokenCli: '9.0.2'});
      expect(run(g.bin, ['--version'], {cwd: dir, pc}).stdout).toBe('9.0.2');
      fs.rmSync(
        path.join(
          cached.dir,
          'node_modules',
          '@astryxdesign',
          'core',
          'package.json',
        ),
      );
      const r = run(g.bin, ['--version'], {cwd: dir, pc});
      expect(r.status).toBe(0);
      expect(r.stdout).toBe('9.0.0');
      expect(r.lines.filter(l => l.includes('could not get'))).toEqual([
        expect.stringMatching(/^astryx: could not get Astryx 9\.0\.2 /u),
      ]);
    });

    it('G32 a workspace whose own CLI sits beside its own Core answers with that CLI', () => {
      const pc = computer();
      const g = globalCli('npm', '9.0.0', {root: pc.home});
      const root = tempDir('repo');
      writeJson(path.join(root, 'package.json'), {name: 'repo', private: true});
      writeJson(path.join(root, 'packages', 'core', 'package.json'), {
        name: '@astryxdesign/core',
        version: '9.0.4',
      });
      placeCli(path.join(root, 'packages', 'cli'), '9.0.4');
      // The repository root and another member; `packages/cli` itself reads its
      // own node_modules, which these copies share with this checkout.
      const member = path.join(root, 'apps', 'site');
      fs.mkdirSync(member, {recursive: true});
      for (const cwd of [root, member]) {
        const r = run(g.bin, ['--version'], {cwd, pc});
        expect(r.stdout).toBe('9.0.4');
        expect(r.lines).toEqual([handedTo('9.0.4')('9.0.0')]);
      }
      // Inside the CLI's own package, whose node_modules links this
      // checkout's Core: label the workspace with that Core's version.
      const repo = tempDir('repo');
      writeJson(path.join(repo, 'package.json'), {name: 'repo', private: true});
      writeJson(path.join(repo, 'packages', 'core', 'package.json'), {
        name: '@astryxdesign/core',
        version: CLI_VERSION,
      });
      const own = placeCli(path.join(repo, 'packages', 'cli'), CLI_VERSION);
      for (const cwd of [own.dir, path.join(own.dir, 'foundation')]) {
        const r = run(g.bin, ['--version'], {cwd, pc});
        expect(r.stdout).toBe(CLI_VERSION);
        expect(r.lines).toEqual([handedTo(CLI_VERSION)('9.0.0')]);
      }
    });

    it('G33 the global copy behind the newest release: the notice after the command names the package manager that installed it', () => {
      for (const [layout, command] of /** @type {const} */ ([
        // The npm layout is a prefix in the home folder (`~/.npm-global`),
        // so the upgrade names it.
        ['npm', 'npm i -g --prefix ~/.npm-global @astryxdesign/cli@latest'],
        ['pnpm', 'pnpm add -g @astryxdesign/cli@latest'],
        ['volta', 'volta install @astryxdesign/cli@latest'],
      ])) {
        const pc = computer();
        const g = globalCli(layout, '9.0.0', {root: pc.home});
        globalState(pc, {
          latest: '9.0.5',
          checkOkAt: Date.now(),
          firstRunAt: Date.now(),
        });
        const empty = tempDir('empty');
        const r = run(g.bin, ['--version'], {cwd: empty, pc});
        expect(r.status).toBe(0);
        expect(r.notice).toEqual([
          available('9.0.0', '9.0.5'),
          `To upgrade, run: ${command}`,
        ]);
        expect(run(g.bin, ['--version'], {cwd: empty, pc}).notice).toEqual([]);
      }
      // A failed command prints no notice.
      const pc = computer();
      const g = globalCli('npm', '9.0.0', {root: pc.home});
      globalState(pc, {latest: '9.0.5', checkOkAt: Date.now(), firstRunAt: 0});
      const failed = run(g.bin, ['no-such-command'], {
        cwd: tempDir('empty'),
        pc,
      });
      expect(failed.status).not.toBe(0);
      expect(failed.notice).toEqual([]);
    });

    it('G34 NO_UPDATE_NOTIFIER or CI set: no check and no notice, whatever is due', () => {
      for (const env of [{NO_UPDATE_NOTIFIER: '1'}, {CI: '1'}]) {
        const pc = computer();
        const g = globalCli('npm', '9.0.0', {root: pc.home});
        globalState(pc, {
          latest: '9.0.5',
          checkOkAt: 1,
          checkedAt: 1,
          firstRunAt: 1,
        });
        const r = run(g.bin, ['--version'], {cwd: tempDir('empty'), pc, env});
        expect(r.notice).toEqual([]);
        expect(readState(pc).checkedAt).toBe(1);
        expect(readState(pc).notifiedAt).toBeUndefined();
      }
    });

    it('G35 outside a project: an integration installed beside the global copy contributes its docs, components, and discover entry', () => {
      const pc = computer();
      const g = globalCli('npm', '9.0.0', {root: pc.home});
      acmeWidgets(path.resolve(g.dir, '..', '..', '..'), {
        topic: 'acme-deploying',
      });
      const empty = tempDir('empty');
      const docs = JSON.parse(
        run(g.bin, ['docs', '--json'], {cwd: empty, pc}).stdout,
      );
      expect(
        docs.data.find((/** @type {any} */ t) => t.topic === 'acme-deploying'),
      ).toMatchObject({package: '@acme/widgets'});
      const discover = JSON.parse(
        run(g.bin, ['discover', '--json'], {cwd: empty, pc}).stdout,
      );
      expect(discover.data.map((/** @type {any} */ p) => p.name)).toContain(
        '@acme/widgets',
      );
      const doctor = JSON.parse(
        run(g.bin, ['doctor', '--json'], {cwd: empty, pc}).stdout,
      );
      expect(
        doctor.data.checks.find(
          (/** @type {any} */ c) => c.id === 'computer-integrations',
        ),
      ).toMatchObject({
        status: 'pass',
        message: 'Used outside a project: @acme/widgets@1.0.0.',
      });
    });

    it("G36 inside a project: an integration installed for the computer adds nothing, and discover and doctor list it as available with the project's install command", () => {
      const pc = computer();
      const g = globalCli('npm', '9.0.0', {root: pc.home});
      acmeWidgets(path.resolve(g.dir, '..', '..', '..'), {
        topic: 'acme-deploying',
      });
      // The global copy is on the search path, as it is once installed.
      pc.path.unshift(g.binDir);
      const dir = makeProject({core: '9.0.0', cli: '9.0.0'});
      writeJson(path.join(dir, 'package-lock.json'), {lockfileVersion: 3});
      const docs = JSON.parse(
        run(g.bin, ['docs', '--json'], {cwd: dir, pc}).stdout,
      );
      expect(
        docs.data.some((/** @type {any} */ t) => t.topic === 'acme-deploying'),
      ).toBe(false);
      const discover = JSON.parse(
        run(g.bin, ['discover', '--json'], {cwd: dir, pc}).stdout,
      );
      expect(discover.data).toEqual([]);
      expect(notOfficial(discover)).toEqual([
        {
          name: '@acme/widgets',
          package: '@acme/widgets',
          components: [],
          version: '1.0.0',
          source: 'installed for this computer',
          install: 'npm install @acme/widgets',
        },
      ]);
      const doctor = JSON.parse(
        run(g.bin, ['doctor', '--json'], {cwd: dir, pc}).stdout,
      );
      expect(
        doctor.data.checks.find(
          (/** @type {any} */ c) => c.id === 'computer-integrations',
        ),
      ).toMatchObject({
        status: 'info',
        fix: 'To use one in this project, run `npm install @acme/widgets`.',
      });
    });

    it("from a tool folder inside a project (as G36), discover and doctor point an integration installed for the computer at the project's folder, where its command adds it for good; with no project, discover names no command", () => {
      const pc = computer();
      const g = globalCli('npm', '9.0.0', {root: pc.home});
      acmeWidgets(path.resolve(g.dir, '..', '..', '..'), {
        topic: 'acme-deploying',
      });
      pc.path.unshift(g.binDir);
      const dir = makeProject({core: '9.0.0', cli: '9.0.0'});
      writeJson(path.join(dir, 'package-lock.json'), {lockfileVersion: 3});
      const tool = path.join(dir, 'tools', 'codegen');
      writeJson(path.join(tool, 'package.json'), {name: 'codegen'});
      const discover = JSON.parse(
        run(g.bin, ['discover', '--json'], {cwd: tool, pc}).stdout,
      );
      // A run there loads integrations from the tool's own package.json, so
      // a package added to the project would stay unused there: no command,
      // only the way to the project.
      expect(notOfficial(discover)).toEqual([
        {
          name: '@acme/widgets',
          package: '@acme/widgets',
          components: [],
          version: '1.0.0',
          source: 'installed for this computer',
        },
      ]);
      const integrationsCheck = (/** @type {string} */ cwd) =>
        JSON.parse(
          run(g.bin, ['doctor', '--json'], {cwd, pc}).stdout,
        ).data.checks.find(
          (/** @type {any} */ c) => c.id === 'computer-integrations',
        );
      expect(integrationsCheck(tool).fix).toBe(DOCTOR_RUN_FROM_PROJECT);

      // Followed: from the project's folder, the command adds it there, and
      // once it is installed nothing is offered any more.
      const fromProject = JSON.parse(
        run(g.bin, ['discover', '--json'], {cwd: dir, pc}).stdout,
      );
      expect(notOfficial(fromProject)[0].install).toBe(
        'npm install @acme/widgets',
      );
      expect(integrationsCheck(dir).fix).toBe(
        'To use one in this project, run `npm install @acme/widgets`.',
      );
      const pkg = JSON.parse(
        fs.readFileSync(path.join(dir, 'package.json'), 'utf8'),
      );
      writeJson(path.join(dir, 'package.json'), {
        ...pkg,
        dependencies: {...pkg.dependencies, '@acme/widgets': '1.0.0'},
      });
      acmeWidgets(dir, {topic: 'acme-project'});
      const after = JSON.parse(
        run(g.bin, ['discover', '--json'], {cwd: dir, pc}).stdout,
      );
      expect(notOfficial(after)).toEqual([]);
      expect(integrationsCheck(dir)).not.toHaveProperty('fix');

      // A folder that installs Core but belongs to no project.
      const alone = tempDir('alone');
      writeJson(path.join(alone, 'package.json'), {name: 'alone'});
      installCore(alone, '9.0.0');
      const lone = JSON.parse(
        run(g.bin, ['discover', '--json'], {cwd: alone, pc}).stdout,
      );
      for (const entry of notOfficial(lone)) {
        expect(entry).not.toHaveProperty('install');
      }
    });

    it("G37 a project that installs the same integration uses only its own copy, outside the project's folder rules too", () => {
      const pc = computer();
      const g = globalCli('npm', '9.0.0', {root: pc.home});
      acmeWidgets(path.resolve(g.dir, '..', '..', '..'), {
        topic: 'acme-global',
      });
      // The global copy is on the search path, as it is once installed.
      pc.path.unshift(g.binDir);
      const dir = makeProject({core: '9.0.0', cli: '9.0.0'});
      const pkg = JSON.parse(
        fs.readFileSync(path.join(dir, 'package.json'), 'utf8'),
      );
      writeJson(path.join(dir, 'package.json'), {
        ...pkg,
        dependencies: {...pkg.dependencies, '@acme/widgets': '1.0.0'},
      });
      acmeWidgets(dir, {topic: 'acme-project'});
      const docs = JSON.parse(
        run(g.bin, ['docs', '--json'], {cwd: dir, pc}).stdout,
      );
      const topics = docs.data.map((/** @type {any} */ t) => t.topic);
      expect(topics).toContain('acme-project');
      expect(topics).not.toContain('acme-global');
      const discover = JSON.parse(
        run(g.bin, ['discover', '--json'], {cwd: dir, pc}).stdout,
      );
      expect(notOfficial(discover)).toEqual([]);
    });

    it('G38 an integration whose peer range excludes the answering release is skipped outside a project, and doctor warns', () => {
      const pc = computer();
      const g = globalCli('npm', '9.0.0', {root: pc.home});
      acmeWidgets(path.resolve(g.dir, '..', '..', '..'), {
        topic: 'acme-deploying',
        peers: {'@astryxdesign/core': '>=10.0.0'},
      });
      const empty = tempDir('empty');
      const docs = JSON.parse(
        run(g.bin, ['docs', '--json'], {cwd: empty, pc}).stdout,
      );
      expect(
        docs.data.some((/** @type {any} */ t) => t.topic === 'acme-deploying'),
      ).toBe(false);
      const doctor = JSON.parse(
        run(g.bin, ['doctor', '--json'], {cwd: empty, pc}).stdout,
      );
      expect(
        doctor.data.checks.find(
          (/** @type {any} */ c) => c.id === 'computer-integrations',
        ),
      ).toMatchObject({
        status: 'warn',
        message:
          "Skipped @acme/widgets@1.0.0: it needs @astryxdesign/core >=10.0.0, and this computer's CLI is 9.0.0.",
      });
    });

    it("G39 a door's package set: integrations installed with the CLI in one root count, with no host entry", () => {
      const pc = computer();
      const root = tempDir('runtime');
      writeJson(path.join(root, 'package.json'), {
        name: 'door-runtime',
        private: true,
        dependencies: {
          '@astryxdesign/cli': '9.0.0',
          '@acme/widgets': '1.0.0',
        },
      });
      const cli = placeCli(
        path.join(root, 'node_modules', '@astryxdesign', 'cli'),
        '9.0.0',
      );
      acmeWidgets(root, {topic: 'acme-door'});
      const docs = JSON.parse(
        run(cli.bin, ['docs', '--json'], {cwd: tempDir('empty'), pc}).stdout,
      );
      expect(
        docs.data.find((/** @type {any} */ t) => t.topic === 'acme-door'),
      ).toMatchObject({package: '@acme/widgets'});
    });

    it('G40 pnpm global folders: one shared folder before pnpm 11, a folder per package since, with or without the global virtual store', () => {
      const pc = computer();
      // Before pnpm 11: the CLI's files are in `global/5/.pnpm`, and
      // `global/5/package.json` lists everything installed globally.
      const g5 = path.join(pc.home, '.local', 'share', 'pnpm', 'global', '5');
      const real5 = placeCli(
        path.join(
          g5,
          '.pnpm',
          '@astryxdesign+cli@9.0.0',
          'node_modules',
          '@astryxdesign',
          'cli',
        ),
        '9.0.0',
      );
      writeJson(path.join(g5, 'package.json'), {
        dependencies: {'@astryxdesign/cli': '9.0.0', '@acme/widgets': '1.0.0'},
      });
      fs.mkdirSync(path.join(g5, 'node_modules', '@astryxdesign'), {
        recursive: true,
      });
      fs.symlinkSync(
        real5.dir,
        path.join(g5, 'node_modules', '@astryxdesign', 'cli'),
      );
      acmeWidgets(g5, {topic: 'acme-pnpm10'});
      const empty = tempDir('empty');
      const docs10 = JSON.parse(
        run(real5.bin, ['docs', '--json'], {cwd: empty, pc}).stdout,
      );
      expect(docs10.data.map((/** @type {any} */ t) => t.topic)).toContain(
        'acme-pnpm10',
      );

      // pnpm 11 and later: each global package has a folder of its own under
      // `global/v11`, and the files are in `store/v11/links`.
      const pc2 = computer();
      const home = path.join(pc2.home, '.local', 'share', 'pnpm');
      const store = placeCli(
        path.join(
          home,
          'store',
          'v11',
          'links',
          '@astryxdesign',
          'cli',
          '9.0.0',
          'h1',
          'node_modules',
          '@astryxdesign',
          'cli',
        ),
        '9.0.0',
      );
      const cliFolder = path.join(home, 'global', 'v11', 'a1');
      writeJson(path.join(cliFolder, 'package.json'), {
        dependencies: {'@astryxdesign/cli': '9.0.0'},
      });
      fs.mkdirSync(path.join(cliFolder, 'node_modules', '@astryxdesign'), {
        recursive: true,
      });
      fs.symlinkSync(
        store.dir,
        path.join(cliFolder, 'node_modules', '@astryxdesign', 'cli'),
      );
      const widgetsFolder = path.join(home, 'global', 'v11', 'b2');
      writeJson(path.join(widgetsFolder, 'package.json'), {
        dependencies: {'@acme/widgets': '1.0.0'},
      });
      acmeWidgets(widgetsFolder, {topic: 'acme-pnpm11'});
      const docs11 = JSON.parse(
        run(store.bin, ['docs', '--json'], {cwd: tempDir('empty'), pc: pc2})
          .stdout,
      );
      expect(docs11.data.map((/** @type {any} */ t) => t.topic)).toContain(
        'acme-pnpm11',
      );

      // pnpm 12: no global virtual store, so the CLI's files sit inside its
      // own global folder, under `.pnpm`.
      const pc3 = computer();
      const g12 = path.join(
        pc3.home,
        '.local',
        'share',
        'pnpm',
        'global',
        'v11',
      );
      const own = path.join(g12, 'c3');
      writeJson(path.join(own, 'package.json'), {
        dependencies: {'@astryxdesign/cli': '9.0.0'},
      });
      const inner = placeCli(
        path.join(
          own,
          'node_modules',
          '.pnpm',
          '@astryxdesign+cli@9.0.0',
          'node_modules',
          '@astryxdesign',
          'cli',
        ),
        '9.0.0',
      );
      fs.mkdirSync(path.join(own, 'node_modules', '@astryxdesign'), {
        recursive: true,
      });
      fs.symlinkSync(
        inner.dir,
        path.join(own, 'node_modules', '@astryxdesign', 'cli'),
      );
      const sibling = path.join(g12, 'd4');
      writeJson(path.join(sibling, 'package.json'), {
        dependencies: {'@acme/widgets': '1.0.0'},
      });
      acmeWidgets(sibling, {topic: 'acme-pnpm12'});
      const docs12 = JSON.parse(
        run(inner.bin, ['docs', '--json'], {cwd: tempDir('empty'), pc: pc3})
          .stdout,
      );
      expect(docs12.data.map((/** @type {any} */ t) => t.topic)).toContain(
        'acme-pnpm12',
      );
    });

    it("G41 an integration's own source folder, outside a project: the folder's copy is used, and doctor says so without a warning", () => {
      const pc = computer();
      const g = globalCli('npm', '9.0.0', {root: pc.home});
      acmeWidgets(path.resolve(g.dir, '..', '..', '..'), {
        topic: 'acme-global',
      });
      const source = tempDir('source');
      writeJson(path.join(source, 'package.json'), {
        name: '@acme/widgets',
        version: '2.0.0',
      });
      fs.writeFileSync(
        path.join(source, 'astryx.integration.mjs'),
        'export default {};\n',
      );
      const docs = JSON.parse(
        run(g.bin, ['docs', '--json'], {cwd: source, pc}).stdout,
      );
      expect(docs.data.map((/** @type {any} */ t) => t.topic)).not.toContain(
        'acme-global',
      );
      const doctor = JSON.parse(
        run(g.bin, ['doctor', '--json'], {cwd: source, pc}).stdout,
      );
      expect(
        doctor.data.checks.find(
          (/** @type {any} */ c) => c.id === 'computer-integrations',
        ),
      ).toMatchObject({
        status: 'pass',
        message:
          '@acme/widgets@1.0.0 is not used here: this folder loads its own copy of @acme/widgets.',
      });
    });

    it('G42 inside a project, an integration installed for the computer is offered only when its peer range admits the project release and it loads', () => {
      const pc = computer();
      const g = globalCli('npm', '9.0.0', {root: pc.home});
      const lib = path.resolve(g.dir, '..', '..', '..');
      acmeWidgets(lib, {topic: 'acme-ok'});
      acmeWidgets(lib, {
        topic: 'acme-old',
        name: '@acme/old',
        peers: {'@astryxdesign/core': '>=10.0.0'},
      });
      acmeWidgets(lib, {
        topic: 'acme-broken',
        name: '@acme/broken',
        manifest: "throw new Error('broken');\n",
      });
      pc.path.unshift(g.binDir);
      const dir = makeProject({core: '9.0.0', cli: '9.0.0'});
      writeJson(path.join(dir, 'package-lock.json'), {lockfileVersion: 3});
      const discover = JSON.parse(
        run(g.bin, ['discover', '--json'], {cwd: dir, pc}).stdout,
      );
      expect(
        notOfficial(discover).map((/** @type {any} */ p) => p.name),
      ).toEqual(['@acme/widgets']);
      const doctor = JSON.parse(
        run(g.bin, ['doctor', '--json'], {cwd: dir, pc}).stdout,
      );
      expect(
        doctor.data.checks.find(
          (/** @type {any} */ c) => c.id === 'computer-integrations',
        ).fix,
      ).toBe('To use one in this project, run `npm install @acme/widgets`.');
    });

    it("G43 inside a project a door's package set answers for: its integrations are offered as available", () => {
      const pc = computer();
      const root = tempDir('runtime');
      writeJson(path.join(root, 'package.json'), {
        name: 'door-runtime',
        private: true,
        dependencies: {'@astryxdesign/cli': '9.0.0', '@acme/widgets': '1.0.0'},
      });
      const cli = placeCli(
        path.join(root, 'node_modules', '@astryxdesign', 'cli'),
        '9.0.0',
      );
      acmeWidgets(root, {topic: 'acme-door'});
      // The project installs only Core 9.0.0, so the door's copy, which
      // started the run, answers it.
      const dir = makeProject({core: '9.0.0'});
      writeJson(path.join(dir, 'package-lock.json'), {lockfileVersion: 3});
      const discover = JSON.parse(
        run(cli.bin, ['discover', '--json'], {cwd: dir, pc}).stdout,
      );
      expect(discover.meta.answeredBy.copy).toBe('starting');
      expect(notOfficial(discover)).toEqual([
        {
          name: '@acme/widgets',
          package: '@acme/widgets',
          components: [],
          version: '1.0.0',
          source: 'installed for this computer',
          install: 'npm install @acme/widgets',
        },
      ]);
    });

    it("G44 npm's own prefix (npm i -g --prefix ~/.local): the upgrade names that prefix, integrations installed there apply outside a project, and doctor finds ~/.local/bin/astryx", () => {
      const pc = computer();
      const prefix = path.join(pc.home, '.local');
      const cli = placeCli(
        path.join(prefix, 'lib', 'node_modules', '@astryxdesign', 'cli'),
        '9.0.0',
      );
      fs.mkdirSync(path.join(prefix, 'bin'), {recursive: true});
      fs.symlinkSync(cli.bin, path.join(prefix, 'bin', 'astryx'));
      pc.path.unshift(path.join(prefix, 'bin'));
      acmeWidgets(path.join(prefix, 'lib'), {topic: 'acme-prefix'});
      globalState(pc, {latest: '9.0.5', checkOkAt: Date.now(), firstRunAt: 0});
      const empty = tempDir('empty');
      const docs = run(cli.bin, ['docs', '--json'], {cwd: empty, pc});
      expect(
        JSON.parse(docs.stdout).data.map((/** @type {any} */ t) => t.topic),
      ).toContain('acme-prefix');
      // --json prints no notice; a text run does.
      expect(docs.notice).toEqual([]);
      expect(run(cli.bin, ['--version'], {cwd: empty, pc}).notice).toEqual([
        available('9.0.0', '9.0.5'),
        'To upgrade, run: npm i -g --prefix ~/.local @astryxdesign/cli@latest',
      ]);
      const doctor = JSON.parse(
        run(cli.bin, ['doctor', '--json'], {cwd: empty, pc}).stdout,
      );
      const onPath = doctor.data.checks.find(
        (/** @type {any} */ c) => c.id === 'cli-on-path',
      );
      expect(onPath.status).toBe('pass');
      expect(onPath.message).toContain(path.join(prefix, 'bin', 'astryx'));
    });

    it("G45 the agent guide: the global copy's first run writes one file and links Claude Code's folder to it; a folder Astryx did not create is kept and doctor names it; --remove-agents removes the file and the link", async () => {
      const pc = computer();
      const g = globalCli('npm', '9.0.0', {root: pc.home});
      const file = path.join(
        pc.home,
        '.agents',
        'skills',
        'astryx',
        'SKILL.md',
      );
      const claude = path.join(pc.home, '.claude', 'skills', 'astryx');
      run(g.bin, ['--version'], {cwd: tempDir('empty'), pc});
      for (let i = 0; i < 100 && !fs.existsSync(claude); i++) {
        await new Promise(done => setTimeout(done, 100));
      }
      expect(fs.readFileSync(file, 'utf8')).toContain('name: astryx');
      expect(fs.lstatSync(claude).isSymbolicLink()).toBe(true);
      expect(fs.readFileSync(path.join(claude, 'SKILL.md'), 'utf8')).toBe(
        fs.readFileSync(file, 'utf8'),
      );
      const removed = run(g.bin, ['init', '--user', '--remove-agents'], {
        cwd: tempDir('empty'),
        pc,
      });
      expect(removed.status).toBe(0);
      expect(fs.existsSync(file)).toBe(false);
      expect(fs.existsSync(claude)).toBe(false);

      // A folder someone else put there is never replaced.
      fs.mkdirSync(claude, {recursive: true});
      fs.writeFileSync(path.join(claude, 'SKILL.md'), 'mine\n');
      expect(
        run(g.bin, ['init', '--user'], {cwd: tempDir('empty'), pc}).status,
      ).toBe(0);
      expect(fs.readFileSync(path.join(claude, 'SKILL.md'), 'utf8')).toBe(
        'mine\n',
      );
      const doctor = JSON.parse(
        run(g.bin, ['doctor', '--json'], {cwd: tempDir('empty'), pc}).stdout,
      );
      expect(
        doctor.data.checks.find(
          (/** @type {any} */ c) => c.id === 'computer-agent-text',
        ).message,
      ).toContain(
        `Not linked, because something Astryx did not create is there: ~${path.sep}${path.join('.claude', 'skills', 'astryx')}`,
      );
    });

    it('G46 docs global inside a project whose release predates it: the copy that started the run answers, for this computer, never handed off', () => {
      const pc = computer();
      const g = globalCli('npm', '9.0.5', {root: pc.home});
      const dir = makeProject({core: '9.0.0', cli: '9.0.0'});
      for (const args of [
        ['docs', 'global'],
        ['docs', 'global/problems'],
      ]) {
        const r = run(g.bin, args, {cwd: dir, pc});
        expect(r.status).toBe(0);
        expect(r.lines).toEqual([
          'astryx: answered by CLI 9.0.5 with Core 9.0.5, for this computer',
        ]);
      }
      // Any other docs topic is still the project's.
      expect(run(g.bin, ['docs'], {cwd: dir, pc}).lines).toEqual([
        "astryx: answered by this project's CLI 9.0.0, handed over from CLI 9.0.5",
      ]);
    });

    it('G47 a project whose own CLI is newer than its Core, online or offline: that CLI answers and nothing is fetched', () => {
      const pc = computer();
      const g = globalCli('npm', '9.0.0', {root: pc.home});
      const dir = makeProject({core: '9.0.3', cli: '9.0.4'});
      for (const registry of [undefined, OFFLINE]) {
        const env = registry ? {npm_config_registry: registry} : {};
        const r = run(g.bin, ['--version'], {cwd: dir, pc, env});
        expect(r.status).toBe(0);
        expect(r.stdout).toBe('9.0.4');
        expect(r.lines.some(l => l.includes('could not get Astryx'))).toBe(
          false,
        );
        const json = run(g.bin, ['docs', '--json'], {cwd: dir, pc, env});
        expect(JSON.parse(json.stdout).meta.answeredBy).toMatchObject({
          cli: '9.0.4',
          copy: 'project',
        });
      }
      expect(
        fs.existsSync(path.join(pc.astryxCache, 'releases', '9.0.3')),
      ).toBe(false);
    });

    it('G48 offline, a project whose own CLI cannot start: the starting copy answers, with one warning and copy fallback', () => {
      const pc = computer();
      const g = globalCli('npm', '9.0.0', {root: pc.home});
      const dir = makeProject({core: '9.0.3', brokenCli: '9.0.3'});
      const r = run(g.bin, ['--version'], {cwd: dir, pc});
      expect(r.status).toBe(0);
      expect(r.stdout).toBe('9.0.0');
      // After the line saying it tries to install the release, one warning.
      expect(r.lines.filter(l => !l.includes('installing'))).toEqual([
        expect.stringMatching(
          /^astryx: could not get Astryx 9\.0\.3 to match this project's Core \(.+\); answering with CLI 9\.0\.0 instead$/u,
        ),
      ]);
      const json = run(g.bin, ['docs', '--json'], {cwd: dir, pc});
      expect(JSON.parse(json.stdout).meta.answeredBy).toMatchObject({
        cli: '9.0.0',
        copy: 'fallback',
      });
    });

    // One row of the table, in three cases: each replays only the installs it
    // needs, and a failed install waits out the CLI's own bounded retry.
    describe('G49 offline, a release that failed to install is retried after 2 minutes, then after 10 once it fails again, by any copy sharing the cache; a success forgets it', () => {
      /**
       * G49's world: a global CLI and a project whose own CLI cannot start and
       * whose Core release cannot be installed (the registry is unreachable),
       * with the record of that release's failed installs. Each case below
       * replays only the installs it needs: a failed one waits out the CLI's
       * own bounded retry, a few seconds each.
       */
      const g49 = () => {
        const pc = computer();
        const g = globalCli('npm', '9.0.0', {root: pc.home});
        const dir = makeProject({core: '9.0.3', brokenCli: '9.0.3'});
        const record = path.join(
          pc.astryxCache,
          'releases',
          '.failed-9.0.3.json',
        );
        const read = () => JSON.parse(fs.readFileSync(record, 'utf8'));
        return {
          pc,
          g,
          dir,
          record,
          read,
          /** Runs `astryx --version` with `bin`; the global copy by default. */
          version: (bin = g.bin) => run(bin, ['--version'], {cwd: dir, pc}),
          /** Move the last failure `minutes` into the past. @param {number} minutes */
          age: (/** @type {number} */ minutes) => {
            const old = read();
            fs.writeFileSync(
              record,
              JSON.stringify({...old, at: old.at - minutes * 60_000}),
            );
          },
        };
      };
      const installs = (/** @type {{lines: string[]}} */ r) =>
        r.lines.filter(l => l.includes('installing')).length;

      it('the first failure is recorded, and neither this copy nor another sharing the cache tries again within 2 minutes', () => {
        const {pc, version, read} = g49();
        expect(installs(version())).toBe(1);
        expect(read().failures).toBe(1);
        const other = globalCli('npm', '9.0.1', {
          root: path.join(pc.home, 'other'),
        });
        for (const bin of [undefined, other.bin]) {
          const again = version(bin);
          expect(again.status).toBe(0);
          expect(installs(again)).toBe(0);
          expect(again.lines).toEqual([
            expect.stringMatching(
              /^astryx: could not get Astryx 9\.0\.3 to match this project's Core \(.+; last tried 1 minute ago, tried again after 2 minutes\); answering with CLI 9\.0\.[01] instead$/u,
            ),
          ]);
        }
      });

      it('after 2 minutes it is tried again, and a second failure in a row waits 10', () => {
        const {version, read, age} = g49();
        expect(installs(version())).toBe(1);
        age(3);
        expect(installs(version())).toBe(1);
        expect(read().failures).toBe(2);
        age(3);
        const waiting = version();
        expect(installs(waiting)).toBe(0);
        expect(waiting.lines[0]).toMatch(/tried again after 10 minutes\)/u);
      });

      it('after 10 minutes two failures in a row are tried again, and a success forgets them', () => {
        const {pc, record, version, read, age} = g49();
        expect(installs(version())).toBe(1);
        // A second failure in a row, recorded as the CLI records it.
        fs.writeFileSync(record, JSON.stringify({...read(), failures: 2}));
        // Past 10 minutes it installs again, for real, and fails a third time.
        age(11);
        expect(installs(version())).toBe(1);
        expect(read().failures).toBe(3);
        // A release installed by then answers, and forgets the failures.
        seedPackedRelease(pc.astryxCache, '9.0.3');
        expect(version().stdout).toBe('9.0.3');
        expect(fs.existsSync(record)).toBe(false);
      });
    });

    it('G50 a global copy in a Bun global folder moved with BUN_INSTALL: global only while BUN_INSTALL names it; an app under a folder named install/global is not', () => {
      const pc = computer();
      const bunHome = path.join(pc.home, 'mybun');
      const global = path.join(bunHome, 'install', 'global');
      writeJson(path.join(global, 'package.json'), {
        dependencies: {'@astryxdesign/cli': '9.0.0'},
      });
      fs.writeFileSync(path.join(global, 'bun.lock'), '{}');
      const copy = placeCli(
        path.join(global, 'node_modules', '@astryxdesign', 'cli'),
        '9.0.0',
      );
      const where = {home: pc.home, platform: /** @type {const} */ ('linux')};
      expect(
        isGlobalCopy(copy.dir, pc.astryxCache, {
          ...where,
          env: {BUN_INSTALL: bunHome},
        }),
      ).toBe(true);
      expect(
        globalUpgradeCommand(copy.dir, {...where, env: {BUN_INSTALL: bunHome}}),
      ).toBe('bun add -g @astryxdesign/cli@latest');
      // Nothing names that folder: not global, so no check and no skill.
      expect(isGlobalCopy(copy.dir, pc.astryxCache, {...where, env: {}})).toBe(
        false,
      );
      // An npm app whose folder happens to end in install/global.
      const app = path.join(pc.home, 'work', 'install', 'global');
      writeJson(path.join(app, 'package.json'), {
        name: 'app',
        dependencies: {'@astryxdesign/cli': '9.0.0'},
      });
      const own = placeCli(
        path.join(app, 'node_modules', '@astryxdesign', 'cli'),
        '9.0.0',
      );
      expect(isGlobalCopy(own.dir, pc.astryxCache, {...where, env: {}})).toBe(
        false,
      );
    });

    it("G51 a global copy in a Yarn 1 global folder moved with global-folder: global when Yarn's settings name it; an app made with yarn add alone is not", () => {
      const pc = computer();
      const global = path.join(pc.home, 'myyarn-global');
      const yarnLike = (/** @type {string} */ dir) => {
        writeJson(path.join(dir, 'package.json'), {
          dependencies: {'@astryxdesign/cli': '9.0.0'},
        });
        fs.writeFileSync(path.join(dir, 'yarn.lock'), '');
        return placeCli(
          path.join(dir, 'node_modules', '@astryxdesign', 'cli'),
          '9.0.0',
        );
      };
      const copy = yarnLike(global);
      const where = {
        home: pc.home,
        platform: /** @type {const} */ ('linux'),
        env: {},
      };
      // Not named by Yarn's settings yet: not global.
      expect(isGlobalCopy(copy.dir, pc.astryxCache, where)).toBe(false);
      // `yarn config set global-folder ~/myyarn-global` writes ~/.yarnrc.
      fs.writeFileSync(
        path.join(pc.home, '.yarnrc'),
        'global-folder "~/myyarn-global"\n',
      );
      expect(isGlobalCopy(copy.dir, pc.astryxCache, where)).toBe(true);
      expect(globalUpgradeCommand(copy.dir, where)).toBe(
        'yarn global add @astryxdesign/cli@latest',
      );
      // And through the environment.
      fs.rmSync(path.join(pc.home, '.yarnrc'));
      expect(
        isGlobalCopy(copy.dir, pc.astryxCache, {
          ...where,
          env: {YARN_GLOBAL_FOLDER: global},
        }),
      ).toBe(true);
      // A fresh app made with `yarn add @astryxdesign/core @astryxdesign/cli`
      // holds the same files: never global.
      const app = yarnLike(path.join(pc.home, 'my-app'));
      expect(isGlobalCopy(app.dir, pc.astryxCache, where)).toBe(false);
      // Its own CLI, run in it, starts no update check and writes no skill.
      const r = run(app.bin, ['--version'], {
        cwd: path.join(pc.home, 'my-app'),
        pc,
      });
      expect(r.status).toBe(0);
      expect(
        fs.existsSync(path.join(pc.home, '.agents', 'skills', 'astryx')),
      ).toBe(false);
      expect(
        fs.existsSync(path.join(pc.home, '.config', 'astryx', 'state.json')),
      ).toBe(false);
    });

    it.skipIf(process.platform === 'win32')(
      'G52 the global copy installs its own Core into the cache in the background, never in CI or on Windows and never blocking a command; offline, the failure waits out the backoff',
      async () => {
        const pc = computer();
        const g = globalCli('npm', '9.0.0', {root: pc.home, coreStep: true});
        const empty = tempDir('empty');
        const failed = path.join(
          pc.astryxCache,
          'releases',
          '.failed-9.0.0.json',
        );
        // In CI, no download starts.
        expect(
          run(g.bin, ['--version'], {cwd: empty, pc, env: {CI: 'true'}}).status,
        ).toBe(0);
        await new Promise(resolve => setTimeout(resolve, 2000));
        expect(fs.existsSync(failed)).toBe(false);
        // Otherwise the detached step tries it; the run itself returns at once.
        const started = Date.now();
        const r = run(g.bin, ['--version'], {cwd: empty, pc});
        expect(r.status).toBe(0);
        expect(r.stdout).toBe('9.0.0');
        expect(Date.now() - started).toBeLessThan(15_000);
        // Offline here: the step records the failure for the backoff.
        for (let i = 0; i < 100 && !fs.existsSync(failed); i++) {
          await new Promise(resolve => setTimeout(resolve, 200));
        }
        expect(fs.existsSync(failed)).toBe(true);
        // A cached release means nothing more to do.
        fs.rmSync(failed);
        seedPackedRelease(pc.astryxCache, '9.0.0');
        expect(run(g.bin, ['--version'], {cwd: empty, pc}).status).toBe(0);
        await new Promise(resolve => setTimeout(resolve, 2000));
        expect(fs.existsSync(failed)).toBe(false);
      },
      60_000,
    );

    it("G53 pnpm's global virtual store: a project's own CLI kept in the store's links folder is not global; one a pnpm global folder links to is", () => {
      const pc = computer();
      const home = path.join(pc.home, '.local', 'share', 'pnpm');
      const where = {
        home: pc.home,
        platform: /** @type {const} */ ('linux'),
        env: {},
      };
      /** A CLI in the store's links folder. @param {string} hash */
      const inStore = hash =>
        placeCli(
          path.join(
            home,
            'store',
            'v11',
            'links',
            '@astryxdesign',
            'cli',
            '9.0.0',
            hash,
            'node_modules',
            '@astryxdesign',
            'cli',
          ),
          '9.0.0',
        );
      // A project links its own CLI from the store: not global, so no check
      // and no skill for each project run.
      const projectCli = inStore('p1');
      const app = path.join(pc.home, 'app');
      writeJson(path.join(app, 'package.json'), {
        name: 'app',
        dependencies: {'@astryxdesign/cli': '9.0.0'},
      });
      fs.mkdirSync(path.join(app, 'node_modules', '@astryxdesign'), {
        recursive: true,
      });
      fs.symlinkSync(
        projectCli.dir,
        path.join(app, 'node_modules', '@astryxdesign', 'cli'),
      );
      expect(isGlobalCopy(projectCli.dir, pc.astryxCache, where)).toBe(false);
      // `pnpm add -g` links one from a global folder: global.
      const globalCli11 = inStore('g1');
      const folder = path.join(home, 'global', 'v11', 'a1');
      writeJson(path.join(folder, 'package.json'), {
        dependencies: {'@astryxdesign/cli': '9.0.0'},
      });
      fs.mkdirSync(path.join(folder, 'node_modules', '@astryxdesign'), {
        recursive: true,
      });
      fs.symlinkSync(
        globalCli11.dir,
        path.join(folder, 'node_modules', '@astryxdesign', 'cli'),
      );
      expect(isGlobalCopy(globalCli11.dir, pc.astryxCache, where)).toBe(true);
      expect(isGlobalCopy(projectCli.dir, pc.astryxCache, where)).toBe(false);
      // Run in the project, its own CLI starts no check and writes no skill.
      const r = run(projectCli.bin, ['--version'], {cwd: app, pc});
      expect(r.status).toBe(0);
      expect(
        fs.existsSync(path.join(pc.home, '.agents', 'skills', 'astryx')),
      ).toBe(false);
    });

    it('G54 a folder deeper than the nearby look in a project with its own CLI: that CLI answers, and no false hint', () => {
      const pc = computer();
      const g = globalCli('npm', '9.0.5', {root: pc.home});
      const dir = makeProject({core: '9.0.0', cli: '9.0.0'});
      for (const rel of [
        ['src', 'a', 'b', 'c', 'd', 'e'],
        ['src', 'app', '(shop)', 'orders', '[id]', 'edit', 'deeper'],
      ]) {
        const deep = path.join(dir, ...rel);
        fs.mkdirSync(deep, {recursive: true});
        const r = run(g.bin, ['--version'], {cwd: deep, pc});
        expect(r.stdout).toBe('9.0.0');
        expect(r.lines).toEqual([handedTo('9.0.0')('9.0.5')]);
      }
    });

    it('G55 a --json run in a fresh clone returns before the background Core step ends, with clean JSON', async () => {
      const pc = computer();
      const g = globalCli('npm', '9.0.0', {root: pc.home});
      // A slow stand-in for the step, which marks when it starts and ends.
      const startedMark = path.join(pc.home, 'core-step-started');
      const marker = path.join(pc.home, 'core-step-ended');
      const worker = path.join(
        g.dir,
        'foundation',
        'release',
        'core-worker.mjs',
      );
      fs.rmSync(worker, {force: true});
      fs.writeFileSync(
        worker,
        [
          "import * as fs from 'node:fs';",
          `fs.writeFileSync(${JSON.stringify(startedMark)}, '');`,
          `setTimeout(() => fs.writeFileSync(${JSON.stringify(marker)}, ''), 20000);`,
        ].join('\n'),
      );
      const dir = makeProject({declare: {'@astryxdesign/core': '^9.0.0'}});
      writeJson(path.join(dir, 'package-lock.json'), {
        lockfileVersion: 3,
        packages: {'node_modules/@astryxdesign/core': {version: '9.0.0'}},
      });
      const started = Date.now();
      // spawnSync waits until the run's output pipes close.
      const r = run(g.bin, ['docs', '--json'], {cwd: dir, pc});
      expect(Date.now() - started).toBeLessThan(10_000);
      expect(() => JSON.parse(r.stdout)).not.toThrow();
      expect(r.stderr).toBe('');
      expect(fs.existsSync(marker)).toBe(false);
      // The step did start, after the command; on Windows it never starts.
      for (let i = 0; i < 50 && !fs.existsSync(startedMark); i++) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      expect(fs.existsSync(startedMark)).toBe(process.platform !== 'win32');
    });

    it("G56 an open search outside a project gets the release's Core as component does; when it cannot, it says what it skipped, never silently", () => {
      const pc = computer();
      const g = globalCli('npm', '9.0.0', {root: pc.home});
      const empty = tempDir('empty');
      // Offline, with nothing cached: one install attempt, then the rest of
      // the search, flagged.
      const json = run(g.bin, ['search', 'button', '--json'], {cwd: empty, pc});
      expect(json.status).toBe(0);
      expect(JSON.parse(json.stdout).meta.partial).toMatchObject({
        skipped: ['component', 'hook', 'template'],
        reason: expect.stringContaining('could not be installed'),
      });
      const text = run(g.bin, ['search', 'button'], {cwd: empty, pc});
      expect(text.status).toBe(0);
      expect(
        text.lines.filter(l =>
          l.startsWith(
            'astryx: components, hooks, and templates were not searched: ',
          ),
        ),
      ).toHaveLength(1);
      // With the release cached, the search reads its Core: nothing skipped.
      seedPackedRelease(pc.astryxCache, '9.0.0');
      const cached = run(g.bin, ['search', 'button', '--json'], {
        cwd: empty,
        pc,
      });
      expect(JSON.parse(cached.stdout).meta?.partial).toBeUndefined();
    });

    it("G57 a folder deeper than the nearby look in a project with only Core: that Core is read, never the starting copy's", () => {
      const pc = computer();
      const g = globalCli('npm', '9.0.0', {root: pc.home});
      const dir = makeProject({core: '9.0.1'});
      for (const rel of [
        ['a', 'b', 'c', 'd', 'e'],
        ['src', 'a', 'b', 'c', 'd', 'e'],
        ['src', 'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k'],
        ['src', 'app', '(shop)', 'orders', '[id]', 'edit'],
      ]) {
        const deep = path.join(dir, ...rel);
        fs.mkdirSync(deep, {recursive: true});
        const json = run(g.bin, ['docs', '--json'], {cwd: deep, pc});
        expect(JSON.parse(json.stdout).meta.answeredBy, rel.join('/')).toEqual({
          cli: '9.0.0',
          core: '9.0.1',
          copy: 'starting',
        });
        // The command reads the project's Core (here an empty stand-in with
        // no components), not the one the copy carries, which has Button.
        const component = run(g.bin, ['component', 'Button', '--json'], {
          cwd: deep,
          pc,
        });
        expect(
          component.status,
          `${rel.join('/')}: ${component.stdout}`,
        ).not.toBe(0);
        expect(JSON.parse(component.stdout).code).not.toBe(
          'ERR_VERSIONS_UNAVAILABLE',
        );
      }
    });

    it.skipIf(process.platform === 'win32')(
      "G58 an interrupt reaches the project's CLI exactly once: passed on after 5 seconds when only the starting copy got it, never when the whole group did and the CLI stopped in time",
      async () => {
        const pc = computer();
        const g = globalCli('npm', '9.0.5', {root: pc.home});
        /**
         * A project whose own CLI records each interrupt it gets, then stops
         * as `onInterrupt` says.
         * @param {string} onInterrupt
         */
        const stubProject = onInterrupt => {
          const dir = project(tempDir('project'), {
            '@astryxdesign/cli': '9.0.0',
          });
          const cliDir = path.join(dir, 'node_modules', '@astryxdesign', 'cli');
          writeJson(path.join(cliDir, 'package.json'), {
            name: '@astryxdesign/cli',
            version: '9.0.0',
            type: 'module',
            bin: {astryx: 'clients/cli/bin/astryx.mjs'},
          });
          const bin = path.join(cliDir, 'clients', 'cli', 'bin', 'astryx.mjs');
          fs.mkdirSync(path.dirname(bin), {recursive: true});
          fs.writeFileSync(
            bin,
            [
              "import * as fs from 'node:fs';",
              "const log = process.cwd() + '/interrupts.log';",
              "fs.writeFileSync(log, '');",
              onInterrupt,
              "fs.writeFileSync(process.cwd() + '/child.pid', String(process.pid));",
              'setInterval(() => {}, 1000);',
            ].join('\n'),
          );
          return dir;
        };
        const HANDLES =
          "process.on('SIGINT', () => { fs.appendFileSync(log, 'SIGINT\\n'); setTimeout(() => process.exit(130), 200); });";
        /**
         * Start a run in `dir` and interrupt it: the starting copy alone, as an
         * agent's kill('SIGINT') does, or its whole process group, as a
         * terminal's Ctrl-C does.
         * @param {string} dir
         * @param {'alone' | 'group'} target
         */
        const interrupt = async (dir, target) => {
          const child = spawn(process.execPath, [g.bin, '--version'], {
            cwd: dir,
            env: envOf(pc),
            stdio: 'pipe',
            // A process group of its own, so the group can be signalled.
            detached: true,
          });
          const pidFile = path.join(dir, 'child.pid');
          for (let i = 0; i < 100 && !fs.existsSync(pidFile); i++) {
            await new Promise(resolve => setTimeout(resolve, 100));
          }
          expect(fs.existsSync(pidFile)).toBe(true);
          const childPid = Number(fs.readFileSync(pidFile, 'utf8'));
          const started = Date.now();
          if (target === 'group') {
            process.kill(-(/** @type {number} */ (child.pid)), 'SIGINT');
          } else {
            child.kill('SIGINT');
          }
          /** @type {[number | null, NodeJS.Signals | null] | null} */
          const ended = await new Promise(resolve => {
            const timer = setTimeout(() => resolve(null), 15_000);
            child.on('exit', (c, s) => {
              clearTimeout(timer);
              resolve([c, s]);
            });
          });
          if (!ended) {
            // The run did not stop: end both, then fail below.
            child.kill('SIGKILL');
            try {
              process.kill(childPid, 'SIGKILL');
            } catch {
              // Already gone.
            }
          }
          const [code, signal] = ended ?? [null, null];
          let alive = true;
          try {
            process.kill(childPid, 0);
          } catch {
            alive = false;
          }
          return {
            code,
            signal,
            alive,
            seconds: (Date.now() - started) / 1000,
            interrupts: fs
              .readFileSync(path.join(dir, 'interrupts.log'), 'utf8')
              .split('\n')
              .filter(Boolean).length,
          };
        };
        // The starting copy alone: passed on once, after the grace; the run
        // ends with the CLI's exit status.
        const alone = await interrupt(stubProject(HANDLES), 'alone');
        expect(alone).toMatchObject({
          code: 130,
          signal: null,
          alive: false,
          interrupts: 1,
        });
        expect(alone.seconds).toBeGreaterThanOrEqual(5);
        expect(alone.seconds).toBeLessThan(10);
        // The whole group: the CLI already has it and stops in time, so it is
        // not passed on again.
        const group = await interrupt(stubProject(HANDLES), 'group');
        expect(group).toMatchObject({
          code: 130,
          signal: null,
          alive: false,
          interrupts: 1,
        });
        expect(group.seconds).toBeLessThan(5);
        // A CLI that leaves the interrupt to Node ends by the signal, and so
        // does the run.
        const dies = await interrupt(stubProject(''), 'alone');
        expect(dies).toMatchObject({
          code: null,
          signal: 'SIGINT',
          alive: false,
        });
      },
      60_000,
    );
  },
);

it('names every row of the table exactly once', () => {
  const text = fs.readFileSync(new URL(import.meta.url), 'utf8');
  const rows = [
    ...text.matchAll(
      /^\s+(?:it|describe)(?:\.skipIf\([^)]*\)\()?\(?\s*['"](G\d+) /gmu,
    ),
  ].map(m => m[1]);
  expect(rows).toEqual(Array.from({length: 58}, (_, i) => `G${i + 1}`));
  expect(os.EOL).toBeTypeOf('string');
});

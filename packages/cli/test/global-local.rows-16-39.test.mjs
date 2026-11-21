// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Rows G16 to G39 of AST-081's "Who answers when global and project
 * copies meet" table (spec AST-081 FR11), one test per row. Rows that depend
 * on an operating system's own file system test their path rules here; on
 * macOS and Windows themselves they run only in the cross-platform smoke
 * workflow.
 * @input global-local.shared.mjs
 * @output Vitest tests
 * @position packages/cli/test; one of three files of the table's rows
 */

import {describe, expect, it} from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {spawnSync} from 'node:child_process';
import {
  globalCli,
  placeCli,
  seedPackedRelease,
  startRegistry,
} from '../test-utils/global-local-fixtures.mjs';
import {
  CLI_VERSION,
  installCore,
  tempDir,
  writeJson,
} from '../test-utils/release-fixtures.mjs';
import {installPlaceOf} from '../foundation/release/choose.mjs';
import {COMPONENT_REPLACES_CLI} from '../foundation/integrations/cli-requirement.mjs';
import {relativeWithin, samePath} from '../foundation/fs/path-compare.mjs';
import {userCacheDir} from '../foundation/env/user-dirs.mjs';
import {astryxCommandsOnSearchPath} from '../foundation/env/search-path.mjs';
import {tryLock} from '../foundation/release/cache.mjs';
import {LEASE_SILENCE_MS} from '../foundation/release/lock-lease.mjs';
import {
  DOCTOR_RUN_FROM_PROJECT,
  OFFLINE,
  POSIX,
  ROOT,
  acmeWidgets,
  available,
  computer,
  filesIn,
  globalState,
  handedTo,
  makeProject,
  notOfficial,
  outsideLine,
  readState,
  run,
  useGlobalLocalHooks,
} from './global-local.shared.mjs';

useGlobalLocalHooks();

describe.skipIf(!POSIX)(
  'who answers when global and project copies meet',
  () => {
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
      expect(fs.existsSync(pc.configDir)).toBe(true);
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
        const stateDir = pc.configDir;
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
          'To upgrade, run: npm install -E @astryxdesign/core@9.0.5 @astryxdesign/cli@9.0.5, then npx astryx upgrade --from 9.0.1 --apply',
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
        // Checked just now, so no run starts an update check.
        checkedAt: Date.now(),
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
        'To upgrade, run: npm install -E @astryxdesign/core@9.0.5 @astryxdesign/cli@9.0.5, then host astryx upgrade --from 9.0.0 --apply',
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

    it("G28 a Yarn Plug'n'Play project whose runtime does not start: the run starts again once, and the copy that started it answers with Yarn's command in the hint", () => {
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
      globalState(pc, {
        latest: '9.0.5',
        checkOkAt: Date.now(),
        // Checked just now, so no run starts an update check.
        checkedAt: Date.now(),
        firstRunAt: 0,
      });
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
      // One that validly replaces a Core component: doctor reads no Core
      // outside a project, so it leaves that comparison to the commands that
      // carry one, and reports no issue for it.
      const nav = acmeWidgets(path.resolve(g.dir, '..', '..', '..'), {
        topic: 'nav-guide',
        name: '@acme/nav',
        peers: {'@astryxdesign/cli': `>=${COMPONENT_REPLACES_CLI}`},
        manifest:
          "export default {docs: './docs', components: './components'};\n",
      });
      fs.mkdirSync(path.join(nav, 'components'), {recursive: true});
      fs.writeFileSync(
        path.join(nav, 'components', 'AcmeSideNav.doc.mjs'),
        `export default ${JSON.stringify({
          type: 'component',
          name: 'AcmeSideNav',
          displayName: 'AcmeSideNav',
          import: '@acme/nav/components/AcmeSideNav',
          replaces: 'SideNav',
          keywords: ['acme'],
          usage: {description: 'AcmeSideNav for Acme apps.'},
          props: [],
        })};\n`,
      );
      fs.writeFileSync(
        path.join(nav, 'components', 'AcmeSideNav.tsx'),
        'export function AcmeSideNav() {\n  return null;\n}\n',
      );
      const withNav = JSON.parse(
        run(g.bin, ['doctor', '--json'], {cwd: empty, pc}).stdout,
      ).data.checks.find(
        (/** @type {any} */ c) => c.id === 'computer-integrations',
      );
      expect(withNav.message).toContain('@acme/nav@1.0.0');
      expect(withNav.status).toBe('pass');
      // One whose contributions have an issue: the everyday commands point
      // at doctor for it, and doctor names it.
      const broken = acmeWidgets(path.resolve(g.dir, '..', '..', '..'), {
        topic: 'broken-guide',
        name: '@acme/broken',
        manifest:
          "export default {docs: './docs', components: './components'};\n",
      });
      fs.mkdirSync(path.join(broken, 'components'), {recursive: true});
      fs.writeFileSync(
        path.join(broken, 'components', 'Thing.tsx'),
        'export function Thing() {\n  return null;\n}\n',
      );
      expect(run(g.bin, ['discover'], {cwd: empty, pc}).stderr).toContain(
        'Warning: @acme/broken has 1 integration issue(s). Run: astryx doctor',
      );
      const after = JSON.parse(
        run(g.bin, ['doctor', '--json'], {cwd: empty, pc}).stdout,
      ).data.checks.find(
        (/** @type {any} */ c) => c.id === 'computer-integrations',
      );
      expect(after.status).toBe('warn');
      expect(after.message).toContain(
        '@acme/broken@1.0.0 has 1 integration issue: Component source "Thing.tsx" has no same-stem metadata file Thing.doc.mjs',
      );
      expect(after.message).not.toContain('@acme/nav@1.0.0 has');
      expect(after.fix).toContain(
        'Otherwise, a newer release of @acme/broken needs to fix it.',
      );
      expect(after.fix).toContain('@acme/broken@latest');
      // Outside a project, `doctor integration validate` finds the copy
      // installed for the computer, as doctor's fixes expect.
      const validated = run(
        g.bin,
        ['doctor', 'integration', 'validate', '@acme/broken'],
        {cwd: empty, pc},
      );
      expect(validated.stdout + validated.stderr).not.toContain(
        'Could not find installed integration package',
      );
      expect(validated.stdout + validated.stderr).toContain('Thing.tsx');
      expect(validated.stdout + validated.stderr).toContain(
        'TypeScript is not installed here, so docs were not checked',
      );
      expect(validated.stdout + validated.stderr).not.toContain('npm install');
      // One whose template replaces a template that Core does not have.
      // Core's templates come with the CLI, so doctor names this issue too.
      const tpl = acmeWidgets(path.resolve(g.dir, '..', '..', '..'), {
        topic: 'tpl-guide',
        name: '@acme/tpl',
        manifest:
          "export default {docs: './docs', templates: './templates'};\n",
      });
      fs.mkdirSync(path.join(tpl, 'templates'), {recursive: true});
      fs.writeFileSync(
        path.join(tpl, 'templates', 'acme-shell.doc.mjs'),
        "export default {type: 'page', name: 'Acme shell', description: 'Acme app shell.', replaces: 'no-such-template'};\n",
      );
      fs.writeFileSync(
        path.join(tpl, 'templates', 'acme-shell.tsx'),
        'export default function AcmeShell() {\n  return null;\n}\n',
      );
      const withTpl = JSON.parse(
        run(g.bin, ['doctor', '--json'], {cwd: empty, pc}).stdout,
      ).data.checks.find(
        (/** @type {any} */ c) => c.id === 'computer-integrations',
      );
      expect(withTpl.status).toBe('warn');
      expect(withTpl.message).toContain('@acme/tpl@1.0.0 has');
      expect(withTpl.message).toContain('which is not a Core template id.');
      // One whose CLI peer range excludes this CLI: the other commands skip
      // it, and validate checks it with a note that says so and fails
      // nothing.
      acmeWidgets(path.resolve(g.dir, '..', '..', '..'), {
        topic: 'old-guide',
        name: '@acme/old',
        peers: {'@astryxdesign/cli': '>=10.0.0'},
      });
      const old = run(
        g.bin,
        ['doctor', 'integration', 'validate', '@acme/old'],
        {cwd: empty, pc},
      );
      expect(old.status).toBe(0);
      expect(old.stdout + old.stderr).toContain(
        'Validating integration: @acme/old@1.0.0',
      );
      expect(old.stdout + old.stderr).toContain(
        'Outside a project, the other commands skip @acme/old@1.0.0: it needs @astryxdesign/cli >=10.0.0',
      );
      expect(old.stdout + old.stderr).toContain(
        'Install a release of @acme/old that supports this CLI.',
      );
      expect(old.stdout + old.stderr).not.toContain('upgrade --from');
      // One whose Core peer range alone excludes this CLI's release: skipped
      // the same way, and validate says so under its own note code.
      acmeWidgets(path.resolve(g.dir, '..', '..', '..'), {
        topic: 'old-core-guide',
        name: '@acme/old-core',
        peers: {'@astryxdesign/core': '>=10.0.0'},
      });
      const skippedCopy = JSON.parse(
        run(g.bin, ['doctor', '--json'], {cwd: empty, pc}).stdout,
      ).data.checks.find(
        (/** @type {any} */ c) => c.id === 'computer-integrations',
      );
      expect(skippedCopy.message).toContain('@acme/old-core');
      const oldCore = run(
        g.bin,
        ['doctor', 'integration', 'validate', '@acme/old-core', '--json'],
        {cwd: empty, pc},
      );
      expect(oldCore.status).toBe(0);
      // One both of whose ranges exclude it: the CLI note, naming both.
      acmeWidgets(path.resolve(g.dir, '..', '..', '..'), {
        topic: 'old-both-guide',
        name: '@acme/old-both',
        peers: {
          '@astryxdesign/core': '>=10.0.0',
          '@astryxdesign/cli': '>=10.0.0',
        },
      });
      const oldBoth = run(
        g.bin,
        ['doctor', 'integration', 'validate', '@acme/old-both', '--json'],
        {cwd: empty, pc},
      );
      expect(oldBoth.status).toBe(0);
      expect(JSON.parse(oldBoth.stdout).data.notes).toContainEqual({
        code: 'cli_peer_version',
        message:
          "Outside a project, the other commands skip @acme/old-both@1.0.0: it needs @astryxdesign/core >=10.0.0 and @astryxdesign/cli >=10.0.0, and this computer's CLI is 9.0.0. Install a release of @acme/old-both that supports this CLI.",
      });
      expect(JSON.parse(oldCore.stdout).data.notes).toContainEqual({
        code: 'core_peer_version',
        message:
          "Outside a project, the other commands skip @acme/old-core@1.0.0: it needs @astryxdesign/core >=10.0.0, and this computer's CLI is 9.0.0. Install a release of @acme/old-core that supports this CLI.",
      });
      // One that fails to load: doctor names validate for it, and validate
      // checks that copy and says why.
      acmeWidgets(path.resolve(g.dir, '..', '..', '..'), {
        topic: 'throws-guide',
        name: '@acme/throws',
        manifest: "throw new Error('acme manifest broke');\n",
      });
      const failing = JSON.parse(
        run(g.bin, ['doctor', '--json'], {cwd: empty, pc}).stdout,
      ).data.checks.find(
        (/** @type {any} */ c) => c.id === 'computer-integrations',
      );
      expect(failing.message).toContain(
        '@acme/throws@1.0.0 could not be loaded.',
      );
      expect(failing.fix).toContain('doctor integration validate @acme/throws');
      const throws = run(
        g.bin,
        ['doctor', 'integration', 'validate', '@acme/throws'],
        {cwd: empty, pc},
      );
      expect(throws.stdout + throws.stderr).toContain('acme manifest broke');
      expect(throws.stdout + throws.stderr).not.toContain(
        'Could not find installed integration package',
      );
      // A folder that declares one itself uses its own copy, even one that
      // fails to load: validate checks that copy and prints its error, not
      // the healthy computer copy the folder keeps out.
      const declared = tempDir('declared');
      fs.writeFileSync(
        path.join(declared, 'package.json'),
        JSON.stringify({
          name: 'declared-app',
          dependencies: {'@acme/nav': '1.0.0'},
        }),
      );
      acmeWidgets(declared, {
        topic: 'declared-nav-guide',
        name: '@acme/nav',
        manifest: "throw new Error('declared copy broke');\n",
      });
      const ownBroken = run(
        g.bin,
        ['doctor', 'integration', 'validate', '@acme/nav'],
        {cwd: declared, pc},
      );
      expect(ownBroken.stdout + ownBroken.stderr).toContain(
        'declared copy broke',
      );
      // A copy in a node_modules above the folder that nothing declares is
      // not loaded there, so validate checks the copy the folder uses.
      const stray = path.join(empty, 'node_modules', '@acme', 'broken');
      fs.mkdirSync(stray, {recursive: true});
      writeJson(path.join(stray, 'package.json'), {
        name: '@acme/broken',
        version: '0.0.1',
      });
      fs.writeFileSync(
        path.join(stray, 'astryx.integration.mjs'),
        'export default {};\n',
      );
      const inner = path.join(empty, 'inner');
      fs.mkdirSync(inner, {recursive: true});
      const used = run(
        g.bin,
        ['doctor', 'integration', 'validate', '@acme/broken'],
        {cwd: inner, pc},
      );
      expect(used.stdout + used.stderr).toContain(
        'Validating integration: @acme/broken@1.0.0',
      );
      // A global copy with no Core yet (Core is an optional peer, and this
      // computer cannot fetch it) has nothing to compare a replacement with:
      // a valid one is no issue, printed or counted.
      const bareComputer = computer();
      const bare = globalCli('npm', '9.0.0', {
        root: bareComputer.home,
        withoutCore: true,
      });
      const bareNav = acmeWidgets(path.resolve(bare.dir, '..', '..', '..'), {
        topic: 'bare-nav-guide',
        name: '@acme/bare-nav',
        peers: {'@astryxdesign/cli': `>=${COMPONENT_REPLACES_CLI}`},
        manifest:
          "export default {docs: './docs', components: './components'};\n",
      });
      fs.mkdirSync(path.join(bareNav, 'components'), {recursive: true});
      fs.writeFileSync(
        path.join(bareNav, 'components', 'AcmeSideNav.doc.mjs'),
        `export default ${JSON.stringify({
          type: 'component',
          name: 'AcmeSideNav',
          displayName: 'AcmeSideNav',
          import: '@acme/bare-nav/components/AcmeSideNav',
          replaces: 'SideNav',
          keywords: ['acme'],
          usage: {description: 'AcmeSideNav for Acme apps.'},
          props: [],
        })};\n`,
      );
      fs.writeFileSync(
        path.join(bareNav, 'components', 'AcmeSideNav.tsx'),
        'export function AcmeSideNav() {\n  return null;\n}\n',
      );
      const bareEmpty = tempDir('bare-empty');
      const bareNudge = run(bare.bin, ['discover'], {
        cwd: bareEmpty,
        pc: bareComputer,
      }).stderr;
      expect(bareNudge).not.toContain('which is not a Core component');
      expect(bareNudge).not.toContain('@acme/bare-nav has');
      // It is loaded there: doctor lists it as used.
      expect(
        JSON.parse(
          run(bare.bin, ['doctor', '--json'], {
            cwd: bareEmpty,
            pc: bareComputer,
          }).stdout,
        ).data.checks.find(
          (/** @type {any} */ c) => c.id === 'computer-integrations',
        ).message,
      ).toContain('@acme/bare-nav@1.0.0');
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

    /**
     * The global npm copy on the search path, with `@acme/widgets` installed
     * beside it for the computer.
     */
    function computerWithWidgets() {
      const pc = computer();
      const g = globalCli('npm', '9.0.0', {root: pc.home});
      acmeWidgets(path.resolve(g.dir, '..', '..', '..'), {
        topic: 'acme-deploying',
      });
      pc.path.unshift(g.binDir);
      /** @param {string} cwd */
      const integrationsCheck = cwd =>
        JSON.parse(
          run(g.bin, ['doctor', '--json'], {cwd, pc}).stdout,
        ).data.checks.find(
          (/** @type {any} */ c) => c.id === 'computer-integrations',
        );
      return {pc, g, integrationsCheck};
    }

    /** A project with Core and the CLI, installed with npm. */
    function npmProject() {
      const dir = makeProject({core: '9.0.0', cli: '9.0.0'});
      writeJson(path.join(dir, 'package-lock.json'), {lockfileVersion: 3});
      return dir;
    }

    // As G36, in four cases; each runs the CLI at most twice.
    it("from a tool folder inside a project (as G36), discover and doctor point an integration installed for the computer at the project's folder", () => {
      const {pc, g, integrationsCheck} = computerWithWidgets();
      const dir = npmProject();
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
      expect(integrationsCheck(tool).fix).toBe(DOCTOR_RUN_FROM_PROJECT);
    });

    it("from the project's folder (as G36), discover and doctor give the command that adds an integration installed for the computer", () => {
      const {pc, g, integrationsCheck} = computerWithWidgets();
      const dir = npmProject();
      const fromProject = JSON.parse(
        run(g.bin, ['discover', '--json'], {cwd: dir, pc}).stdout,
      );
      expect(notOfficial(fromProject)[0].install).toBe(
        'npm install @acme/widgets',
      );
      expect(integrationsCheck(dir).fix).toBe(
        'To use one in this project, run `npm install @acme/widgets`.',
      );
    });

    it('once the project installs it (as G36), discover and doctor no longer offer an integration installed for the computer', () => {
      const {pc, g, integrationsCheck} = computerWithWidgets();
      const dir = npmProject();
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
    });

    it('with no project (as G36), discover names no command for an integration installed for the computer', () => {
      const {pc, g} = computerWithWidgets();
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
  },
);

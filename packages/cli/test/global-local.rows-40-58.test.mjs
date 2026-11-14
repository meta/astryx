// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Rows G40 to G58 of AST-081's "Who answers when global and project
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
import * as os from 'node:os';
import * as path from 'node:path';
import {spawn} from 'node:child_process';
import {
  globalCli,
  placeCli,
  seedPackedRelease,
} from '../test-utils/global-local-fixtures.mjs';
import {project, tempDir, writeJson} from '../test-utils/release-fixtures.mjs';
import {isGlobalCopy} from '../foundation/release/choose.mjs';
import {globalUpgradeCommand} from '../foundation/release/notices.mjs';
import {
  OFFLINE,
  POSIX,
  acmeWidgets,
  available,
  computer,
  envOf,
  globalState,
  handedTo,
  makeProject,
  notOfficial,
  run,
  useGlobalLocalHooks,
} from './global-local.shared.mjs';

useGlobalLocalHooks();

describe.skipIf(!POSIX)(
  'who answers when global and project copies meet',
  () => {
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
      globalState(pc, {
        latest: '9.0.5',
        checkOkAt: Date.now(),
        // Checked just now, so no run starts an update check.
        checkedAt: Date.now(),
        firstRunAt: 0,
      });
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
              // Written whole under another name, then renamed into place:
              // a reader never finds the file empty.
              "const pidFile = process.cwd() + '/child.pid';",
              "fs.writeFileSync(pidFile + '.tmp', String(process.pid));",
              "fs.renameSync(pidFile + '.tmp', pidFile);",
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
          // The CLI writes its pid once it handles interrupts. Wait for that,
          // or for the run to end without it, however long a busy machine
          // takes to get there.
          while (
            !fs.existsSync(pidFile) &&
            child.exitCode === null &&
            child.signalCode === null
          ) {
            await new Promise(resolve => setTimeout(resolve, 50));
          }
          expect(fs.existsSync(pidFile)).toBe(true);
          const childPid = Number(fs.readFileSync(pidFile, 'utf8'));
          // A pid of 0 would make the checks below ask about this process's
          // own process group.
          expect(childPid).toBeGreaterThan(0);
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
  // The rows are split over three files; together they name each row once.
  const text = [
    'global-local.test.mjs',
    'global-local.rows-16-39.test.mjs',
    'global-local.rows-40-58.test.mjs',
  ]
    .map(file => fs.readFileSync(new URL(`./${file}`, import.meta.url), 'utf8'))
    .join('\n');
  const rows = [
    ...text.matchAll(
      /^\s+(?:it|describe)(?:\.skipIf\([^)]*\)\()?\(?\s*['"](G\d+) /gmu,
    ),
  ].map(m => m[1]);
  expect(rows).toEqual(Array.from({length: 58}, (_, i) => `G${i + 1}`));
  expect(os.EOL).toBeTypeOf('string');
});

// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Rows G1 to G15 of AST-081's "Who answers when global and project
 * copies meet" table (spec AST-081 FR11), one test per row. Rows that depend
 * on an operating system's own file system test their path rules here; on
 * macOS and Windows themselves they run only in the cross-platform smoke
 * workflow.
 * @input global-local.shared.mjs
 * @output Vitest tests
 * @position packages/cli/test; the first of three files of the table's rows,
 *   with global-local.rows-16-39 and global-local.rows-40-58
 */

import {describe, expect, it} from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  globalCli,
  placeCli,
  seedPackedRelease,
} from '../test-utils/global-local-fixtures.mjs';
import {
  installCore,
  project,
  tempDir,
  writeJson,
} from '../test-utils/release-fixtures.mjs';
import {isGlobalCopy} from '../foundation/release/choose.mjs';
import {
  DOCTOR_RUN_FROM_PROJECT,
  POSIX,
  RUN_FROM_PROJECT,
  computer,
  filesIn,
  globalState,
  handedTo,
  makeProject,
  matchedLine,
  noCliHint,
  outsideLine,
  readState,
  run,
  useGlobalLocalHooks,
} from './global-local.shared.mjs';

useGlobalLocalHooks();

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

    it("outside a project, a render whose page needs Core says the answering release's Core could not be downloaded", () => {
      const pc = computer();
      const g = globalCli('npm', '9.0.0', {root: pc.home});
      const dir = tempDir('page');
      fs.writeFileSync(
        path.join(dir, 'page.jsx'),
        'import {Button} from \'@astryxdesign/core\';\nexport default () => <Button label="Go" />;\n',
      );
      const r = run(g.bin, ['experimental', 'render', 'page.jsx', '--json'], {
        cwd: dir,
        pc,
      });
      const error = JSON.parse(r.stdout);
      expect(error.code).toBe('ERR_VERSIONS_UNAVAILABLE');
      expect(error.error).toMatch(
        /^Core 9\.0\.0 could not be (?:installed|downloaded).*\. Outside a project, commands that read Core use the Core of the release that answers; run again when the package registry can be reached\.$/u,
      );
      expect(fs.existsSync(path.join(dir, 'page.html'))).toBe(false);
    });

    it("in a fresh clone, doctor names the lockfile's Core as the daily hint and notice do", () => {
      const pc = computer();
      const g = globalCli('npm', '9.0.0', {root: pc.home});
      globalState(pc, {
        latest: '9.0.5',
        checkOkAt: Date.now(),
        // Checked just now, so no run starts an update check: one would ask
        // the unreachable test registry, and its failure, recorded whenever
        // npm gives up, would join doctor's newest-release line.
        checkedAt: Date.now(),
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
        // Checked just now, so no run starts an update check.
        checkedAt: Date.now(),
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
        // Checked just now, so no run starts an update check.
        checkedAt: Date.now(),
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
        // Checked just now, so no run starts an update check.
        checkedAt: Date.now(),
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
        // Checked just now, so no run starts an update check.
        checkedAt: Date.now(),
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
        // Checked just now, so no run starts an update check.
        checkedAt: Date.now(),
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

    // One test for each layout: each starts the CLI three times.
    for (const [layout, step] of /** @type {const} */ ([
      // The npm layout is a prefix in the home folder, so the step names it.
      ['npm', 'npm i -g --prefix ~/.npm-global @astryxdesign/cli'],
      ['pnpm', 'pnpm add -g @astryxdesign/cli'],
      ['bun', 'bun add -g @astryxdesign/cli'],
    ])) {
      it(`the skill outlives the CLI installed for the computer (${layout}): it repeats the step that installed it, and doctor names it too`, () => {
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
      });
    }

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
  },
);

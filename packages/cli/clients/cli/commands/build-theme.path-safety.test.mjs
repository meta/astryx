// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Path-safety regression tests for `astryx theme build`.
 *
 * Covers:
 *   - Theme name with `..` segments cannot escape the output directory.
 *   - Theme name with `/` is rejected with a clear error (vs. ENOENT).
 *   - Multi-file write is atomic: if one file fails, none are left behind.
 *   - An `--out` escape, or an output directory that cannot be created, fails
 *     with a registered error code.
 *   - Every output a build writes stays inside the working directory: an
 *     absolute `--out` path or a theme file outside it fails before anything
 *     is written, while absolute paths inside it build, also through a
 *     symlinked spelling. `--check` writes nothing, so it compares those
 *     outside outputs read-only, and a stale report for them ends with a
 *     remedy that works: the directory to build and check from.
 *
 * Runs the CLI in-process (shared runCli harness) against a tiny synthetic theme file.
 */

import {describe, it, expect, beforeAll, beforeEach, afterEach} from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {ensureCoreBuilt} from './ensure-core-built.mjs';
import {runCli} from '../../../test-utils/run-cli.mjs';
import {themeBuild} from '../../../api/theme/build/build.mjs';
import {AstryxError} from '../../../api/error.mjs';
import {ERROR_CODES} from '../../../foundation/response/error-codes.mjs';
import {getCliInvocation} from '../../../foundation/env/package-manager.mjs';

function writeTheme(dir, name) {
  fs.mkdirSync(dir, {recursive: true});
  const file = path.join(dir, 'theme.mjs');
  // Plain object literal so the legacy regex+eval path can parse it
  // without needing jiti / TS, and without depending on @astryxdesign/core being
  // built. The eval path explicitly supports this shape.
  fs.writeFileSync(
    file,
    `export default { name: ${JSON.stringify(name)}, tokens: { '--color-bg': '#fff' } };\n`,
  );
  return file;
}

let tmpDir;
beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-build-theme-paths-'));
});
afterEach(() => {
  fs.rmSync(tmpDir, {recursive: true, force: true});
});

describe('theme build path safety', () => {
  it('rejects a theme name containing ../ traversal and writes no JS outside the input dir', async () => {
    const project = path.join(tmpDir, 'project');
    const themesDir = path.join(project, 'themes');
    const outside = path.join(tmpDir, 'outside');
    fs.mkdirSync(outside, {recursive: true});

    const themeFile = writeTheme(themesDir, '../../escaped');

    const result = await runCli(
      ['theme', 'build', path.relative(project, themeFile)],
      project,
    );

    expect(result.code).not.toBe(0);
    expect(result.stderr + result.stdout).toMatch(
      /path separator|invalid theme name/i,
    );

    // The traversal target must not exist.
    expect(fs.existsSync(path.join(tmpDir, 'escaped.js'))).toBe(false);
    expect(fs.existsSync(path.join(tmpDir, 'escaped.css'))).toBe(false);
    expect(fs.readdirSync(outside)).toEqual([]);
  });

  it('rejects a theme name containing /', async () => {
    const project = path.join(tmpDir, 'project');
    const themesDir = path.join(project, 'themes');

    const themeFile = writeTheme(themesDir, 'bad/name');

    const result = await runCli(
      ['theme', 'build', path.relative(project, themeFile)],
      project,
    );

    expect(result.code).not.toBe(0);
    expect(result.stderr + result.stdout).toMatch(/path separator/i);

    // No partial output — neither bad nor bad/name files should exist.
    expect(fs.existsSync(path.join(themesDir, 'bad.js'))).toBe(false);
    expect(fs.existsSync(path.join(themesDir, 'bad', 'name.js'))).toBe(false);
  });

  it('does not leave partial output (no CSS without JS) on a sanitized rejection', async () => {
    const project = path.join(tmpDir, 'project');
    const themesDir = path.join(project, 'themes');

    const themeFile = writeTheme(themesDir, '../leak');

    await runCli(
      ['theme', 'build', path.relative(project, themeFile)],
      project,
    );

    // Neither the CSS nor any sibling JS should have been written.
    const entries = fs.readdirSync(themesDir).sort();
    expect(entries).toEqual(['theme.mjs']);
  });
});

describe('theme build output-path failures carry registered codes', () => {
  // These reach the output-path step, which runs after CSS generation.
  beforeAll(() => {
    ensureCoreBuilt();
  }, 200_000);

  const registered = new Set(Object.values(ERROR_CODES));

  /** @param {string[]} args @param {string} cwd */
  async function buildJson(args, cwd) {
    const result = await runCli(['--json', 'theme', 'build', ...args], cwd);
    return {result, envelope: JSON.parse(result.stdout)};
  }

  it('reports a relative --out path outside the project as ERR_PATH_TRAVERSAL, with --check too', async () => {
    const project = path.join(tmpDir, 'project');
    const themeFile = writeTheme(path.join(project, 'themes'), 'ocean');

    for (const extra of [[], ['--check']]) {
      const {result, envelope} = await buildJson(
        [
          path.relative(project, themeFile),
          '--out',
          '../escaped.css',
          ...extra,
        ],
        project,
      );

      expect(result.code).toBe(1);
      expect(envelope.code).toBe(ERROR_CODES.ERR_PATH_TRAVERSAL);
      expect(registered.has(envelope.code)).toBe(true);
    }
    expect(fs.existsSync(path.join(tmpDir, 'escaped.css'))).toBe(false);
  });

  it('reports an absolute --out path outside the project as ERR_PATH_TRAVERSAL', async () => {
    const project = path.join(tmpDir, 'project');
    const outside = path.join(tmpDir, 'outside');
    fs.mkdirSync(outside, {recursive: true});
    const themeFile = writeTheme(path.join(project, 'themes'), 'ocean');
    const out = path.join(outside, 'ocean.css');

    const {result, envelope} = await buildJson(
      [path.relative(project, themeFile), '--out', out],
      project,
    );

    expect(result.code).toBe(1);
    expect(envelope.code).toBe(ERROR_CODES.ERR_PATH_TRAVERSAL);
    expect(fs.readdirSync(outside)).toEqual([]);
  });

  it('checks an absolute --out path outside the project read-only', async () => {
    const project = path.join(tmpDir, 'project');
    const outside = path.join(tmpDir, 'outside');
    fs.mkdirSync(outside, {recursive: true});
    const themeFile = path.relative(
      project,
      writeTheme(path.join(project, 'themes'), 'ocean'),
    );
    const out = path.join(outside, 'ocean.css');

    const missing = await buildJson(
      [themeFile, '--out', out, '--check'],
      project,
    );
    expect(missing.result.code).toBe(1);
    expect(missing.envelope.type).toBe('theme.build.check');
    expect(missing.envelope.data.upToDate).toBe(false);
    expect(fs.readdirSync(outside)).toEqual([]);

    // Outputs built inside the project compare equal once copied outside:
    // only the volatile Command line, which --check ignores, names --out.
    const dist = path.join(project, 'dist');
    const built = await buildJson(
      [themeFile, '--out', path.join(dist, 'ocean.css')],
      project,
    );
    expect(built.result.code).toBe(0);
    for (const file of fs.readdirSync(dist)) {
      fs.copyFileSync(path.join(dist, file), path.join(outside, file));
    }
    const copied = fs.readdirSync(outside).sort();

    const current = await buildJson(
      [themeFile, '--out', out, '--check'],
      project,
    );
    expect(current.result.code).toBe(0);
    expect(current.envelope.type).toBe('theme.build.check');
    expect(current.envelope.data.upToDate).toBe(true);
    expect(fs.readdirSync(outside).sort()).toEqual(copied);
  });

  it('reports a theme file outside the project as ERR_PATH_TRAVERSAL, because its outputs go beside it; --check only compares them', async () => {
    const project = path.join(tmpDir, 'project');
    fs.mkdirSync(project, {recursive: true});
    const shared = path.join(tmpDir, 'shared');
    const themeFile = writeTheme(shared, 'ocean');

    for (const file of [themeFile, path.relative(project, themeFile)]) {
      const {result, envelope} = await buildJson([file], project);

      expect(result.code).toBe(1);
      expect(envelope.code).toBe(ERROR_CODES.ERR_PATH_TRAVERSAL);

      const checked = await buildJson([file, '--check'], project);
      expect(checked.result.code).toBe(1);
      expect(checked.envelope.type).toBe('theme.build.check');
      expect(checked.envelope.data.upToDate).toBe(false);
    }
    expect(fs.readdirSync(shared)).toEqual(['theme.mjs']);
  });

  /**
   * Read the remedy that ends a stale report for outputs outside cwd: the
   * directory to run from, then the build and check arguments after `theme
   * build`. Each command starts with the install-aware invocation for it.
   * @param {string} stderr
   */
  function readRemedy(stderr) {
    const lines = stderr.split('\n').map(line => line.trim());
    const cd = lines.find(line => line.startsWith('cd '));
    expect(cd).toBeDefined();
    const dir = /** @type {string} */ (cd).slice('cd '.length);
    const stem = `${getCliInvocation(dir)} theme build `;
    const commands = lines.filter(line => line.startsWith(stem));
    expect(commands).toHaveLength(2);
    const [build, check] = commands.map(line =>
      line.slice(stem.length).split(' '),
    );
    expect(check).toEqual([...build, '--check']);
    return {dir, build, check};
  }

  it('ends a stale report for outputs outside cwd with a remedy that works, and keeps the report for outputs inside it', async () => {
    const project = path.join(tmpDir, 'project');
    const inside = path.relative(
      project,
      writeTheme(path.join(project, 'themes'), 'ocean'),
    );
    const shared = writeTheme(path.join(tmpDir, 'shared'), 'ocean');
    const outside = path.join(tmpDir, 'outside');

    for (const args of [
      [path.relative(project, shared)],
      [inside, '--out', path.join(outside, 'ocean.css')],
    ]) {
      const stale = await runCli(
        ['theme', 'build', ...args, '--check'],
        project,
      );
      expect(stale.code).toBe(1);
      // The old remedy ran the build from cwd, which refuses these outputs.
      expect(stale.stderr).not.toContain('Rebuild with:');
      expect(stale.stderr).not.toContain(`theme build ${args.join(' ')}`);

      // Following the remedy builds, and the check from there passes.
      const remedy = readRemedy(stale.stderr);
      const built = await runCli(
        ['theme', 'build', ...remedy.build],
        remedy.dir,
      );
      expect(built.code).toBe(0);
      const checked = await runCli(
        ['--json', 'theme', 'build', ...remedy.check],
        remedy.dir,
      );
      expect(checked.code).toBe(0);
      expect(JSON.parse(checked.stdout).data.upToDate).toBe(true);
    }

    // Outputs inside cwd keep the plain rebuild line.
    const local = await runCli(['theme', 'build', inside, '--check'], project);
    expect(local.code).toBe(1);
    expect(local.stderr).toContain(
      `Rebuild with: astryx theme build ${inside}`,
    );
    expect(local.stderr).not.toMatch(/^\s*cd /m);
  });

  it('builds absolute paths inside the project, also when they reach it through a symlink', async () => {
    const project = path.join(tmpDir, 'project');
    const themeFile = writeTheme(path.join(project, 'themes'), 'ocean');
    const alias = path.join(tmpDir, 'alias');
    fs.symlinkSync(project, alias, 'dir');

    for (const [args, written] of [
      [
        [themeFile, '--out', path.join(project, 'dist', 'direct.css')],
        path.join(project, 'dist', 'direct.css'),
      ],
      [
        [themeFile, '--out', path.join(alias, 'dist', 'aliased.css')],
        path.join(project, 'dist', 'aliased.css'),
      ],
      [
        [path.join(alias, 'themes', 'theme.mjs')],
        path.join(project, 'themes', 'ocean.css'),
      ],
    ]) {
      const {result, envelope} = await buildJson(args, project);

      expect(result.code).toBe(0);
      expect(envelope.type).toBe('theme.build');
      expect(fs.existsSync(written)).toBe(true);
    }
  });

  it('reports an --out path that escapes through a symlink as ERR_PATH_TRAVERSAL', async () => {
    const project = path.join(tmpDir, 'project');
    const outside = path.join(tmpDir, 'outside');
    fs.mkdirSync(outside, {recursive: true});
    const themeFile = writeTheme(path.join(project, 'themes'), 'ocean');
    fs.symlinkSync(outside, path.join(project, 'link'), 'dir');

    const {result, envelope} = await buildJson(
      [path.relative(project, themeFile), '--out', 'link/escaped.css'],
      project,
    );

    expect(result.code).toBe(1);
    expect(envelope.code).toBe(ERROR_CODES.ERR_PATH_TRAVERSAL);
    expect(fs.readdirSync(outside)).toEqual([]);
  });

  it('reports an output directory that cannot be created as ERR_WRITE_FAILED', async () => {
    const project = path.join(tmpDir, 'project');
    const themeFile = writeTheme(path.join(project, 'themes'), 'ocean');
    // A regular file where the output directory would have to be created.
    fs.writeFileSync(path.join(project, 'blocker'), '');

    const {result, envelope} = await buildJson(
      [path.relative(project, themeFile), '--out', 'blocker/ocean.css'],
      project,
    );

    expect(result.code).toBe(1);
    expect(envelope.code).toBe(ERROR_CODES.ERR_WRITE_FAILED);
    expect(registered.has(envelope.code)).toBe(true);
  });

  it('themeBuild() rejects an escaping out path with an AstryxError', async () => {
    const project = path.join(tmpDir, 'project');
    const themeFile = writeTheme(path.join(project, 'themes'), 'ocean');

    const build = themeBuild(
      path.relative(project, themeFile),
      {out: '../escaped.css'},
      {cwd: project},
    );

    await expect(build).rejects.toBeInstanceOf(AstryxError);
    await expect(build).rejects.toMatchObject({
      code: ERROR_CODES.ERR_PATH_TRAVERSAL,
    });
  });

  it('themeBuild() rejects an output outside cwd, an absolute out path or the default beside a theme file outside cwd, and checks it read-only', async () => {
    const project = path.join(tmpDir, 'project');
    const inside = writeTheme(path.join(project, 'themes'), 'ocean');
    const shared = path.join(tmpDir, 'shared');
    const outsideTheme = writeTheme(shared, 'ocean');
    const outDir = path.join(tmpDir, 'out');

    for (const [file, options] of [
      [path.relative(project, inside), {out: path.join(outDir, 'ocean.css')}],
      [outsideTheme, {}],
    ]) {
      await expect(
        themeBuild(file, options, {cwd: project}),
      ).rejects.toMatchObject({code: ERROR_CODES.ERR_PATH_TRAVERSAL});
      await expect(
        themeBuild(file, {...options, check: true}, {cwd: project}),
      ).resolves.toMatchObject({
        type: 'theme.build.check',
        data: {upToDate: false},
      });
    }
    expect(fs.existsSync(outDir)).toBe(false);
    expect(fs.readdirSync(shared)).toEqual(['theme.mjs']);
  });
});

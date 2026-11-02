// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Colocated tests for the swizzle.copy leaf — path-safety + overwrite +
 * recursive nested-source copy (#3506), which skips test-only directories. The
 * copy leaf writes files, so the output base AND the component name (which
 * becomes a path segment) must both be confined to cwd. Every destination segment, including dangling symlinks
 * and wrong-kind entries (a file where a directory goes, or the reverse), is
 * checked before any output is written.
 */

import {describe, it, expect, afterEach} from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {fileURLToPath} from 'node:url';
import {swizzle} from '../swizzle.mjs';

// api/swizzle/copy/ -> up 5 = repo root.
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../..');
const OUT = 'tmp-swizzle-copy-test';
const SLOW = 30_000;

describe('swizzle.copy — destination symlinks', () => {
  let fixture;
  afterEach(() => {
    if (fixture) fs.rmSync(fixture, {recursive: true, force: true});
  });

  it.each([
    ['out', false],
    ['out/Table', false],
    ['out/Table/plugins', false],
    ['out/Table/plugins/nested.ts', false],
    ['out/Table/plugins/nested.ts', true],
  ])('rejects %s (dangling: %s) before writing, with or without overwrite', async (linkPath, dangling) => {
    fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-swizzle-symlink-'));
    const cwd = path.join(fixture, 'project');
    const source = path.join(cwd, 'node_modules/@astryxdesign/core/src/Table');
    fs.mkdirSync(path.join(source, 'plugins'), {recursive: true});
    fs.writeFileSync(path.join(source, 'Table.tsx'), 'export const Table = 1;');
    fs.writeFileSync(path.join(source, 'plugins/nested.ts'), 'export const nested = 1;');
    fs.writeFileSync(path.join(cwd, 'package.json'), '{"name":"consumer"}');
    const outside = path.join(fixture, 'outside');
    fs.mkdirSync(outside);
    const target = linkPath.endsWith('.ts') ? path.join(outside, 'target.ts') : outside;
    if (target !== outside && !dangling) fs.writeFileSync(target, '// consumer edit');
    const link = path.join(cwd, linkPath);
    fs.mkdirSync(path.dirname(link), {recursive: true});
    fs.symlinkSync(target, link);

    for (const overwrite of [false, true]) {
      await expect(swizzle('Table', {cwd, output: './out', overwrite})).rejects.toMatchObject({
        code: 'ERR_PATH_TRAVERSAL',
      });
      expect(fs.existsSync(path.join(cwd, 'out/Table/Table.tsx'))).toBe(false);
      expect(fs.readdirSync(outside)).toEqual(target !== outside && !dangling ? ['target.ts'] : []);
      if (target !== outside && !dangling) expect(fs.readFileSync(target, 'utf8')).toBe('// consumer edit');
    }
  });

  it('also rejects a destination symlink whose target stays inside the project', async () => {
    fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-swizzle-symlink-'));
    const source = path.join(fixture, 'node_modules/@astryxdesign/core/src/Button');
    fs.mkdirSync(source, {recursive: true});
    fs.writeFileSync(path.join(source, 'Button.tsx'), 'export const Button = 1;');
    fs.mkdirSync(path.join(fixture, 'consumer-files'));
    fs.mkdirSync(path.join(fixture, 'out'));
    fs.symlinkSync(path.join(fixture, 'consumer-files'), path.join(fixture, 'out/Button'));
    await expect(swizzle('Button', {cwd: fixture, output: './out'})).rejects.toMatchObject({
      code: 'ERR_PATH_TRAVERSAL',
    });
    expect(fs.readdirSync(path.join(fixture, 'consumer-files'))).toEqual([]);
  });
});

describe('swizzle.copy — destination shape', () => {
  // Sorted plan: Table.tsx, plugins/nested.ts, types.ts. A blocker late in the
  // plan must be caught before the earlier files are written.
  const PLAN = ['Table.tsx', 'plugins/nested.ts', 'types.ts'];
  let fixture;
  afterEach(() => {
    if (fixture) fs.rmSync(fixture, {recursive: true, force: true});
  });

  /** A fake core Table with nested source, in a fresh consumer project. */
  function buildProject() {
    fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-swizzle-shape-'));
    const source = path.join(fixture, 'node_modules/@astryxdesign/core/src/Table');
    for (const file of PLAN) {
      fs.mkdirSync(path.dirname(path.join(source, file)), {recursive: true});
      fs.writeFileSync(path.join(source, file), 'export const x = 1;');
    }
    fs.writeFileSync(path.join(fixture, 'package.json'), '{"name":"consumer"}');
    return fixture;
  }

  /** Every path under `dir` (outside node_modules) with its file contents. */
  function snapshot(dir, prefix = '') {
    return fs.readdirSync(dir, {withFileTypes: true}).flatMap(entry => {
      const rel = prefix + entry.name;
      if (rel === 'node_modules') return [];
      const abs = path.join(dir, entry.name);
      return entry.isDirectory()
        ? [`${rel}/`, ...snapshot(abs, `${rel}/`)]
        : [`${rel}: ${fs.readFileSync(abs, 'utf8')}`];
    });
  }

  it.each([
    ['out', 'file'],
    ['out/Table', 'file'],
    ['out/Table/plugins', 'file'],
    ['out/Table/plugins/nested.ts', 'directory'],
    ['out/Table/types.ts', 'directory'],
  ])('rejects an existing %s %s before writing, with or without overwrite', async (blocker, kind) => {
    const cwd = buildProject();
    // Consumer edits at every planned destination the blocker leaves room for.
    for (const file of PLAN) {
      const dest = `out/Table/${file}`;
      if (`${dest}/`.startsWith(`${blocker}/`) || `${blocker}/`.startsWith(`${dest}/`)) continue;
      fs.mkdirSync(path.dirname(path.join(cwd, dest)), {recursive: true});
      fs.writeFileSync(path.join(cwd, dest), '// consumer edit');
    }
    fs.mkdirSync(path.dirname(path.join(cwd, blocker)), {recursive: true});
    if (kind === 'file') {
      fs.writeFileSync(path.join(cwd, blocker), '// blocker');
    } else {
      fs.mkdirSync(path.join(cwd, blocker));
      fs.writeFileSync(path.join(cwd, blocker, 'keep.txt'), '// kept');
    }
    const before = snapshot(cwd);

    for (const overwrite of [false, true]) {
      const err = await swizzle('Table', {cwd, output: './out', overwrite}).catch(e => e);
      expect(err).toMatchObject({code: 'ERR_WRITE_FAILED'});
      expect(err.message).toContain(path.normalize(blocker));
      expect(err.message).not.toContain(cwd);
      expect(snapshot(cwd)).toEqual(before);
    }
  });

  it.skipIf(process.platform === 'win32' || process.getuid?.() === 0)(
    'reports an uninspectable destination as ERR_WRITE_FAILED without writing',
    async () => {
      const cwd = buildProject();
      const locked = path.join(cwd, 'out/Table');
      fs.mkdirSync(locked, {recursive: true});
      fs.chmodSync(locked, 0o000);
      let err;
      try {
        err = await swizzle('Table', {cwd, output: './out', overwrite: true}).catch(e => e);
      } finally {
        fs.chmodSync(locked, 0o700);
      }
      expect(err).toMatchObject({code: 'ERR_WRITE_FAILED'});
      expect(err.message).toContain('EACCES');
      expect(err.message).not.toContain(cwd);
      expect(fs.readdirSync(locked)).toEqual([]);
    },
  );

  it.skipIf(process.platform === 'win32' || process.getuid?.() === 0)(
    'a copy that fails part-way also removes the nested directories it created',
    async () => {
      const cwd = buildProject();
      // types.ts sorts last and is read-only, so --overwrite writes Table.tsx
      // and plugins/nested.ts (creating plugins/) before failing on it.
      const last = path.join(cwd, 'out/Table/types.ts');
      fs.mkdirSync(path.dirname(last), {recursive: true});
      fs.writeFileSync(last, '// consumer edit');
      fs.chmodSync(last, 0o444);
      const before = snapshot(cwd);
      let err;
      try {
        err = await swizzle('Table', {cwd, output: './out', overwrite: true}).catch(e => e);
      } finally {
        fs.chmodSync(last, 0o644);
      }
      expect(err).toMatchObject({code: 'ERR_WRITE_FAILED'});
      expect(err.message).toContain('Nothing was written.');
      expect(snapshot(cwd)).toEqual(before);
    },
  );
});

describe('swizzle.copy — path safety', () => {
  afterEach(() => {
    fs.rmSync(path.join(REPO, OUT), {recursive: true, force: true});
    // guard against an escape landing at <repo>/src
    if (fs.existsSync(path.join(REPO, 'src'))) {
      // never auto-delete a real src; the test asserts it wasn't created.
    }
  });

  it('rejects a component name that traverses out of the output base', async () => {
    await expect(
      swizzle('../src', {cwd: REPO, output: './' + OUT}),
    ).rejects.toMatchObject({code: 'ERR_PATH_TRAVERSAL'});
  }, SLOW);

  it('rejects a component name containing a path separator', async () => {
    await expect(
      swizzle('foo/bar', {cwd: REPO, output: './' + OUT}),
    ).rejects.toMatchObject({code: 'ERR_PATH_TRAVERSAL'});
  }, SLOW);

  it('rejects an --output that escapes cwd (relative and absolute)', async () => {
    await expect(swizzle('Button', {cwd: REPO, output: '../evil'})).rejects.toMatchObject({
      code: 'ERR_PATH_TRAVERSAL',
    });
    await expect(swizzle('Button', {cwd: REPO, output: '/tmp/evil'})).rejects.toMatchObject({
      code: 'ERR_PATH_TRAVERSAL',
    });
  }, SLOW);

  it('copies a real component, then refuses to clobber without overwrite', async () => {
    const r = await swizzle('Button', {cwd: REPO, output: './' + OUT});
    expect(r.type).toBe('swizzle.copy');
    expect(r.data.filesCopied).toBeGreaterThan(0);
    await expect(swizzle('Button', {cwd: REPO, output: './' + OUT})).rejects.toMatchObject({
      code: 'ERR_FILE_EXISTS',
    });
    const r2 = await swizzle('Button', {cwd: REPO, output: './' + OUT, overwrite: true});
    expect(r2.data.filesCopied).toBe(r.data.filesCopied);
  }, SLOW);
});

describe('swizzle.copy — nested component source (#3506)', () => {
  afterEach(() => {
    fs.rmSync(path.join(REPO, OUT), {recursive: true, force: true});
  });

  it('copies nested subdirectories recursively and reports them', async () => {
    const r = await swizzle('Table', {cwd: REPO, output: './' + OUT});
    expect(r.type).toBe('swizzle.copy');
    const outDir = path.join(REPO, OUT, 'Table');
    // The entry barrel re-exports from ./plugins/* — those modules must exist
    // in the output (the bug: subdirectories were silently dropped).
    expect(fs.existsSync(path.join(outDir, 'plugins/selection/index.ts'))).toBe(true);
    expect(
      fs.existsSync(path.join(outDir, 'plugins/selection/useTableSelection.tsx')),
    ).toBe(true);
    // The receipt's file set includes the nested paths and matches the count.
    expect(r.data.files).toContain('plugins/selection/index.ts');
    expect(r.data.filesCopied).toBe(r.data.files.length);
    // Test/doc files stay excluded at every depth, not just the top level.
    expect(
      r.data.files.some(f => f.includes('.test.') || f.includes('.doc.')),
    ).toBe(false);
    expect(
      fs.existsSync(path.join(outDir, 'plugins/selection/useTableSelection.test.tsx')),
    ).toBe(false);
  }, SLOW);

  it('keeps intra-component imports relative and rewrites escaping ones by depth', async () => {
    await swizzle('Table', {cwd: REPO, output: './' + OUT});
    const outDir = path.join(REPO, OUT, 'Table');
    // Downward ./ imports in the entry barrel resolve now that the subtree
    // exists — they must stay untouched.
    const index = fs.readFileSync(path.join(outDir, 'index.ts'), 'utf-8');
    expect(index).toContain(`from './plugins/selection'`);
    const nested = fs.readFileSync(
      path.join(outDir, 'plugins/pagination/useTablePagination.tsx'),
      'utf-8',
    );
    // A nested file's ../../ import into the component root stays relative...
    expect(nested).toContain(`from '../../types'`);
    // ...while its ../../../ imports (escaping the component) are rewritten.
    expect(nested).toContain(`from '@astryxdesign/core/Pagination'`);
    expect(nested).toContain(`from '@astryxdesign/core/theme/tokens.stylex'`);
    expect(nested).not.toContain(`'../../../`);
  }, SLOW);

  it('overwrite pre-flight sees nested files', async () => {
    // Pre-create ONLY a nested file — the recursive conflict check must find
    // it before any write happens.
    const nestedDir = path.join(REPO, OUT, 'Table', 'plugins', 'selection');
    fs.mkdirSync(nestedDir, {recursive: true});
    fs.writeFileSync(path.join(nestedDir, 'index.ts'), '// consumer edit\n');
    await expect(swizzle('Table', {cwd: REPO, output: './' + OUT})).rejects.toMatchObject({
      code: 'ERR_FILE_EXISTS',
    });
    const r = await swizzle('Table', {cwd: REPO, output: './' + OUT, overwrite: true});
    expect(r.data.files).toContain('plugins/selection/index.ts');
  }, SLOW);

  it.each([
    // Button's a11y harnesses (*.a11y.harnesses.tsx, *.spec.ts, ...) do not
    // match `.test.` and import the unpublished @astryxdesign/a11y-spec.
    ['Button', '__tests__'],
    ['Table', '__tests__'],
    ['FormLayout', '__snapshots__'],
  ])('copies and reports nothing under %s/%s/', async (component, testDir) => {
    const sourceDir = path.join(REPO, 'packages/core/src', component, testDir);
    expect(fs.readdirSync(sourceDir).length).toBeGreaterThan(0);
    const r = await swizzle(component, {cwd: REPO, output: './' + OUT});
    const outDir = path.join(REPO, OUT, component);
    expect(fs.existsSync(outDir)).toBe(true);
    for (const dir of ['__tests__', '__snapshots__']) {
      expect(r.data.files.filter(f => f.split('/').includes(dir))).toEqual([]);
      expect(fs.existsSync(path.join(outDir, dir))).toBe(false);
    }
  }, SLOW);
});

describe('swizzle.copy — test-only directories', () => {
  let fixture;
  afterEach(() => {
    if (fixture) fs.rmSync(fixture, {recursive: true, force: true});
  });

  it('skips __tests__/ and __snapshots__/ at any depth, keeping other nested source', async () => {
    fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-swizzle-testdirs-'));
    const source = path.join(fixture, 'node_modules/@astryxdesign/core/src/Table');
    for (const file of [
      'Table.tsx',
      '__tests__/Table.a11y.harnesses.tsx',
      '__snapshots__/Table.snap',
      'plugins/nested.ts',
      'plugins/__tests__/nested.a11y.spec.ts',
      'plugins/__snapshots__/nested.snap',
    ]) {
      fs.mkdirSync(path.dirname(path.join(source, file)), {recursive: true});
      fs.writeFileSync(path.join(source, file), 'export const x = 1;');
    }
    fs.writeFileSync(path.join(fixture, 'package.json'), '{"name":"consumer"}');

    const r = await swizzle('Table', {cwd: fixture, output: './out'});
    expect(r.data.files).toEqual(['Table.tsx', 'plugins/nested.ts']);
    expect(r.data.filesCopied).toBe(2);
    const outDir = path.join(fixture, 'out/Table');
    expect(fs.readdirSync(outDir).sort()).toEqual(['Table.tsx', 'plugins']);
    expect(fs.readdirSync(path.join(outDir, 'plugins'))).toEqual(['nested.ts']);
  });
});

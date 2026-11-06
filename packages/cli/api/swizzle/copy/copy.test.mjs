// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Colocated tests for the swizzle.copy leaf — path-safety + overwrite.
 * The copy leaf writes files, so the output base AND the component name (which
 * becomes a path segment) must both be confined to cwd.
 */

import {describe, it, expect, afterEach, vi} from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {fileURLToPath} from 'node:url';
import {swizzle} from '../swizzle.mjs';

/** Set by a test to make the gh lookup throw an error it does not expect. */
let ghLookupFails = false;
vi.mock('../_adapter.mjs', async importOriginal => {
  const actual = await importOriginal();
  return {
    ...actual,
    checkGhCli: (...args) => {
      if (ghLookupFails) {
        throw new TypeError('the gh lookup failed');
      }
      return actual.checkGhCli(...args);
    },
  };
});

// api/swizzle/copy/ -> up 5 = repo root.
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../..');
const OUT = 'tmp-swizzle-copy-test';
const SLOW = 30_000;

describe('swizzle.copy — destination symlinks (spec:AST-017 FR1, FR5)', () => {
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
  ])('refuses %s (dangling: %s) linked outside the project before writing, with or without overwrite', async (linkPath, dangling) => {
    fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-swizzle-symlink-'));
    const cwd = path.join(fixture, 'project');
    const source = path.join(cwd, 'node_modules/@astryxdesign/core/src/Table');
    fs.mkdirSync(path.join(source, 'plugins'), {recursive: true});
    fs.writeFileSync(path.join(source, 'Table.tsx'), 'export const Table = 1;');
    fs.writeFileSync(path.join(source, 'plugins/nested.ts'), 'export const nested = 1;');
    fs.writeFileSync(path.join(cwd, 'package.json'), '{"name":"consumer"}');
    fs.writeFileSync(
      path.join(cwd, 'node_modules/@astryxdesign/core/package.json'),
      '{"name":"@astryxdesign/core","version":"0.0.0"}',
    );
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

  it('writes through a folder linked elsewhere inside the project, nested folders included', async () => {
    fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-swizzle-symlink-'));
    const source = path.join(fixture, 'node_modules/@astryxdesign/core/src/Table');
    fs.mkdirSync(path.join(source, 'plugins'), {recursive: true});
    fs.writeFileSync(path.join(source, 'Table.tsx'), 'export const Table = 1;');
    fs.writeFileSync(path.join(source, 'plugins/nested.ts'), 'export const nested = 1;');
    fs.writeFileSync(path.join(fixture, 'package.json'), '{"name":"consumer"}');
    fs.writeFileSync(
      path.join(fixture, 'node_modules/@astryxdesign/core/package.json'),
      '{"name":"@astryxdesign/core","version":"0.0.0"}',
    );
    // `components` -> `src/components`, a common project layout.
    fs.mkdirSync(path.join(fixture, 'src/components'), {recursive: true});
    fs.symlinkSync(path.join(fixture, 'src/components'), path.join(fixture, 'components'));

    const r = await swizzle('Table', {cwd: fixture, output: './components'});
    expect(r.data.files).toEqual(['Table.tsx', 'plugins/nested.ts']);
    expect(
      fs.readFileSync(path.join(fixture, 'src/components/Table/plugins/nested.ts'), 'utf8'),
    ).toBe('export const nested = 1;');
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
    fs.writeFileSync(
      path.join(fixture, 'node_modules/@astryxdesign/core/package.json'),
      '{"name":"@astryxdesign/core","version":"0.0.0"}',
    );
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

describe('swizzle.copy — the gh feedback line', () => {
  afterEach(() => {
    ghLookupFails = false;
    fs.rmSync(path.join(REPO, OUT), {recursive: true, force: true});
  });

  it(
    'returns its receipt, without the gh line, when the only gh on PATH is a symlink loop',
    async () => {
      const bin = fs.mkdtempSync(
        path.join(os.tmpdir(), 'astryx-swizzle-gh-loop-'),
      );
      fs.symlinkSync('gh', path.join(bin, 'gh'));
      const original = process.env.PATH;
      process.env.PATH = bin;
      try {
        const r = await swizzle('Button', {cwd: REPO, output: './' + OUT});
        expect(r.type).toBe('swizzle.copy');
        expect(r.data.filesCopied).toBeGreaterThan(0);
        expect(r.data.feedback?.ghCommand).toBeUndefined();
      } finally {
        process.env.PATH = original;
        fs.rmSync(bin, {recursive: true, force: true});
      }
    },
    SLOW,
  );

  it(
    'fails before writing anything when the gh lookup throws',
    async () => {
      ghLookupFails = true;
      await expect(
        swizzle('Button', {cwd: REPO, output: './' + OUT}),
      ).rejects.toThrow(/the gh lookup failed/);
      expect(fs.existsSync(path.join(REPO, OUT))).toBe(false);
    },
    SLOW,
  );

  it(
    'offers the gh command when gh is on PATH, without running gh',
    async () => {
      // A gh that records each run: a swizzle must not wait on it.
      const bin = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-swizzle-gh-'));
      const ran = path.join(bin, 'ran');
      fs.writeFileSync(
        path.join(bin, 'gh'),
        `#!/bin/sh\necho run >> ${JSON.stringify(ran)}\nexit 0\n`,
      );
      fs.chmodSync(path.join(bin, 'gh'), 0o755);
      const original = process.env.PATH;
      process.env.PATH = [bin, original].join(path.delimiter);
      try {
        const r = await swizzle('Button', {cwd: REPO, output: './' + OUT});
        expect(r.data.feedback?.ghCommand).toMatch(/^gh issue create --repo /);
        expect(fs.existsSync(ran)).toBe(false);
      } finally {
        process.env.PATH = original;
        fs.rmSync(bin, {recursive: true, force: true});
      }
    },
    SLOW,
  );
});

describe('swizzle.copy — private attribute owner modules (spec:AST-110 FR4)', () => {
  const OWNER_OUT = 'tmp-swizzle-owner-test';
  const out = () => path.join(REPO, OWNER_OUT);
  const exportKeys = () =>
    new Set(
      Object.keys(
        JSON.parse(
          fs.readFileSync(
            path.join(REPO, 'packages/core/package.json'),
            'utf-8',
          ),
        ).exports,
      ),
    );
  /** Every `@astryxdesign/core/*` import in a file. */
  const coreImportsOf = file =>
    [
      ...fs
        .readFileSync(file, 'utf-8')
        .matchAll(/from ['"](@astryxdesign\/core\/[^'"]+)['"]/g),
    ].map(m => m[1]);
  /** A module's source with every import specifier blanked. */
  const withoutSpecifiers = content =>
    content.replace(/(from\s+['"])[^'"]+(['"])/g, '$1$2');

  afterEach(() => {
    fs.rmSync(out(), {recursive: true, force: true});
  });

  it(
    'copies the owner module a component imports, and its unexported style module, beside it',
    async () => {
      const r = await swizzle('Item', {cwd: REPO, output: './' + OWNER_OUT});
      expect(r.type).toBe('swizzle.copy');
      expect(r.data.files).toEqual(
        expect.arrayContaining([
          '../privateAttributes/press.stylex.ts',
          '../motion/reducedMotion.stylex.ts',
        ]),
      );
      expect(r.data.filesCopied).toBe(r.data.files.length);
      // The component's import of the owner module stays relative.
      expect(
        fs.readFileSync(path.join(out(), 'Item/Item.tsx'), 'utf-8'),
      ).toContain("from '../privateAttributes/press.stylex'");
      // The owner module keeps its relative import of the unexported module,
      // and every package import in any copied file resolves.
      const owner = path.join(out(), 'privateAttributes/press.stylex.ts');
      expect(fs.readFileSync(owner, 'utf-8')).toContain(
        "from '../motion/reducedMotion.stylex'",
      );
      const keys = exportKeys();
      for (const file of [
        ...fs
          .readdirSync(path.join(out(), 'Item'))
          .map(f => path.join(out(), 'Item', f)),
        owner,
        path.join(out(), 'motion/reducedMotion.stylex.ts'),
      ]) {
        for (const specifier of coreImportsOf(file)) {
          expect(
            keys.has('./' + specifier.replace('@astryxdesign/core/', '')),
            specifier,
          ).toBe(true);
        }
      }
      // Whole and unedited, except import specifiers.
      expect(withoutSpecifiers(fs.readFileSync(owner, 'utf-8'))).toBe(
        withoutSpecifiers(
          fs.readFileSync(
            path.join(
              REPO,
              'packages/core/src/privateAttributes/press.stylex.ts',
            ),
            'utf-8',
          ),
        ),
      );
    },
    SLOW,
  );

  it(
    'reuses an identical copy for a second component, and refuses a changed one without --overwrite',
    async () => {
      await swizzle('Item', {cwd: REPO, output: './' + OWNER_OUT});
      const second = await swizzle('CheckboxList', {
        cwd: REPO,
        output: './' + OWNER_OUT,
      });
      // The identical owner module is part of the second copy too.
      expect(second.data.files).toContain('../privateAttributes/press.stylex.ts');
      expect(second.data.filesCopied).toBe(second.data.files.length);

      const owner = path.join(out(), 'privateAttributes/press.stylex.ts');
      const copied = fs.readFileSync(owner, 'utf-8');
      fs.writeFileSync(owner, copied + '\n// edited\n');
      fs.rmSync(path.join(out(), 'CheckboxList'), {
        recursive: true,
        force: true,
      });
      await expect(
        swizzle('CheckboxList', {cwd: REPO, output: './' + OWNER_OUT}),
      ).rejects.toMatchObject({code: 'ERR_FILE_EXISTS'});
      // The refusal wrote nothing.
      expect(fs.existsSync(path.join(out(), 'CheckboxList'))).toBe(false);
      expect(fs.readFileSync(owner, 'utf-8')).toBe(copied + '\n// edited\n');

      await swizzle('CheckboxList', {
        cwd: REPO,
        output: './' + OWNER_OUT,
        overwrite: true,
      });
      expect(fs.readFileSync(owner, 'utf-8')).toBe(copied);
    },
    SLOW,
  );

  it(
    'a failed shared-module write leaves no folder it created behind',
    async () => {
      // A folder where the owner module goes makes its write fail.
      const blocked = path.join(out(), 'privateAttributes/press.stylex.ts');
      fs.mkdirSync(blocked, {recursive: true});
      await expect(
        swizzle('Item', {cwd: REPO, output: './' + OWNER_OUT, overwrite: true}),
      ).rejects.toMatchObject({code: 'ERR_WRITE_FAILED'});
      expect(fs.existsSync(path.join(out(), 'Item'))).toBe(false);
      expect(fs.existsSync(path.join(out(), 'motion'))).toBe(false);
      // The folder that was there before the run stays.
      expect(fs.existsSync(blocked)).toBe(true);
    },
    SLOW,
  );
});

describe('swizzle.copy — nested component source', () => {
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
    fs.writeFileSync(
      path.join(fixture, 'node_modules/@astryxdesign/core/package.json'),
      '{"name":"@astryxdesign/core","version":"0.0.0"}',
    );

    const r = await swizzle('Table', {cwd: fixture, output: './out'});
    expect(r.data.files).toEqual(['Table.tsx', 'plugins/nested.ts']);
    expect(r.data.filesCopied).toBe(2);
    const outDir = path.join(fixture, 'out/Table');
    expect(fs.readdirSync(outDir).sort()).toEqual(['Table.tsx', 'plugins']);
    expect(fs.readdirSync(path.join(outDir, 'plugins'))).toEqual(['nested.ts']);
  });

  it('leaves out browser test harnesses (*.spec.ts, *.spec.tsx) at any depth', async () => {
    fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-swizzle-testdirs-'));
    const source = path.join(fixture, 'node_modules/@astryxdesign/core/src/Table');
    for (const file of [
      'Table.tsx',
      'Table.a11y.chromium.spec.ts',
      'plugins/nested.ts',
      'plugins/headingLinks.a11y.chromium.spec.ts',
      'plugins/Row.interaction.spec.tsx',
    ]) {
      fs.mkdirSync(path.dirname(path.join(source, file)), {recursive: true});
      fs.writeFileSync(path.join(source, file), 'export const x = 1;');
    }
    fs.writeFileSync(path.join(fixture, 'package.json'), '{"name":"consumer"}');
    fs.writeFileSync(
      path.join(fixture, 'node_modules/@astryxdesign/core/package.json'),
      '{"name":"@astryxdesign/core","version":"0.0.0"}',
    );

    const r = await swizzle('Table', {cwd: fixture, output: './out'});
    expect(r.data.files).toEqual(['Table.tsx', 'plugins/nested.ts']);
  });

  it("copies Markdown's plugins without its chromium harness", async () => {
    const harness = path.join(
      REPO,
      'packages/core/src/Markdown/plugins/headingLinks.a11y.chromium.spec.ts',
    );
    expect(fs.existsSync(harness)).toBe(true);
    const r = await swizzle('Markdown', {cwd: REPO, output: './' + OUT});
    expect(r.data.files.some(f => f.startsWith('plugins/'))).toBe(true);
    expect(r.data.files.filter(f => /\.spec\.[cm]?[jt]sx?$/.test(f))).toEqual([]);
    fs.rmSync(path.join(REPO, OUT), {recursive: true, force: true});
  }, SLOW);
});

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

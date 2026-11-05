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

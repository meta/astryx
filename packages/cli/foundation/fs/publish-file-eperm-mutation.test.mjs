// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Mutation test that forces fs.linkSync to throw EPERM so the fallback
 * path is exercised even when the destination already exists. Proves
 * COPYFILE_EXCL is the no-clobber gate.
 *
 * Separate file because vi.mock is hoisted and affects the whole module.
 */

import {describe, it, expect, beforeEach, afterEach, vi} from 'vitest';
import * as path from 'node:path';
import * as os from 'node:os';
import * as realFs from 'node:fs';

vi.mock('node:fs', async importOriginal => {
  const actual = await importOriginal();
  return {
    ...actual,
    linkSync: vi.fn(() => {
      const err = new Error('EPERM: operation not permitted, link');
      err.code = 'EPERM';
      throw err;
    }),
  };
});

const {publishNewFile} = await import('./publish-file.mjs');
const fs = await import('node:fs');

let tmpDir;
beforeEach(() => {
  // One mock serves both tests, so each counts only its own calls, in any order.
  vi.mocked(fs.linkSync).mockClear();
  tmpDir = realFs.mkdtempSync(path.join(os.tmpdir(), 'astryx-publish-eperm-'));
});
afterEach(() => {
  realFs.rmSync(tmpDir, {recursive: true, force: true});
});

describe('publishNewFile — forced EPERM fallback', () => {
  it('preserves an existing destination through COPYFILE_EXCL', () => {
    const tmp = path.join(tmpDir, '.tmp-src');
    const dest = path.join(tmpDir, 'victim.txt');
    realFs.writeFileSync(tmp, 'attacker-content');
    realFs.writeFileSync(dest, 'victim-content');

    expect(() => publishNewFile(tmp, dest)).toThrow(
      expect.objectContaining({code: 'EEXIST'}),
    );
    expect(realFs.readFileSync(dest, 'utf-8')).toBe('victim-content');
    expect(fs.linkSync).toHaveBeenCalledOnce();
  });

  it('publishes a new destination through the fallback', () => {
    const tmp = path.join(tmpDir, '.tmp-src');
    const dest = path.join(tmpDir, 'new-file.txt');
    realFs.writeFileSync(tmp, 'new-content');

    expect(() => publishNewFile(tmp, dest)).not.toThrow();
    expect(realFs.readFileSync(dest, 'utf-8')).toBe('new-content');
    expect(fs.linkSync).toHaveBeenCalled();
  });
});

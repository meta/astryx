// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Colocated tests for the template.copy leaf — overwrite safety + path
 * traversal. `template copy` writes files; the API must guard clobber/traversal
 * itself (it's a public surface), not rely on the CLI wrapper.
 */

import {describe, it, expect, beforeEach, afterEach} from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {template} from '../template.mjs';

const SLOW = 30_000;

describe('template.copy — overwrite + path safety', () => {
  let dir;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tmpl-copy-'));
  });
  afterEach(() => fs.rmSync(dir, {recursive: true, force: true}));

  it('copies a page template into a directory as page.tsx', async () => {
    const res = await template('blank', {targetPath: './dest', cwd: dir});
    expect(res.type).toBe('template.copy');
    expect(fs.existsSync(path.join(dir, 'dest', 'page.tsx'))).toBe(true);
  }, SLOW);

  it('refuses to overwrite an existing file (ERR_FILE_EXISTS), leaving it untouched', async () => {
    fs.writeFileSync(path.join(dir, 'mine.tsx'), 'USER CODE');
    await expect(
      template('blank', {targetPath: './mine.tsx', cwd: dir}),
    ).rejects.toMatchObject({code: 'ERR_FILE_EXISTS'});
    expect(fs.readFileSync(path.join(dir, 'mine.tsx'), 'utf-8')).toBe('USER CODE');
  }, SLOW);

  it('names the flag that replaces the file, as swizzle and theme add do', async () => {
    fs.writeFileSync(path.join(dir, 'mine.tsx'), 'USER CODE');
    await expect(
      template('blank', {targetPath: './mine.tsx', cwd: dir}),
    ).rejects.toThrow(
      'Refusing to overwrite existing file mine.tsx. Re-run with --overwrite (or -f) to replace it.',
    );
  }, SLOW);

  it('overwrites when overwrite:true is passed', async () => {
    fs.writeFileSync(path.join(dir, 'mine.tsx'), 'USER CODE');
    const res = await template('blank', {targetPath: './mine.tsx', overwrite: true, cwd: dir});
    expect(res.type).toBe('template.copy');
    expect(fs.readFileSync(path.join(dir, 'mine.tsx'), 'utf-8')).not.toBe('USER CODE');
  }, SLOW);

  it('rejects a traversal target and writes nothing outside cwd', async () => {
    await expect(
      template('blank', {targetPath: '../escape.tsx', cwd: dir}),
    ).rejects.toMatchObject({code: 'ERR_PATH_TRAVERSAL'});
    expect(fs.existsSync(path.join(dir, '..', 'escape.tsx'))).toBe(false);
  }, SLOW);

  it('rejects a directory target whose page.tsx is a symlink leading outside cwd', async () => {
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'tmpl-copy-outside-'));
    try {
      const victim = path.join(outside, 'victim.tsx');
      fs.writeFileSync(victim, 'OUTSIDE');
      fs.mkdirSync(path.join(dir, 'dest'));
      fs.symlinkSync(victim, path.join(dir, 'dest', 'page.tsx'));

      await expect(
        template('blank', {targetPath: './dest', overwrite: true, cwd: dir}),
      ).rejects.toMatchObject({code: 'ERR_PATH_TRAVERSAL'});
      expect(fs.readFileSync(victim, 'utf-8')).toBe('OUTSIDE');
    } finally {
      fs.rmSync(outside, {recursive: true, force: true});
    }
  }, SLOW);
});

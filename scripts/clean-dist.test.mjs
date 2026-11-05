// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Verifies the shared package build cleanup.
 * @input A temporary package directory containing dist and an unrelated file.
 * @output Confirms only dist is removed.
 * @position Regression coverage for dependency-free, cross-platform cleanup.
 */

import {execFileSync} from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {expect, it} from 'vitest';

const SCRIPT = fileURLToPath(new URL('./clean-dist.mjs', import.meta.url));

it('removes dist without touching sibling files', () => {
  const cwd = mkdtempSync(path.join(tmpdir(), 'astryx-clean-dist-'));

  try {
    mkdirSync(path.join(cwd, 'dist'));
    writeFileSync(path.join(cwd, 'dist', 'generated.js'), 'generated');
    writeFileSync(path.join(cwd, 'keep.txt'), 'keep');

    execFileSync(process.execPath, [SCRIPT], {cwd});

    expect(existsSync(path.join(cwd, 'dist'))).toBe(false);
    expect(existsSync(path.join(cwd, 'keep.txt'))).toBe(true);
  } finally {
    rmSync(cwd, {force: true, recursive: true});
  }
});

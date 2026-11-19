// Copyright (c) Meta Platforms, Inc. and affiliates.

import {execFileSync, spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {describe, expect, it} from 'vitest';
import {configDefaults} from 'vitest/config';
import {globToRegExp} from '../.github/scripts/lib/a11y-spec-files.mjs';
import {VITEST_DEFAULT_EXCLUDE, nodeTestFiles} from './vitest-node-files.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tracked = execFileSync('git', ['ls-files', '-z'], {
  cwd: ROOT,
  encoding: 'utf8',
  maxBuffer: 64 * 1024 * 1024,
})
  .split('\0')
  .filter(Boolean);

/** The tracked files `vitest list` collects for the `node` project. */
function vitestList(env) {
  const out = path.join(
    fs.mkdtempSync(path.join(os.tmpdir(), 'node-files-')),
    'list.json',
  );
  const result = spawnSync(
    'pnpm',
    [
      'exec',
      'vitest',
      'list',
      '--project',
      'node',
      '--filesOnly',
      `--json=${out}`,
    ],
    {cwd: ROOT, env: {...process.env, ...env}, encoding: 'utf8'},
  );
  expect(result.status, result.stderr).toBe(0);
  const known = new Set(tracked);
  return JSON.parse(fs.readFileSync(out, 'utf8'))
    .map(entry => path.relative(ROOT, entry.file).split(path.sep).join('/'))
    .filter(file => known.has(file))
    .sort();
}

describe("the node project's test files without Vitest", () => {
  it('matches the glob forms the lists use', () => {
    const glob = globToRegExp('packages/**/src/**/*.test.{ts,tsx,mjs}');
    expect(glob.test('packages/cli/src/a.test.ts')).toBe(true);
    expect(glob.test('packages/cli/x/src/y/a.test.mjs')).toBe(true);
    expect(glob.test('packages/cli/src/a.test.js')).toBe(false);
    // `**` matches no folder too, as Vitest's globs do.
    expect(glob.test('packages/src/a.test.ts')).toBe(true);
    expect(globToRegExp('packages/core/**').test('packages/core/a/b.ts')).toBe(
      true,
    );
    expect(globToRegExp('**/.git/**').test('a/.git/b')).toBe(true);
    expect(globToRegExp('a.*.test.mjs').test('a.1.test.mjs')).toBe(true);
    expect(globToRegExp('a.*.test.mjs').test('a/1.test.mjs')).toBe(false);
  });

  it("keeps Vitest's own default excludes", () => {
    expect(VITEST_DEFAULT_EXCLUDE).toEqual(configDefaults.exclude);
  });

  it.each([
    ['in the Node legs', {VITEST_SWIZZLE_PROOF_OWN_JOB: '1'}, true],
    ['in a local run', {VITEST_SWIZZLE_PROOF_OWN_JOB: ''}, false],
  ])(
    'lists the files Vitest collects %s',
    (_, env, swizzleProofOwnJob) => {
      const listed = nodeTestFiles(tracked, {swizzleProofOwnJob});
      expect(listed.length).toBeGreaterThan(500);
      expect(listed).toEqual(vitestList(env));
    },
    60_000,
  );
});

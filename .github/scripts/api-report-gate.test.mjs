// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Contracts for the committed-API-report check.
 * @input Fixture package lists, changed-file lists, and api-changes.json files
 * @output Which packages are in scope, which fail, and the failure line
 * @position Regression tests for `.github/scripts/api-report-gate.mjs`
 */

import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {afterAll, describe, expect, it} from 'vitest';
import {
  failureLine,
  packagesInScope,
  stalePackages,
} from './api-report-gate.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.join(HERE, 'api-report-gate.mjs');

const PACKAGES = [
  {name: '@astryxdesign/core', dir: 'packages/core'},
  {name: '@astryxdesign/cli', dir: 'packages/cli'},
  {name: '@astryxdesign/richtext', dir: 'packages/richtext'},
  {name: '@astryxdesign/theme-butter', dir: 'packages/themes/butter'},
];
const SHARED = ['packages/core', 'packages/cli', 'pnpm-lock.yaml'];
const scope = input =>
  packagesInScope({
    packages: PACKAGES,
    sharedInputs: SHARED,
    decided: true,
    truncated: false,
    ...input,
  }).map(p => p.dir);

const entry = (pkg, fields = {}) => ({
  pkg,
  stale: false,
  missing: false,
  staleRows: 0,
  staleOwnRows: 0,
  rows: [],
  ...fields,
});

describe('scope', () => {
  it('checks only the packages whose files the pull request changes', () => {
    expect(
      scope({changedFiles: ['packages/richtext/src/Editor.tsx', 'docs/x.md']}),
    ).toEqual(['packages/richtext']);
    expect(scope({changedFiles: ['docs/x.md']})).toEqual([]);
  });

  it('checks every package when a shared report input changes', () => {
    expect(scope({changedFiles: ['packages/core/src/Item/Item.tsx']})).toEqual(
      PACKAGES.map(p => p.dir),
    );
    expect(scope({changedFiles: ['pnpm-lock.yaml']})).toHaveLength(4);
  });

  it('does not take a sibling folder with the same prefix', () => {
    expect(scope({changedFiles: ['packages/cli-extra/x.ts']})).toEqual([]);
  });

  it('checks every package when the scope is undecided, truncated, or has no file list', () => {
    expect(scope({decided: false, changedFiles: []})).toHaveLength(4);
    expect(scope({truncated: true, changedFiles: []})).toHaveLength(4);
    expect(scope({changedFiles: null})).toHaveLength(4);
  });
});

describe('stale reports', () => {
  it('fails a package in scope whose committed report differs from its build', () => {
    const changes = {
      version: 2,
      packages: [
        entry('@astryxdesign/richtext', {stale: true, staleRows: 3}),
        entry('@astryxdesign/theme-butter', {stale: true, staleRows: 1}),
        entry('@astryxdesign/cli', {missing: true}),
      ],
    };
    const inScope = PACKAGES.filter(p => p.dir !== 'packages/themes/butter');
    expect(stalePackages({changes, inScope}).map(p => p.dir)).toEqual([
      'packages/cli',
      'packages/richtext',
    ]);
  });

  it('passes when every report in scope matches its build', () => {
    const changes = {
      version: 2,
      packages: PACKAGES.map(p => entry(p.name)),
    };
    expect(stalePackages({changes, inScope: PACKAGES})).toEqual([]);
  });

  it('names the fix in one line', () => {
    expect(failureLine(PACKAGES[2])).toBe(
      "The committed API report for @astryxdesign/richtext is behind this pull request's build. Run `pnpm api:report` and commit packages/richtext/api-report.md.",
    );
  });
});

describe('command line', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'api-report-gate-'));
  afterAll(() => fs.rmSync(dir, {recursive: true, force: true}));
  const write = (name, value) => {
    const file = path.join(dir, name);
    fs.writeFileSync(
      file,
      typeof value === 'string' ? value : JSON.stringify(value),
    );
    return file;
  };
  const run = args =>
    spawnSync(process.execPath, [SCRIPT, ...args], {
      encoding: 'utf8',
      env: {...process.env, GITHUB_STEP_SUMMARY: ''},
    });
  const packagesFile = write('packages.json', PACKAGES);

  it('exits 1 with the fix as a GitHub error for a stale report in scope', () => {
    const changes = write('stale.json', {
      version: 2,
      packages: [entry('@astryxdesign/richtext', {stale: true, staleRows: 2})],
    });
    const files = write('files.txt', 'packages/richtext/src/a.ts\n');
    const summary = path.join(dir, 'summary.md');
    const out = run([
      '--changes',
      changes,
      '--changed-files',
      files,
      '--decided',
      'true',
      '--truncated',
      'false',
      '--packages',
      packagesFile,
      '--summary',
      summary,
    ]);
    expect(out.status).toBe(1);
    expect(out.stdout).toContain(
      '::error file=packages/richtext/api-report.md,title=API report behind this build::The committed API report for @astryxdesign/richtext is behind',
    );
    expect(fs.readFileSync(summary, 'utf8')).toMatch(
      /\| `@astryxdesign\/richtext` \| 2 \|/,
    );
  });

  it('exits 0 when the stale report is outside the pull request scope', () => {
    const changes = write('other.json', {
      version: 2,
      packages: [entry('@astryxdesign/richtext', {stale: true, staleRows: 2})],
    });
    const files = write('docs.txt', 'packages/themes/butter/src/x.ts\n');
    const out = run([
      '--changes',
      changes,
      '--changed-files',
      files,
      '--decided',
      'true',
      '--truncated',
      'false',
      '--packages',
      packagesFile,
    ]);
    expect(out.status).toBe(0);
  });

  it('exits 2 when it can read neither the changes file nor the packages', () => {
    const out = run([
      '--changes',
      path.join(dir, 'none.json'),
      '--packages',
      path.join(dir, 'none-packages.json'),
    ]);
    expect(out.status).toBe(2);
  });
});

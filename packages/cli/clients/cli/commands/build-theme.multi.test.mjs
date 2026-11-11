// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Tests for `astryx theme build <a> <b> …` — several themes per
 * invocation.
 *
 * The load-bearing guarantee is equivalence: one invocation over N theme files
 * must write exactly the bytes N serial invocations write. Everything else here
 * guards the edges that only exist once the argument is variadic — the JSON
 * envelope, --check across a set, --out (which names one file), and fail-fast.
 *
 * `astryx theme build` needs a compiled @astryxdesign/core, so this suite
 * builds core once via the shared ensureCoreBuilt() helper.
 */

import {describe, it, expect, beforeAll, beforeEach, afterEach} from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {ensureCoreBuilt} from './ensure-core-built.mjs';
import {runCli} from '../../../test-utils/run-cli.mjs';

const THEMES = {
  'alpha.mjs': `export default { name: 'alpha', tokens: { '--color-bg': '#ffffff' } };\n`,
  'beta.mjs': `export default { name: 'beta', tokens: { '--color-bg': '#010203' } };\n`,
  'gamma.mjs': `export default { name: 'gamma', tokens: { '--color-bg': '#ff00ff' } };\n`,
};
const FILES = Object.keys(THEMES);
const OUTPUTS = ['alpha', 'beta', 'gamma'].flatMap(n => [
  `${n}.css`,
  `${n}.js`,
  `${n}.d.ts`,
]);

/** A fresh temp dir holding the three theme sources. */
function themeDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-theme-multi-'));
  for (const [name, source] of Object.entries(THEMES)) {
    fs.writeFileSync(path.join(dir, name), source);
  }
  dirs.push(dir);
  return dir;
}

/** @type {string[]} */
let dirs;

beforeAll(() => {
  ensureCoreBuilt();
}, 200_000);

beforeEach(() => {
  dirs = [];
});
afterEach(() => {
  for (const dir of dirs) fs.rmSync(dir, {recursive: true, force: true});
});

describe('theme build with several files', () => {
  it('writes byte-identical output to one invocation per theme', async () => {
    const serial = themeDir();
    for (const file of FILES) {
      const r = await runCli(['theme', 'build', file], serial);
      expect(r.status).toBe(0);
    }

    const batch = themeDir();
    const r = await runCli(['theme', 'build', ...FILES], batch);
    expect(r.status).toBe(0);

    for (const output of OUTPUTS) {
      const one = fs.readFileSync(path.join(serial, output), 'utf8');
      const many = fs.readFileSync(path.join(batch, output), 'utf8');
      expect({output, content: many}).toEqual({output, content: one});
    }
  }, 120_000);

  it('reports every theme in one theme.build.batch envelope', async () => {
    const dir = themeDir();
    const r = await runCli(['--json', 'theme', 'build', ...FILES], dir);
    expect(r.status).toBe(0);

    const envelope = JSON.parse(r.stdout);
    expect(envelope.type).toBe('theme.build.batch');
    expect(envelope.data.count).toBe(3);
    expect(envelope.data.results.map(x => x.file)).toEqual(FILES);
    expect(envelope.data.results.map(x => x.receipt.data.name)).toEqual([
      'alpha',
      'beta',
      'gamma',
    ]);
    expect(envelope.data.results[0].receipt.type).toBe('theme.build');
  }, 120_000);

  it('keeps the bare theme.build envelope for a single file', async () => {
    const dir = themeDir();
    const r = await runCli(['--json', 'theme', 'build', 'alpha.mjs'], dir);
    expect(r.status).toBe(0);
    expect(JSON.parse(r.stdout).type).toBe('theme.build');
  }, 120_000);

  it('--check passes when every theme is current and fails when one drifts', async () => {
    const dir = themeDir();
    expect((await runCli(['theme', 'build', ...FILES], dir)).status).toBe(0);

    const fresh = await runCli(['theme', 'build', ...FILES, '--check'], dir);
    expect(fresh.status).toBe(0);

    // Drift one committed output rather than its source: the harness runs the
    // CLI in-process, where jiti would serve a re-read theme file from its
    // module cache.
    fs.writeFileSync(path.join(dir, 'beta.css'), '/* hand-edited */\n');
    const drifted = await runCli(['theme', 'build', ...FILES, '--check'], dir);
    expect(drifted.status).toBe(1);
    expect(drifted.stdout + drifted.stderr).toMatch(/beta\.css/);
  }, 120_000);

  it('rejects --out with more than one theme', async () => {
    const dir = themeDir();
    const r = await runCli(
      ['theme', 'build', 'alpha.mjs', 'beta.mjs', '--out', 'one.css'],
      dir,
    );
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/--out takes a single output path/);
    expect(fs.existsSync(path.join(dir, 'one.css'))).toBe(false);
  }, 120_000);

  it('stops at the first failure and names the theme that failed', async () => {
    const dir = themeDir();
    fs.writeFileSync(
      path.join(dir, 'beta.mjs'),
      `export default { tokens: { '--color-bg': '#010203' } };\n`,
    );
    const r = await runCli(['theme', 'build', ...FILES], dir);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/beta\.mjs: Theme must have a name/);
    expect(fs.existsSync(path.join(dir, 'alpha.css'))).toBe(true);
    expect(fs.existsSync(path.join(dir, 'gamma.css'))).toBe(false);
  }, 120_000);

  it('tells the user a quoted glob was never expanded', async () => {
    const dir = themeDir();
    const r = await runCli(['theme', 'build', '*.mjs'], dir);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/expanded by your shell/);
  }, 120_000);

  it('refuses a file given twice before writing anything', async () => {
    const dir = themeDir();
    const r = await runCli(
      ['--json', 'theme', 'build', 'alpha.mjs', './alpha.mjs'],
      dir,
    );
    expect(r.status).toBe(1);
    expect(JSON.parse(r.stdout)).toMatchObject({code: 'ERR_THEME_INVALID'});
    expect(fs.existsSync(path.join(dir, 'alpha.css'))).toBe(false);
  }, 120_000);

  it('refuses a second theme with the same name instead of replacing the first', async () => {
    const dir = themeDir();
    fs.writeFileSync(
      path.join(dir, 'alpha2.mjs'),
      `export default { name: 'alpha', tokens: { '--color-bg': '#000000' } };\n`,
    );
    const r = await runCli(['theme', 'build', 'alpha.mjs', 'alpha2.mjs'], dir);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(
      /alpha2\.mjs: alpha\.mjs already wrote alpha\.css in this run/,
    );
    expect(fs.readFileSync(path.join(dir, 'alpha.css'), 'utf-8')).toMatch(
      /#ffffff/,
    );
  }, 120_000);
});

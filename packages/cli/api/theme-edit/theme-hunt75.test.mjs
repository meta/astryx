// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Compile and check follow the app copy: a check fails with a code
 * when the copy is behind, each theme's copy follows its own build, the
 * copy's build outputs alone are still the editor's, a failed write names
 * the real folder, copy files are no theme sources, and a no-op set writes
 * back a missing copy file.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {spawnSync} from 'node:child_process';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {themeEditNew, themeEditSet} from './theme-edit.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {
  FIXTURE_PACKAGES,
  writeFixtureBaseTheme,
} from '../../test-utils/base-theme-fixture.mjs';

/** @type {string} */
let cwd;
const BIN = path.resolve(
  import.meta.dirname,
  '../../clients/cli/bin/astryx.mjs',
);

beforeAll(() => {
  cwd = makeLinkedFixture('astryx-theme-hunt75-', FIXTURE_PACKAGES);
  writeFixtureBaseTheme(cwd, 'neutral');
}, 120_000);

afterAll(() => {
  removeLinkedFixture(cwd);
});

/** @param {string} rel */
const read = rel => fs.readFileSync(path.join(cwd, rel), 'utf8');
/** @param {string[]} args @param {string} [at] */
const cli = (args, at = cwd) =>
  spawnSync(process.execPath, [BIN, ...args], {cwd: at, encoding: 'utf8'});
/** @param {any} r */
const stale = r => /** @type {any} */ (r.data).appCopyStale;
const compile = (/** @type {string[]} */ ...args) =>
  cli(['experimental', 'theme', 'compile', ...args]);

describe('a check fails when the app copy is behind, saying why', () => {
  it('a hand-edited copy file fails --check with a code and no up-to-date claim', async () => {
    await themeEditNew('c1', {cwd});
    fs.writeFileSync(path.join(cwd, 'src/themes/c1/c1.css'), '/* hand */\n');
    const r = compile('themes/c1/c1.theme.ts', '--check');
    expect(r.status).toBe(1);
    expect(r.stdout + r.stderr).not.toContain('up to date.');
    expect(r.stdout + r.stderr).toContain(
      "c1's app copy in src/themes/c1/ is not up to date: src/themes/c1/c1.css is not the current build",
    );
    const j = cli([
      '--json',
      'experimental',
      'theme',
      'compile',
      'themes/c1/c1.theme.ts',
      '--check',
    ]);
    const out = JSON.parse(j.stdout);
    expect(out.code).toBe('ERR_THEME_STALE');
    expect(out.data?.upToDate).not.toBe(true);
  }, 240_000);

  it('one copy file deleted fails --check, and a no-op set writes it back', async () => {
    await themeEditNew('c13', {cwd});
    await themeEditSet('c13', 'corners', 'pill', {cwd});
    fs.rmSync(path.join(cwd, 'src/themes/c13/c13.js'));
    const r = compile('themes/c13/c13.theme.ts', '--check');
    expect(r.status).toBe(1);
    expect(r.stdout + r.stderr).toContain(
      'src/themes/c13/c13.js is missing from the app copy',
    );
    await themeEditSet('c13', 'corners', 'pill', {cwd});
    expect(fs.existsSync(path.join(cwd, 'src/themes/c13/c13.js'))).toBe(true);
    expect(compile('themes/c13/c13.theme.ts', '--check').status).toBe(0);
  }, 240_000);
});

describe('a check never passes over a copy behind its build', () => {
  it('a folder at a copy file name fails --check --json with a code, never up to date', async () => {
    await themeEditNew('h1', {cwd});
    fs.rmSync(path.join(cwd, 'src/themes/h1/h1.css.d.ts'));
    fs.mkdirSync(path.join(cwd, 'src/themes/h1/h1.css.d.ts'));
    const j = cli([
      '--json',
      'experimental',
      'theme',
      'compile',
      'themes/h1/h1.theme.ts',
      '--check',
    ]);
    expect(j.status).toBe(1);
    const out = JSON.parse(j.stdout);
    expect(out.code).toBe('ERR_THEME_STALE');
    expect(out.data?.upToDate).not.toBe(true);
  }, 240_000);

  it('a copy left behind while its folder was read-only fails --check once it is writable again', async () => {
    if (process.getuid?.() === 0) return;
    await themeEditNew('t1', {cwd});
    const dir = path.join(cwd, 'src/themes/t1');
    fs.chmodSync(dir, 0o555);
    try {
      await themeEditSet('t1', 'corners', 'pill', {cwd});
    } finally {
      fs.chmodSync(dir, 0o755);
    }
    const r = compile('themes/t1/t1.theme.ts', '--check');
    expect(r.status).toBe(1);
    expect(r.stdout + r.stderr).toContain('is not the current build');
  }, 240_000);
});

describe('compile --json says what the text says', () => {
  it('carries appCopyStale, and leaves fonts the copy loads out of its notices and the full help', async () => {
    await themeEditNew('j1', {cwd});
    await themeEditSet('j1', 'font', 'Inter', {cwd});
    const sheet = path.join(cwd, 'src/themes/j1/j1.fonts.css');
    const head = read('src/themes/j1/j1.fonts.css').split('\n')[0];
    fs.writeFileSync(
      sheet,
      `${head}\n@import "@fontsource/inter/index.css";\n`,
    );
    const j = cli([
      '--json',
      'experimental',
      'theme',
      'compile',
      'themes/j1/j1.theme.ts',
    ]);
    const out = JSON.parse(j.stdout);
    expect(JSON.stringify(out.data.notices ?? [])).not.toContain('"Inter"');
    const full = cli([
      'experimental',
      'theme',
      'compile',
      'themes/j1/j1.theme.ts',
      '--detail',
      'full',
    ]);
    expect(full.stdout + full.stderr).not.toMatch(/not load[^\n]*Inter/);
    fs.writeFileSync(path.join(cwd, 'src/themes/j1/j1Theme.ts'), '// mine\n');
    const blocked = JSON.parse(
      cli([
        '--json',
        'experimental',
        'theme',
        'compile',
        'themes/j1/j1.theme.ts',
      ]).stdout,
    );
    expect(blocked.data.appCopyStale).toContain(
      'src/themes/j1/j1Theme.ts is yours',
    );
  }, 240_000);
});

describe('each copy follows its own build', () => {
  it('a later theme failing does not keep the first theme copy behind', async () => {
    await themeEditNew('c4a', {cwd});
    await themeEditNew('c4b', {cwd});
    await themeEditSet('c4a', 'corners', 'pill', {cwd});
    fs.writeFileSync(path.join(cwd, 'src/themes/c4a/c4a.css'), '/* old */\n');
    fs.writeFileSync(
      path.join(cwd, 'themes/c4b/c4b.theme.ts'),
      'not a theme(\n',
    );
    const r = compile('themes/c4a/c4a.theme.ts', 'themes/c4b/c4b.theme.ts');
    expect(r.status).not.toBe(0);
    expect(read('src/themes/c4a/c4a.css')).not.toBe('/* old */\n');
  }, 240_000);
});

describe('what the copy is, and what stops it', () => {
  it('only the copy build outputs left are still the editor own, and written over', async () => {
    await themeEditNew('c5', {cwd});
    for (const n of ['c5Theme.doc.mjs', 'c5Theme.ts', 'c5.fonts.css'])
      fs.rmSync(path.join(cwd, 'src/themes/c5', n));
    const r = await themeEditSet('c5', 'corners', 'pill', {cwd});
    expect(stale(r)).toBeUndefined();
    expect(fs.existsSync(path.join(cwd, 'src/themes/c5/c5Theme.ts'))).toBe(
      true,
    );
  }, 240_000);

  it('a read-only src/themes is named, not the copy folder it could not make', async () => {
    if (process.getuid?.() === 0) return;
    await themeEditNew('c7', {cwd});
    fs.rmSync(path.join(cwd, 'src/themes/c7'), {recursive: true});
    const themes = path.join(cwd, 'src/themes');
    fs.chmodSync(themes, 0o555);
    try {
      const r = await themeEditSet('c7', 'corners', 'pill', {cwd});
      expect(stale(r)).toContain('src/themes is not writable');
      expect(stale(r)).not.toContain('src/themes/c7 is not writable');
    } finally {
      fs.chmodSync(themes, 0o755);
    }
  }, 240_000);
});

describe('copy files are no theme sources', () => {
  it('the copy descriptor, the theme module, a subfolder run and --out into the copy are refused by name', async () => {
    await themeEditNew('c10', {cwd});
    const doc = cli([
      '--json',
      'experimental',
      'theme',
      'compile',
      'src/themes/c10/c10Theme.doc.mjs',
    ]);
    expect(doc.stdout).toContain("part of c10's app copy");
    expect(doc.stdout).toContain('themes/c10/c10.theme.ts');
    expect(doc.stdout).not.toContain('theme template');
    fs.writeFileSync(path.join(cwd, 'src/astryx-themes.ts'), 'export {};\n');
    const mod = cli([
      '--json',
      'experimental',
      'theme',
      'compile',
      'src/astryx-themes.ts',
    ]);
    expect(mod.stdout).toContain("is the app's theme module");
    fs.rmSync(path.join(cwd, 'src/astryx-themes.ts'));
    fs.mkdirSync(path.join(cwd, 'src/app'), {recursive: true});
    const sub = cli(
      [
        '--json',
        'experimental',
        'theme',
        'compile',
        '../themes/c10/c10Theme.ts',
      ],
      path.join(cwd, 'src/app'),
    );
    expect(sub.stdout).toContain('compile it from the app root');
    expect(sub.stdout).not.toContain('ERR_PATH_TRAVERSAL');
    const before = read('src/themes/c10/c10.css');
    const out = compile(
      'themes/c10/c10.theme.ts',
      '--out',
      'src/themes/c10/c10.css',
    );
    expect(out.status).not.toBe(0);
    expect(out.stdout + out.stderr).toContain("in c10's app copy");
    // The folder form of --out, with and without its slash, too.
    for (const folder of ['src/themes/c10', 'src/themes/c10/']) {
      const r = compile('themes/c10/c10.theme.ts', '--out', folder);
      expect(r.status, folder).not.toBe(0);
      expect(r.stdout + r.stderr, folder).toContain("in c10's app copy");
    }
    expect(read('src/themes/c10/c10.css')).toBe(before);
  }, 240_000);

  it('compile help names the app copy', () => {
    const r = cli(['experimental', 'theme', 'compile', '--help']);
    expect(r.stdout).toContain('src/themes/<theme>/');
  });
});

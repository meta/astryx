// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The app copy's follow-through: every command that builds or checks
 * an editor theme says when its copy is behind, a link or folder at a copy
 * name stops it, a failed write is said, a missing descriptor is written
 * back, compile finds the copy's source and its fonts, and the help says so.
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
  cwd = makeLinkedFixture('astryx-theme-hunt70-', FIXTURE_PACKAGES);
  writeFixtureBaseTheme(cwd, 'neutral');
}, 120_000);

afterAll(() => {
  removeLinkedFixture(cwd);
});

/** @param {string} rel */
const read = rel => fs.readFileSync(path.join(cwd, rel), 'utf8');
/** @param {string[]} args */
const cli = args =>
  spawnSync(process.execPath, [BIN, ...args], {cwd, encoding: 'utf8'});
/** @param {any} r */
const stale = r => /** @type {any} */ (r.data).appCopyStale;

describe('hunt70: every build and check says the copy is behind', () => {
  it('compile, compile --check and a no-op set name a file in the way', async () => {
    await themeEditNew('n1', {cwd});
    await themeEditSet('n1', 'corners', 'pill', {cwd});
    fs.writeFileSync(path.join(cwd, 'src/themes/n1/n1Theme.ts'), '// mine\n');
    const compiled = cli([
      'experimental',
      'theme',
      'compile',
      'themes/n1/n1.theme.ts',
    ]);
    expect(compiled.stdout + compiled.stderr).toContain(
      'the app copy in src/themes/n1/ was not updated: src/themes/n1/n1Theme.ts is yours',
    );
    const check = cli([
      'experimental',
      'theme',
      'compile',
      'themes/n1/n1.theme.ts',
      '--check',
    ]);
    expect(check.status).toBe(1);
    expect(check.stdout + check.stderr).toContain('was not updated');
    const same = await themeEditSet('n1', 'corners', 'pill', {cwd});
    expect(stale(same)).toContain('n1Theme.ts is yours');
  }, 240_000);

  it('compile --check fails when the copy is gone, and compile of its source names the editor', async () => {
    await themeEditNew('n9', {cwd});
    fs.rmSync(path.join(cwd, 'src/themes/n9'), {recursive: true});
    const check = cli([
      'experimental',
      'theme',
      'compile',
      'themes/n9/n9.theme.ts',
      '--check',
    ]);
    expect(check.status).toBe(1);
    expect(check.stdout + check.stderr).toContain(
      'the app copy in src/themes/n9/ is gone',
    );
    const r = cli([
      '--json',
      'experimental',
      'theme',
      'compile',
      'src/themes/n9/n9Theme.ts',
    ]);
    expect(r.stdout).toContain('experimental theme editor show n9');
    expect(r.stdout).not.toContain('theme template');
  }, 240_000);
});

describe('hunt70: what stops the copy, said', () => {
  it('a link of yours at a copy name stops it, and stays a link', async () => {
    await themeEditNew('n3', {cwd});
    const shared = path.join(cwd, 'shared-n3.css');
    fs.writeFileSync(shared, '/* mine */\n');
    fs.rmSync(path.join(cwd, 'src/themes/n3/n3.css'));
    fs.symlinkSync(shared, path.join(cwd, 'src/themes/n3/n3.css'));
    const r = await themeEditSet('n3', 'corners', 'pill', {cwd});
    expect(stale(r)).toContain('src/themes/n3/n3.css is a link');
    expect(
      fs.lstatSync(path.join(cwd, 'src/themes/n3/n3.css')).isSymbolicLink(),
    ).toBe(true);
    expect(fs.readFileSync(shared, 'utf8')).toBe('/* mine */\n');
  }, 240_000);

  it('a folder at a copy file name, a file where the folder goes, and a folder that cannot be written are said', async () => {
    await themeEditNew('n5', {cwd});
    fs.rmSync(path.join(cwd, 'src/themes/n5/n5.js'));
    fs.mkdirSync(path.join(cwd, 'src/themes/n5/n5.js'));
    const folder = await themeEditSet('n5', 'corners', 'pill', {cwd});
    expect(stale(folder)).toContain(
      'src/themes/n5/n5.js is a folder, at a name the copy uses for a file',
    );
    await themeEditNew('n5f', {cwd});
    fs.rmSync(path.join(cwd, 'src/themes/n5f'), {recursive: true});
    fs.writeFileSync(path.join(cwd, 'src/themes/n5f'), 'x');
    const file = await themeEditSet('n5f', 'corners', 'pill', {cwd});
    expect(stale(file)).toContain(
      "src/themes/n5f is a file, where the copy's folder goes",
    );
    if (process.getuid?.() !== 0) {
      await themeEditNew('n5w', {cwd});
      const dir = path.join(cwd, 'src/themes/n5w');
      fs.chmodSync(dir, 0o555);
      try {
        const ro = await themeEditSet('n5w', 'corners', 'pill', {cwd});
        expect(stale(ro)).toContain('src/themes/n5w is not writable');
      } finally {
        fs.chmodSync(dir, 0o755);
      }
    }
  }, 240_000);

  it('a missing descriptor leaves the copy the editor own, and is written back', async () => {
    await themeEditNew('n6', {cwd});
    fs.rmSync(path.join(cwd, 'src/themes/n6/n6Theme.doc.mjs'));
    const before = read('src/themes/n6/n6.css');
    const r = await themeEditSet('n6', 'corners', 'pill', {cwd});
    expect(stale(r)).toBeUndefined();
    expect(fs.existsSync(path.join(cwd, 'src/themes/n6/n6Theme.doc.mjs'))).toBe(
      true,
    );
    expect(read('src/themes/n6/n6.css')).not.toBe(before);
  }, 240_000);
});

describe('hunt70: compile of the copy, its lock and its fonts', () => {
  it('the copy source is refused as a compile target, naming the theme to compile', async () => {
    await themeEditNew('n4', {cwd});
    await themeEditSet('n4', 'corners', 'pill', {cwd});
    fs.writeFileSync(path.join(cwd, 'src/themes/n4/n4.css'), '/* old */\n');
    const r = cli([
      'experimental',
      'theme',
      'compile',
      'src/themes/n4/n4Theme.ts',
    ]);
    // The copy's source is no compile target: the theme is, and the copy
    // follows it.
    expect(r.status).not.toBe(0);
    expect(r.stdout + r.stderr).toContain("is part of n4's app copy");
    expect(r.stdout + r.stderr).toContain('themes/n4/n4.theme.ts');
  }, 240_000);

  it('a font the copy font stylesheet loads is not named as not loaded', async () => {
    await themeEditNew('n2', {cwd});
    await themeEditSet('n2', 'font', 'Inter', {cwd});
    const sheet = path.join(cwd, 'src/themes/n2/n2.fonts.css');
    const head = read('src/themes/n2/n2.fonts.css').split('\n')[0];
    fs.writeFileSync(
      sheet,
      `${head}\n@import "@fontsource/inter/index.css";\n`,
    );
    const r = cli([
      'experimental',
      'theme',
      'compile',
      'themes/n2/n2.theme.ts',
    ]);
    expect(r.stdout + r.stderr).not.toMatch(/not loaded: [^\n]*Inter/);
  }, 240_000);
});

describe('hunt70: never half-written, never from a refused build', () => {
  it('src/themes as a file stops the copy, said, with nothing written', async () => {
    await themeEditNew('r26', {cwd});
    const keep = path.join(cwd, 'themes-keep');
    fs.renameSync(path.join(cwd, 'src/themes'), keep);
    fs.writeFileSync(path.join(cwd, 'src/themes'), 'x');
    try {
      const r = await themeEditSet('r26', 'corners', 'pill', {cwd});
      expect(stale(r)).toContain(
        'src/themes is a file, where a folder on the way to the copy goes',
      );
      expect(fs.readFileSync(path.join(cwd, 'src/themes'), 'utf8')).toBe('x');
    } finally {
      fs.rmSync(path.join(cwd, 'src/themes'));
      fs.renameSync(keep, path.join(cwd, 'src/themes'));
    }
  }, 240_000);

  it('a refused compile writes no app copy', async () => {
    await themeEditNew('r26f', {cwd});
    const copy = read('src/themes/r26f/r26f.css');
    // A damaged build file the compile refuses to replace.
    fs.writeFileSync(path.join(cwd, 'themes/r26f/r26f.css'), '/* hand */\n');
    fs.writeFileSync(
      path.join(cwd, 'themes/r26f/r26f.theme.ts'),
      'not a theme(\n',
    );
    const r = cli([
      'experimental',
      'theme',
      'compile',
      'themes/r26f/r26f.theme.ts',
    ]);
    expect(r.status).not.toBe(0);
    expect(read('src/themes/r26f/r26f.css')).toBe(copy);
  }, 240_000);
});

describe('hunt70: the help says the copy rule', () => {
  it('editor and compile help', async () => {
    const editor = (
      await import('../../clients/cli/commands/experimental-theme-editor.doc.mjs')
    ).doc;
    expect(JSON.stringify(editor)).not.toContain('is left alone');
    expect(JSON.stringify(editor)).toContain('appCopyStale');
    const compile = (
      await import('../../clients/cli/commands/experimental-theme-compile.doc.mjs')
    ).doc;
    expect(compile.description).toContain('src/themes/<theme>/ again');
  });
});

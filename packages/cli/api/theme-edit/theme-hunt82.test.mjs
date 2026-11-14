// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Compile writes the app copy from what it just built; --check reads
 * it as a checkout writes it, fails it with the documented check result,
 * and leaves a stale theme output to the outputs check; copy files and the
 * copy folder are no compile targets or --out; the copy's font stylesheet
 * follows the fonts the theme loads now.
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
  cwd = makeLinkedFixture('astryx-theme-hunt82-', FIXTURE_PACKAGES);
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

/** Install a stand-in @fontsource/inter for the fixture; returns its remover. */
const installInter = () => {
  const pkg = path.join(path.dirname(cwd), 'node_modules/@fontsource/inter');
  fs.mkdirSync(pkg, {recursive: true});
  fs.writeFileSync(
    path.join(pkg, 'package.json'),
    JSON.stringify({
      name: '@fontsource/inter',
      version: '5.0.0',
      exports: {
        '.': './index.css',
        './index.css': './index.css',
        './package.json': './package.json',
      },
    }),
  );
  fs.writeFileSync(path.join(pkg, 'index.css'), '/* inter */\n');
  return () => fs.rmSync(pkg, {recursive: true, force: true});
};
const compile = (/** @type {string[]} */ ...args) =>
  cli(['experimental', 'theme', 'compile', ...args]);
const compileJson = (/** @type {string[]} */ ...args) =>
  JSON.parse(
    cli(['--json', 'experimental', 'theme', 'compile', ...args]).stdout,
  );

describe('compile writes the copy from what it built', () => {
  it('after a hand edit of the theme source, the copy follows and the check passes', async () => {
    await themeEditNew('e1', {cwd});
    const src = path.join(cwd, 'themes/e1/e1.theme.ts');
    fs.writeFileSync(
      src,
      read('themes/e1/e1.theme.ts').replace(
        "name: 'e1',",
        "name: 'e1',\n  tokens: {'--radius-page': '33px'},",
      ),
    );
    const r = compile('themes/e1/e1.theme.ts');
    expect(r.status).toBe(0);
    expect(read('src/themes/e1/e1.css')).toContain('33px');
    expect(compile('themes/e1/e1.theme.ts', '--check').status).toBe(0);
  }, 240_000);
});

describe('the check reads the copy as a checkout writes it', () => {
  it('a copy with CRLF line endings is up to date', async () => {
    await themeEditNew('e3', {cwd});
    for (const n of fs.readdirSync(path.join(cwd, 'src/themes/e3'))) {
      const f = path.join(cwd, 'src/themes/e3', n);
      fs.writeFileSync(f, fs.readFileSync(f, 'utf8').replace(/\n/g, '\r\n'));
    }
    expect(compile('themes/e3/e3.theme.ts', '--check').status).toBe(0);
  }, 240_000);

  it('a hand edit of the theme own output is named by the check, not blamed on the copy', async () => {
    await themeEditNew('e13', {cwd});
    fs.appendFileSync(path.join(cwd, 'themes/e13/e13.css'), '/* hand */\n');
    const out = compileJson('themes/e13/e13.theme.ts', '--check');
    expect(out.data.upToDate).toBe(false);
    expect(JSON.stringify(out.data.stale)).toContain('e13.css');
    expect(out.data.appCopyStale).toBeUndefined();
  }, 240_000);

  it('a stale copy keeps the documented check result shape', async () => {
    await themeEditNew('e12', {cwd});
    fs.writeFileSync(path.join(cwd, 'src/themes/e12/e12.css'), '/* old */\n');
    const out = compileJson('themes/e12/e12.theme.ts', '--check');
    expect(out.type).toBe('theme.build.check');
    expect(out.data.upToDate).toBe(false);
    expect(out.data.code).toBe('ERR_THEME_STALE');
    expect(out.data.appCopyStale).toContain(
      'src/themes/e12/e12.css is not the current build',
    );
    const text = compile('themes/e12/e12.theme.ts', '--check');
    expect(text.status).toBe(1);
    expect(text.stdout + text.stderr).not.toMatch(/\[ok\][^\n]*up to date/);
  }, 240_000);
});

describe('the copy is no compile target or --out', () => {
  it('its source and its folder are refused, naming the theme to compile', async () => {
    await themeEditNew('e4', {cwd});
    for (const target of ['src/themes/e4/e4Theme.ts', 'src/themes/e4']) {
      const r = compile(target, '--check');
      expect(r.status, target).not.toBe(0);
      expect(r.stdout + r.stderr, target).toContain("e4's app copy");
      expect(r.stdout + r.stderr, target).toContain('themes/e4/e4.theme.ts');
    }
  }, 240_000);

  it('an --out at the copy folder is refused, suggesting the compile without it', async () => {
    await themeEditNew('e8', {cwd});
    const before = read('src/themes/e8/e8.css');
    for (const out of [
      'src/themes/e8',
      'src/themes/e8/',
      'src/themes/E8/e8.css',
    ]) {
      const r = compile('themes/e8/e8.theme.ts', '--out', out);
      expect(r.status, out).not.toBe(0);
      expect(r.stdout + r.stderr, out).toContain("in e8's app copy");
    }
    const j = JSON.parse(
      cli([
        '--json',
        'experimental',
        'theme',
        'compile',
        'themes/e8/e8.theme.ts',
        '--out',
        'src/themes/e8/e8.css',
      ]).stdout,
    );
    expect(j.suggestions[0].name).toMatch(/compile themes\/e8\/e8\.theme\.ts$/);
    // Another theme's source into this copy, and a settings file given to
    // compile: refused, and the copy is not written either.
    await themeEditNew('e8b', {cwd});
    expect(
      compile('themes/e8b/e8b.theme.ts', '--out', 'src/themes/e8').status,
    ).not.toBe(0);
    expect(compile('themes/e8/e8.settings.json').status).not.toBe(0);
    expect(read('src/themes/e8/e8.css')).toBe(before);
  }, 240_000);
});

describe('the copy font stylesheet follows the fonts the theme loads', () => {
  it('a font package removed after the set leaves no broken import, by set, compile and check', async () => {
    await themeEditNew('e10', {cwd});
    await themeEditSet('e10', 'font', 'Inter', {cwd});
    // As if the package had been installed, then removed again.
    const sheet = path.join(cwd, 'src/themes/e10/e10.fonts.css');
    const head = read('src/themes/e10/e10.fonts.css').split('\n')[0];
    fs.writeFileSync(
      sheet,
      `${head}\n@import "@fontsource/inter/index.css";\n`,
    );
    expect(compile('themes/e10/e10.theme.ts', '--check').status).toBe(1);
    await themeEditSet('e10', 'font', 'Inter', {cwd});
    expect(read('src/themes/e10/e10.fonts.css')).not.toContain('@fontsource');
    fs.writeFileSync(
      sheet,
      `${head}\n@import "@fontsource/inter/index.css";\n`,
    );
    expect(compile('themes/e10/e10.theme.ts').status).toBe(0);
    expect(read('src/themes/e10/e10.fonts.css')).not.toContain('@fontsource');
    expect(compile('themes/e10/e10.theme.ts', '--check').status).toBe(0);
  }, 240_000);
});

describe('compile refusals from a subfolder and the font note', () => {
  it('the --out refusal from a subfolder suggests the compile from the app root, and that compile runs', async () => {
    await themeEditNew('s2', {cwd});
    const sub = path.join(cwd, 'src/app');
    fs.mkdirSync(sub, {recursive: true});
    const r = spawnSync(
      process.execPath,
      [
        BIN,
        '--json',
        'experimental',
        'theme',
        'compile',
        '../../themes/s2/s2.theme.ts',
        '--out',
        '../themes/s2/x.css',
      ],
      {cwd: sub, encoding: 'utf8'},
    );
    const way = JSON.parse(r.stdout).suggestions[0].name;
    expect(way).toMatch(
      /^cd \.\.\/\.\. && .*compile themes\/s2\/s2\.theme\.ts$/,
    );
    const cmd = way.replace(/^cd \.\.\/\.\. && /, '');
    expect(cli(cmd.slice(cmd.indexOf('experimental')).split(' ')).status).toBe(
      0,
    );
  }, 240_000);

  it('the font note follows the font file this compile writes, after an install and after an uninstall', async () => {
    await themeEditNew('s5', {cwd});
    await themeEditSet('s5', 'font', 'Inter', {cwd});
    const remove = installInter();
    try {
      const installed = compile('themes/s5/s5.theme.ts');
      expect(read('src/themes/s5/s5.fonts.css')).toContain('@fontsource/inter');
      expect(installed.stdout + installed.stderr).not.toMatch(
        /not loaded[^\n]*Inter/,
      );
    } finally {
      remove();
    }
    const removed = compile('themes/s5/s5.theme.ts');
    expect(read('src/themes/s5/s5.fonts.css')).not.toContain('@fontsource');
    expect(removed.stdout + removed.stderr).toMatch(/not loaded[^\n]*Inter/);
  }, 240_000);
});

describe('the app copy guard reads paths as the build does', () => {
  it('a backslash --out, and one through a link, into the copy are refused', async () => {
    await themeEditNew('b6', {cwd});
    await themeEditNew('b6o', {cwd});
    const before = read('src/themes/b6/b6.css');
    const back = compile(
      'themes/b6o/b6o.theme.ts',
      '--out',
      'src\\themes\\b6\\b6.css',
    );
    expect(back.status).not.toBe(0);
    expect(back.stdout + back.stderr).toContain("in b6's app copy");
    fs.symlinkSync(
      path.join(cwd, 'src/themes/b6'),
      path.join(cwd, 'b6-link'),
      'dir',
    );
    try {
      const link = compile(
        'themes/b6o/b6o.theme.ts',
        '--out',
        'b6-link/b6.css',
      );
      expect(link.status).not.toBe(0);
      expect(link.stdout + link.stderr).toContain("in b6's app copy");
    } finally {
      fs.rmSync(path.join(cwd, 'b6-link'));
    }
    expect(read('src/themes/b6/b6.css')).toBe(before);
  }, 240_000);

  it('a backslash copy source names the theme source, and a file of yours in the copy folder compiles', async () => {
    await themeEditNew('b7', {cwd});
    const r = cli([
      '--json',
      'experimental',
      'theme',
      'compile',
      'src\\themes\\b7\\b7Theme.ts',
    ]);
    expect(r.stdout).toContain('themes/b7/b7.theme.ts');
    expect(r.stdout).not.toContain('compile src/themes/b7/b7Theme.ts');
    fs.writeFileSync(
      path.join(cwd, 'src/themes/b7/mine.ts'),
      "import {defineTheme} from '@astryxdesign/core/theme';\nexport const mineTheme = defineTheme({name: 'mine'});\n",
    );
    const mine = compile('src/themes/b7/mine.ts', '--out', 'out-b7/mine.css');
    expect(mine.stdout + mine.stderr).not.toContain("part of b7's app copy");
  }, 240_000);

  it('with a file of yours in the way, the check names it and never sends you to show', async () => {
    await themeEditNew('b10', {cwd});
    fs.writeFileSync(path.join(cwd, 'src/themes/b10/b10Theme.ts'), '// mine\n');
    const out = compileJson('themes/b10/b10.theme.ts', '--check');
    expect(out.data.appCopyStale).toContain('b10Theme.ts is yours');
    expect(out.data.appCopyStale).not.toContain(
      'editor show b10 writes it again',
    );
  }, 240_000);

  it('the copy font file never claims the system has a font no package loads', async () => {
    await themeEditNew('b9', {cwd});
    await themeEditSet('b9', 'font', 'Lora', {cwd});
    expect(read('src/themes/b9/b9.fonts.css')).not.toContain(
      'the theme uses fonts the system has',
    );
  }, 240_000);
});

describe('compile help', () => {
  it('names the check result for a stale copy and the --out refusal', () => {
    const r = cli(['experimental', 'theme', 'compile', '--help']);
    expect(r.stdout).toContain('appCopyStale');
    expect(r.stdout).toContain('app copy folder');
  });
});

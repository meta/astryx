// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The editor agrees with the build on which theme a source defines;
 * font notes and previews follow the families the theme builds; --out
 * forms are checked before anything is written, and say what they leave
 * out; suggested commands run the same way in text and JSON.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {spawnSync} from 'node:child_process';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {themeEditNew, themeEditSet, themeEditShow} from './theme-edit.mjs';
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
  cwd = makeLinkedFixture('astryx-theme-hunt107-', FIXTURE_PACKAGES);
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
const compile = (/** @type {string[]} */ ...args) =>
  cli(['experimental', 'theme', 'compile', ...args]);
/** @param {string} slug @param {string} body */
const writeSource = (slug, body) =>
  fs.writeFileSync(
    path.join(cwd, `themes/${slug}/${slug}.theme.ts`),
    `import {defineTheme} from '@astryxdesign/core/theme';\nimport {${slug}Settings} from './${slug}.settings';\n${body}\n`,
  );

describe('the theme a source defines is the one the build loads', () => {
  it('a helper theme exported before the real one is refused by set, compile and --check, and nothing is written', async () => {
    await themeEditNew('w4', {cwd});
    const before = read('themes/w4/w4.css');
    writeSource(
      'w4',
      "export const a = defineTheme({extends: w4Settings, name: 'x'});\nexport const w4Theme = defineTheme({extends: w4Settings, name: 'w4'});",
    );
    await expect(themeEditSet('w4', 'corners', 'pill', {cwd})).rejects.toThrow(
      "no longer names the theme 'w4'",
    );
    for (const args of [[], ['--check']]) {
      const r = compile('themes/w4/w4.theme.ts', ...args);
      expect(r.status, args.join(' ')).not.toBe(0);
      expect(r.stdout + r.stderr).toContain("no longer names the theme 'w4'");
    }
    expect(fs.existsSync(path.join(cwd, 'themes/w4/x.css'))).toBe(false);
    expect(read('themes/w4/w4.css')).toBe(before);
  }, 240_000);

  it('a name given by a const, and a // inside a string, are read as the build reads them', async () => {
    await themeEditNew('w5', {cwd});
    writeSource(
      'w5',
      "const N = 'w5';\nexport const w5Theme = defineTheme({extends: w5Settings, name: N});",
    );
    expect(compile('themes/w5/w5.theme.ts').status).toBe(0);
    writeSource(
      'w5',
      "const note = 'see https://x.example'; export const w5Theme = defineTheme({extends: w5Settings, name: 'w5'});",
    );
    expect(compile('themes/w5/w5.theme.ts').status).toBe(0);
    await themeEditSet('w5', 'corners', 'pill', {cwd});
  }, 240_000);

  it('a theme that no longer extends its settings is still refused', async () => {
    await themeEditNew('w5b', {cwd});
    writeSource(
      'w5b',
      "export const w5bTheme = defineTheme({name: 'w5b', tokens: {}});\nvoid w5bSettings;",
    );
    const r = compile('themes/w5b/w5b.theme.ts');
    expect(r.status).not.toBe(0);
    expect(r.stdout + r.stderr).toContain('no longer extends w5bSettings');
  }, 240_000);
});

describe('fonts follow the families the theme builds', () => {
  it('a font setting the own source replaces everywhere gets no install note', async () => {
    await themeEditNew('w3', {cwd});
    await themeEditSet('w3', 'font', 'Inter', {cwd});
    writeSource(
      'w3',
      "export const w3Theme = defineTheme({extends: w3Settings, name: 'w3', typography: {body: {family: 'Figtree', fallbacks: 'sans-serif'}, heading: {family: 'Figtree', fallbacks: 'sans-serif'}}});",
    );
    expect(compile('themes/w3/w3.theme.ts').status).toBe(0);
    const shown = await themeEditShow('w3', {cwd});
    expect(JSON.stringify(shown)).not.toContain('Inter is not installed');
    expect(read('src/themes/w3/w3.fonts.css')).not.toContain('inter');
  }, 240_000);
});

describe('--out forms', () => {
  it('an --out in the theme own folder is refused before anything is written, the type stub included', async () => {
    await themeEditNew('w15', {cwd});
    const css = read('themes/w15/w15.css');
    const js = read('themes/w15/w15.js');
    const stub = read('themes/w15/w15.css.d.ts');
    for (const out of ['themes/w15/x.css', 'themes/w15/w15.css.d.ts']) {
      const r = compile('themes/w15/w15.theme.ts', '--out', out);
      expect(r.status, out).not.toBe(0);
      expect(r.stdout + r.stderr).toContain("in w15's own folder");
      expect(r.stdout + r.stderr).not.toContain('--out builds only');
    }
    expect(read('themes/w15/w15.css')).toBe(css);
    expect(read('themes/w15/w15.js')).toBe(js);
    expect(read('themes/w15/w15.css.d.ts')).toBe(stub);
    // Its default stylesheet is where the build writes anyway.
    expect(
      compile('themes/w15/w15.theme.ts', '--out', 'themes/w15/w15.css').status,
    ).toBe(0);
  }, 240_000);

  it('an --out elsewhere says the folder and the app copy were not written or checked, in text and JSON', async () => {
    await themeEditNew('w11', {cwd});
    const text = compile('themes/w11/w11.theme.ts', '--out', 'out-w11/');
    expect(text.status).toBe(0);
    expect(text.stdout + text.stderr).toContain(
      "themes/w11/ and w11's app copy in src/themes/w11/ were not written",
    );
    const json = JSON.parse(
      cli([
        '--json',
        'experimental',
        'theme',
        'compile',
        'themes/w11/w11.theme.ts',
        '--out',
        'out-w11/',
        '--check',
      ]).stdout,
    );
    expect(json.data.appCopySkipped).toContain('are not checked');
  }, 240_000);

  it('from above the app, an --out the root cannot reach is left off the pointer, which then runs', async () => {
    const outer = path.dirname(cwd);
    const app = path.basename(cwd);
    await themeEditNew('w8', {cwd});
    const r = cli(
      [
        '--json',
        'experimental',
        'theme',
        'compile',
        `${app}/themes/w8/w8.theme.ts`,
        '--out',
        'dist-w8/x.css',
      ],
      outer,
    );
    const env = JSON.parse(r.stdout);
    expect(env.error).toContain('outside the app root');
    const way = env.suggestions[0].name;
    expect(way).not.toContain('--out');
    const command = way.replace(/^cd [^&]+&& /, '');
    expect(
      cli(command.slice(command.indexOf('experimental')).split(' ')).status,
    ).toBe(0);
  }, 240_000);
});

describe('a family refusal from a subfolder', () => {
  it('--family without --family-key suggests a compile that runs', async () => {
    await themeEditNew('wf', {cwd});
    const sub = path.join(cwd, 'themes');
    const env = JSON.parse(
      cli(
        [
          '--json',
          'experimental',
          'theme',
          'compile',
          'wf/wf.theme.ts',
          '--family',
        ],
        sub,
      ).stdout,
    );
    const way = env.suggestions[0].name;
    expect(way).toMatch(/^cd \.\. && /);
    const command = way.replace(/^cd \.\. && /, '');
    expect(
      cli(command.slice(command.indexOf('experimental')).split(' ')).status,
    ).toBe(0);
  }, 240_000);
});

describe('suggested commands are bare in JSON', () => {
  it('the source-shape refusal and the damaged-settings refusal give bare commands in JSON', async () => {
    await themeEditNew('w12', {cwd});
    const settings = path.join(cwd, 'themes/w12/w12.settings.json');
    const kept = fs.readFileSync(settings, 'utf8');
    fs.writeFileSync(settings, '{bad');
    try {
      const env = JSON.parse(
        cli([
          '--json',
          'experimental',
          'theme',
          'compile',
          'themes/w12/w12.theme.ts',
        ]).stdout,
      );
      expect(env.suggestions[0].name).toMatch(
        /^astryx experimental theme editor /,
      );
    } finally {
      fs.writeFileSync(settings, kept);
    }
    writeSource('w12', "export const w12Theme = defineTheme({name: 'w12'});");
    const env = JSON.parse(
      cli([
        '--json',
        'experimental',
        'theme',
        'compile',
        'themes/w12/w12.theme.ts',
      ]).stdout,
    );
    expect(env.suggestions[0].name).toMatch(/^astryx /);
  }, 240_000);
});

describe('compile docs', () => {
  it('say what compiles, and what --out leaves out', () => {
    const doc = fs.readFileSync(
      path.resolve(
        import.meta.dirname,
        '../../clients/cli/commands/experimental-theme-compile.doc.mjs',
      ),
      'utf8',
    );
    expect(doc).not.toContain(
      'or its app copy src/themes/<theme>/<Theme>Theme.ts',
    );
    expect(doc).toContain('appCopySkipped');
  });
});

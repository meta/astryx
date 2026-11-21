// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Fonts the systems ship get no install line, and a package the
 * editor cannot vouch for never shares one; an import through a path alias
 * is never told as a package to install; typography fallbacks with no
 * family are refused; a quoted glob is expanded to the sources it matches;
 * and a weight the base font stylesheet does not load is named.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {themeEditNew, themeEditSet, themeEditShow} from './theme-edit.mjs';
import {fontsourceSuggestion} from './_settings.mjs';
import {missingThemePackage} from '../theme/build/build.mjs';
import {expandGlob} from '../../foundation/fs/glob.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {
  FIXTURE_PACKAGES,
  writeFixtureBaseTheme,
} from '../../test-utils/base-theme-fixture.mjs';
import {runCli} from '../../test-utils/run-cli.mjs';

// The assertions are about builds, notes and lines, not rendered pages: a
// render costs seconds, so the pages are written by the stand-in.
vi.mock('./_preview.mjs', async importOriginal =>
  (await import('../../test-utils/theme-render-stub.mjs')).stubRenders(
    /** @type {any} */ (await importOriginal()),
  ),
);

/** @type {string} */
let cwd;

beforeAll(() => {
  cwd = makeLinkedFixture(
    'astryx-theme-fonts-systems-ship-install-',
    FIXTURE_PACKAGES,
  );
  writeFixtureBaseTheme(cwd, 'neutral');
}, 120_000);

afterAll(() => {
  removeLinkedFixture(cwd);
});

/** @param {string[]} args */
const cli = async args => {
  const r = await runCli(args, {cwd});
  return {status: r.status, stdout: r.stdout, stderr: r.stderr};
};
/** @param {string} slug @param {string} body @param {string} [imports] */
const writeSource = (slug, body, imports = '') =>
  fs.writeFileSync(
    path.join(cwd, `themes/${slug}/${slug}.theme.ts`),
    `import {defineTheme} from '@astryxdesign/core/theme';\nimport {${slug}Settings} from './${slug}.settings';\n${imports}\n${body}\n`,
  );

describe('install lines for fonts', () => {
  it('names none for a font a system ships, on any platform', async () => {
    for (const family of [
      'Avenir Next',
      'Optima',
      'Futura',
      'Geneva',
      'Iowan Old Style',
      'Hoefler Text',
      'Candara',
      'Corbel',
      'Constantia',
      'Bahnschrift',
      'Segoe UI Variable',
    ])
      expect(fontsourceSuggestion(family), family).toBe(null);
  });

  it('vouches for an open font only, and keeps Roboto, which a system ships too', async () => {
    expect(fontsourceSuggestion('Inter')).toEqual({
      pkg: '@fontsource/inter',
      known: true,
    });
    expect(fontsourceSuggestion('Roboto')?.known).toBe(true);
    expect(fontsourceSuggestion('Playfair Display')).toEqual({
      pkg: '@fontsource/playfair-display',
      known: false,
    });
  });

  it("compile's full help puts a name it cannot vouch for on its own line", async () => {
    await themeEditNew('w3', {cwd});
    await themeEditSet('w3', 'font', 'Playfair Display, Inter, serif', {cwd});
    writeSource(
      'w3',
      "export const w3Theme = defineTheme({extends: w3Settings, name: 'w3', tokens: {'--font-family-heading': 'Bungee, Avenir Next, sans-serif'}});",
    );
    const full = (
      await cli([
        'experimental',
        'theme',
        'compile',
        'themes/w3/w3.theme.ts',
        '--detail',
        'full',
      ])
    ).stdout;
    const lines = full
      .split('\n')
      .filter(l =>
        /(npm install|pnpm add|yarn add|bun add) @fontsource/.test(l),
      );
    for (const line of lines)
      expect(line.match(/@fontsource\S*/g)?.length, line).toBe(1);
    expect(full).not.toContain('avenir');
  }, 240_000);
});

describe('an import through a path alias', () => {
  it('names no package', async () => {
    for (const s of ['@/lib/c', '~/lib/c', '#lib/c'])
      expect(
        missingThemePackage(new Error(`Cannot find module '${s}'`)),
        s,
      ).toBe(null);
    expect(
      missingThemePackage(new Error("Cannot find module '@scope/pkg/x'")),
    ).toBe('@scope/pkg');
  });

  it('is told as an alias the loader does not map, with no install line', async () => {
    await themeEditNew('w4', {cwd});
    writeSource(
      'w4',
      "export const w4Theme = defineTheme({extends: w4Settings, name: 'w4', tokens: {'--radius-element': c}});",
      "import {c} from '@/lib/c';",
    );
    const r = await cli([
      '--json',
      'experimental',
      'theme',
      'compile',
      'themes/w4/w4.theme.ts',
    ]);
    const env = JSON.parse(r.stdout);
    expect(env.error).toContain('names no package');
    expect(JSON.stringify(env.suggestions)).not.toMatch(/install @(\s|")/);
  }, 240_000);
});

describe('typography fallbacks', () => {
  it('with no family in that role are refused', async () => {
    await themeEditNew('w6', {cwd});
    writeSource(
      'w6',
      "export const w6Theme = defineTheme({extends: w6Settings, name: 'w6', typography: {body: {fallbacks: 'Georgia, serif'}}});",
    );
    const r = await cli([
      'experimental',
      'theme',
      'compile',
      'themes/w6/w6.theme.ts',
    ]);
    expect(r.status).not.toBe(0);
    expect(r.stdout + r.stderr).toContain(
      'typography.body.fallbacks builds nothing without typography.body.family',
    );
  }, 240_000);
});

describe('a quoted glob', () => {
  it('is expanded as the shell would', async () => {
    const dir = path.join(cwd, 'globbed');
    fs.mkdirSync(path.join(dir, 'a'), {recursive: true});
    fs.writeFileSync(path.join(dir, 'a', 'x.ts'), '');
    fs.writeFileSync(path.join(dir, 'a', 'y.css'), '');
    expect(expandGlob('globbed/*/*.ts', cwd)).toEqual(['globbed/a/x.ts']);
    expect(expandGlob('globbed/**/*.{ts,css}', cwd)).toEqual([
      'globbed/a/x.ts',
      'globbed/a/y.css',
    ]);
  });

  it('suggests the theme sources it matches, and none when it matches none', async () => {
    await themeEditNew('w9', {cwd});
    const env = JSON.parse(
      (
        await cli([
          '--json',
          'experimental',
          'theme',
          'compile',
          'themes/w9/*.ts',
        ])
      ).stdout,
    );
    const names = env.suggestions.map((/** @type {any} */ s) => s.name);
    expect(names.join(' ')).toContain('compile themes/w9/w9.theme.ts');
    expect(names.join(' ')).not.toContain('*');
    const none = JSON.parse(
      (
        await cli([
          '--json',
          'experimental',
          'theme',
          'compile',
          'nowhere/*.ts',
        ])
      ).stdout,
    );
    expect(
      (none.suggestions ?? []).map((/** @type {any} */ s) => s.name).join(' '),
    ).not.toContain('nowhere/*.ts');
  }, 240_000);
});

describe("the base theme's font stylesheet", () => {
  it('names a weight it does not load, in show and compile', async () => {
    // The base ships a font stylesheet that loads Figtree at 400-700, as
    // neutral's does.
    const pkg = path.join(
      path.dirname(cwd),
      'node_modules/@astryxdesign/theme-neutral',
    );
    const meta = JSON.parse(
      fs.readFileSync(path.join(pkg, 'package.json'), 'utf8'),
    );
    meta.exports['./fonts.css'] = './fonts.css';
    fs.writeFileSync(path.join(pkg, 'package.json'), JSON.stringify(meta));
    fs.writeFileSync(
      path.join(pkg, 'fonts.css'),
      "@import url('https://fonts.googleapis.com/css2?family=Figtree:wght@400;500;600;700&display=swap');\n",
    );
    await themeEditNew('w10', {cwd, like: 'neutral'});
    await themeEditSet('w10', 'font', 'Figtree, sans-serif', {cwd});
    await themeEditSet('w10', '--font-weight-bold', '800', {cwd});
    const shown = await themeEditShow('w10', {cwd});
    expect(JSON.stringify(shown.data.notes)).toContain('800 shows as 700');
    const json = JSON.parse(
      (
        await cli([
          '--json',
          'experimental',
          'theme',
          'compile',
          'themes/w10/w10.theme.ts',
        ])
      ).stdout,
    );
    expect(JSON.stringify(json.data.notices)).toContain('800 shows as 700');
  }, 240_000);
});

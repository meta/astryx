// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The thirty-ninth pass over `astryx experimental theme editor`: the
 * tokens a theme's own source sets are read from what the build made of
 * it, so any way of writing the file counts, the base theme's values are
 * never the source's, and the palette and exact tokens follow them.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {themeEditNew, themeEditSet, themeEditShow} from './theme-edit.mjs';
import {ownSourceTokens} from './_settings.mjs';
import {refusal} from '../../test-utils/theme-edit-fixture.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {
  FIXTURE_PACKAGES,
  writeFixtureBaseTheme,
} from '../../test-utils/base-theme-fixture.mjs';

vi.mock('./_preview.mjs', async importOriginal =>
  (await import('../../test-utils/theme-render-stub.mjs')).stubRenders(
    await importOriginal(),
  ),
);

/** @type {string} */
let cwd;

beforeAll(() => {
  cwd = makeLinkedFixture('astryx-theme-hunt39-', FIXTURE_PACKAGES);
  writeFixtureBaseTheme(cwd, 'neutral');
});

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

/** @param {string} slug @param {string} body */
const source = (slug, body) =>
  fs.writeFileSync(path.join(cwd, `themes/${slug}/${slug}.theme.ts`), body);

const LOOP = "'--radius-container': 'var(--radius-page)'";
/** @type {Record<string, (slug: string) => string>} */
const SHAPES = {
  namespace: slug =>
    `import * as T from '@astryxdesign/core/theme';\nimport {${slug}Settings} from './${slug}.settings';\nexport const ${slug}Theme = T.defineTheme({extends: ${slug}Settings, name: '${slug}', tokens: {${LOOP}}});\n`,
  renamed: slug =>
    `import {defineTheme as dt} from '@astryxdesign/core/theme';\nimport {${slug}Settings} from './${slug}.settings';\nexport const ${slug}Theme = dt({extends: ${slug}Settings, name: '${slug}', tokens: {${LOOP}}});\n`,
  template: slug =>
    `import {defineTheme} from '@astryxdesign/core/theme';\nimport {${slug}Settings} from './${slug}.settings';\nconst P = '--radius-page';\nexport const ${slug}Theme = defineTheme({extends: ${slug}Settings, name: '${slug}', tokens: {'--radius-container': \`var(\${P})\`}});\n`,
  shadowed: slug =>
    `import {defineTheme} from '@astryxdesign/core/theme';\nimport {${slug}Settings} from './${slug}.settings';\nconst mine = {${LOOP}};\nexport function kiosk() { const mine = {}; return mine; }\nexport const ${slug}Theme = defineTheme({extends: ${slug}Settings, name: '${slug}', tokens: mine});\n`,
  'spread config': slug =>
    `import {defineTheme} from '@astryxdesign/core/theme';\nimport {${slug}Settings} from './${slug}.settings';\nconst shared = {tokens: {${LOOP}}};\nexport const ${slug}Theme = defineTheme({extends: ${slug}Settings, name: '${slug}', ...shared});\n`,
};

describe('hunt39: the built definition as truth', () => {
  it.each(Object.keys(SHAPES))(
    'refuses a loop through tokens written as %s',
    async shape => {
      const slug = `s${Object.keys(SHAPES).indexOf(shape)}`;
      await themeEditNew(slug, {cwd});
      source(slug, SHAPES[shape](slug));
      await themeEditShow(slug, {cwd});
      expect(ownSourceTokens(cwd, slug)).toEqual(['--radius-container']);
      const r = await refusal(() =>
        themeEditSet(slug, '--radius-page', 'var(--radius-container)', {cwd}),
      );
      expect(r.code).toBe('ERR_THEME_BAD_VALUE');
    },
    240_000,
  );

  it('with no build of the source yet, the build after set refuses the loop and puts the files back', async () => {
    await themeEditNew('nb', {cwd});
    source('nb', SHAPES.namespace('nb'));
    const settings = path.join(cwd, 'themes/nb/nb.settings.json');
    const before = fs.readFileSync(settings, 'utf8');
    const r = await refusal(() =>
      themeEditSet('nb', '--radius-page', 'var(--radius-container)', {cwd}),
    );
    expect(r.code).toBe('ERR_THEME_BAD_VALUE');
    expect(r.message).toMatch(/read each other/);
    expect(fs.readFileSync(settings, 'utf8')).toBe(before);
  }, 240_000);

  it('R19-B: a computed key never makes the base theme tokens the source own', async () => {
    await themeEditNew('cb', {cwd, like: 'neutral'});
    source(
      'cb',
      "import {defineTheme} from '@astryxdesign/core/theme';\nimport {cbSettings} from './cb.settings';\nconst K = '--radius-element';\nexport const cbTheme = defineTheme({extends: cbSettings, name: 'cb', tokens: {[K]: '3px'}});\n",
    );
    await themeEditShow('cb', {cwd});
    expect(ownSourceTokens(cwd, 'cb')).toEqual(['--radius-element']);
  }, 240_000);

  it('N38: an accent the own source sets is the fill the palette reads', async () => {
    await themeEditNew('ac', {cwd});
    source(
      'ac',
      "import {defineTheme} from '@astryxdesign/core/theme';\nimport {acSettings} from './ac.settings';\nexport const acTheme = defineTheme({extends: acSettings, name: 'ac', tokens: {'--color-accent': '#ffce2f'}});\n",
    );
    const r = await themeEditSet('ac', 'accent', '#2563eb', {cwd});
    const css = fs.readFileSync(path.join(cwd, 'themes/ac/ac.css'), 'utf8');
    expect(css).toMatch(/--color-on-accent: light-dark\(#000000, #000000\)/);
    expect(r.data.notes.join('\n')).toMatch(
      /--color-accent uses the value ac\.theme\.ts sets/,
    );
  }, 240_000);

  it('N39: an exact token the own source also sets says the file wins', async () => {
    await themeEditNew('ex', {cwd});
    source(
      'ex',
      "import {defineTheme} from '@astryxdesign/core/theme';\nimport {exSettings} from './ex.settings';\nexport const exTheme = defineTheme({extends: exSettings, name: 'ex', tokens: {'--radius-element': '2px'}});\n",
    );
    const r = await themeEditSet('ex', '--radius-element', '12px', {cwd});
    const notes = r.data.notes.join('\n');
    expect(notes).toMatch(/ex\.theme\.ts sets --radius-element itself \(2px\)/);
    expect(notes).not.toMatch(/already shows/);
  }, 240_000);

  it('R19-A: the base theme values close a loop, and its part rules read tokens', async () => {
    const pkg = path.join(
      path.dirname(cwd),
      'node_modules',
      '@astryxdesign',
      'theme-stone',
    );
    fs.mkdirSync(pkg, {recursive: true});
    fs.writeFileSync(
      path.join(pkg, 'package.json'),
      JSON.stringify({
        name: '@astryxdesign/theme-stone',
        version: '0.0.0',
        type: 'module',
        exports: {'./built': './built.js'},
      }),
    );
    fs.writeFileSync(
      path.join(pkg, 'built.js'),
      `export const stoneTheme = ${JSON.stringify({
        name: 'stone',
        tokens: {
          '--color-syntax-added-marker': 'var(--color-syntax-punctuation)',
        },
        components: {
          'progress-bar': {
            base: {
              '--color-background-muted': 'var(--color-border-emphasized)',
            },
          },
        },
      })};\n`,
    );
    await themeEditNew('st', {cwd, like: 'stone'});
    const loop = await refusal(() =>
      themeEditSet(
        'st',
        '--color-syntax-punctuation',
        'var(--color-syntax-added-marker)',
        {cwd},
      ),
    );
    expect(loop.message).toMatch(/would read itself/);
    const read = await themeEditSet('st', '--color-border-emphasized', 'red', {
      cwd,
      on: 'progress-bar',
    });
    expect(read.type).toBe('themeEdit.set');
  }, 240_000);
});

// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The forty-fourth pass over `astryx experimental theme editor`: the
 * theme's own source wins in a part's state and variant rules, on every
 * part a dial or group reaches, after an undo, in show, and on phones.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {
  themeEditNew,
  themeEditSet,
  themeEditShow,
  themeEditUndo,
} from './theme-edit.mjs';
import {refusal} from '../../test-utils/theme-edit-fixture.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {FIXTURE_PACKAGES} from '../../test-utils/base-theme-fixture.mjs';

vi.mock('./_preview.mjs', async importOriginal =>
  (await import('../../test-utils/theme-render-stub.mjs')).stubRenders(
    await importOriginal(),
  ),
);

/** @type {string} */
let cwd;

beforeAll(() => {
  cwd = makeLinkedFixture('astryx-theme-hunt44-', FIXTURE_PACKAGES);
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
      tokens: {},
      components: {
        'progress-bar': {
          base: {'--color-background-muted': 'var(--color-border-emphasized)'},
        },
      },
    })};\n`,
  );
});

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

/** @param {string} slug @param {string} extra */
const source = (slug, extra) =>
  fs.writeFileSync(
    path.join(cwd, `themes/${slug}/${slug}.theme.ts`),
    `import {defineTheme} from '@astryxdesign/core/theme';\nimport {${slug}Settings} from './${slug}.settings';\nexport const ${slug}Theme = defineTheme({extends: ${slug}Settings, name: '${slug}', ${extra}});\n`,
  );
/** @param {any} r */
const notes = r => (r.data.notes ?? []).join('\n');
/** @param {string} slug */
const css = slug =>
  fs.readFileSync(path.join(cwd, `themes/${slug}/${slug}.css`), 'utf8');

describe('hunt44', () => {
  it.each([[{state: 'hover'}], [{when: 'variant:accent'}]])(
    'N1: a part loop through the base part rule is refused under %o',
    async scope => {
      const slug = scope.state ? 'lh' : 'lv';
      await themeEditNew(slug, {cwd, like: 'stone'});
      const r = await refusal(() =>
        themeEditSet(
          slug,
          '--color-border-emphasized',
          'var(--color-background-muted)',
          {cwd, on: 'progress-bar', ...scope},
        ),
      );
      expect(r.code).toBe('ERR_THEME_BAD_VALUE');
    },
    240_000,
  );

  it('N2: undo of a part setting the own source also sets names the file', async () => {
    await themeEditNew('ud', {cwd});
    source('ud', "components: {card: {base: {borderRadius: '0px'}}}");
    await themeEditShow('ud', {cwd});
    await themeEditSet('ud', 'border-radius', '14px', {cwd, on: 'card'});
    const r = await themeEditUndo('ud', {
      cwd,
      thing: 'border-radius',
      on: 'card',
    });
    expect(/** @type {any} */ (r.data).now).toMatch(
      /border-radius = 0px on card \(set in ud\.theme\.ts\)/,
    );
  }, 240_000);

  it('N5: a part dial, a group and a variant scope name the own source', async () => {
    await themeEditNew('dg', {cwd});
    source(
      'dg',
      "components: {card: {base: {borderRadius: '0px'}}, button: {'variant:primary': {backgroundColor: 'red'}}}",
    );
    await themeEditShow('dg', {cwd});
    const dial = await themeEditSet('dg', 'corners', 'pill', {cwd, on: 'card'});
    expect(notes(dial)).toMatch(
      /dg\.theme\.ts sets border-radius on card itself \(0px\).*change it in dg\.theme\.ts$/m,
    );
    expect(notes(dial)).not.toMatch(/take this back/);
    const group = await themeEditSet('dg', 'border-radius', '14px', {
      cwd,
      on: 'containers',
    });
    expect(notes(group)).toMatch(/sets border-radius on card itself \(0px\)/);
    const variant = await themeEditSet('dg', 'background-color', 'blue', {
      cwd,
      on: 'button',
      when: 'variant:primary',
    });
    expect(notes(variant)).toMatch(
      /sets background-color on button when variant:primary itself \(red\)/,
    );
  }, 240_000);

  it('F18-N4 show half: show names settings the own source sets itself', async () => {
    await themeEditNew('sh', {cwd});
    await themeEditSet('sh', 'border-radius', '14px', {cwd, on: 'card'});
    await themeEditSet('sh', '--radius-page', '3rem', {cwd});
    source(
      'sh',
      "tokens: {'--radius-page': '9px'}, components: {card: {base: {borderRadius: '0px'}}}",
    );
    const r = await themeEditShow('sh', {cwd});
    const n = notes(r);
    expect(n).toMatch(/border-radius = 14px on card: sh\.theme\.ts sets/);
    expect(n).toMatch(
      /--radius-page = 3rem \(whole theme\): sh\.theme\.ts sets/,
    );
  }, 240_000);

  it('N3/N4: the phone rule repeats exact font settings only, never the file', async () => {
    await themeEditNew('ph', {cwd});
    source(
      'ph',
      "tokens: {'--font-family-heading': 'Georgia, serif', '--font-family-body': 'Courier, monospace'}",
    );
    await themeEditShow('ph', {cwd});
    const r = await themeEditSet('ph', '--font-family-body', 'Verdana', {cwd});
    const phone =
      css('ph')
        .split(/@media[^{]*pointer: coarse[^{]*\{/)
        .pop() ?? '';
    expect(phone).toMatch(/--font-family-body: Verdana/);
    expect(phone).not.toMatch(/Georgia/);
    expect(notes(r)).toMatch(
      /on phones \(touch screens below 1024px\) this setting shows/,
    );
  }, 240_000);

  it('R21-A: taking a token out of the file names the exact setting it then shows', async () => {
    await themeEditNew('ra', {cwd});
    await themeEditSet('ra', '--radius-page', '40px', {cwd});
    source('ra', "tokens: {'--radius-page': '9px'}");
    await themeEditShow('ra', {cwd});
    const r = await themeEditSet('ra', 'corners', 'round', {cwd});
    expect(notes(r)).toMatch(
      /taking it out of ra\.theme\.ts shows your exact --radius-page = 40px.*undo ra --radius-page` lets corners set it/,
    );
  }, 240_000);

  it('R21-B: after compile of an edited source, show reads the build as current', async () => {
    const {themeBuild} = await import('../theme/build/build.mjs');
    await themeEditNew('rb', {cwd});
    for (const value of ['9px', 'Georgia, serif']) {
      source(
        'rb',
        value.endsWith('px')
          ? `tokens: {'--radius-page': '${value}'}`
          : `tokens: {'--font-family-body': '${value}'}`,
      );
      await themeBuild('themes/rb/rb.theme.ts', {}, {cwd});
      const check = await themeBuild(
        'themes/rb/rb.theme.ts',
        {check: true},
        {cwd},
      );
      expect(/** @type {any} */ (check).data.upToDate).toBe(true);
      const shown = await themeEditShow('rb', {cwd});
      expect(notes(shown)).not.toMatch(/not current/);
    }
    // An edit not compiled since is still built again.
    source('rb', "tokens: {'--radius-page': '11px'}");
    const again = await themeEditShow('rb', {cwd});
    expect(notes(again)).toMatch(/not current/);
  }, 240_000);
});

// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The forty-second pass over `astryx experimental theme editor`: what
 * the theme's own source sets is never confused with what the settings make
 * (typography dials), the own source comes first in every note, a loop
 * inside one part is caught through the base theme's and the own source's
 * part rules, and undo counts only steps it can go back to.
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
  cwd = makeLinkedFixture('astryx-theme-hunt42-', FIXTURE_PACKAGES);
  // A base theme whose own part rule reads a token.
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

describe('hunt42', () => {
  it.each([
    ['font', 'georgia', {}],
    ['text-size', '20', {}],
    ['type', 'display', {}],
    ['font', 'georgia', {on: 'heading'}],
  ])(
    'N42: %s %s on a fresh theme names no own-source token',
    async (thing, value, flags) => {
      const slug = `f${thing.replace(/-/g, '')}${flags.on ? 'h' : ''}`;
      await themeEditNew(slug, {cwd});
      const r = await themeEditSet(slug, thing, value, {cwd, ...flags});
      expect(notes(r)).not.toMatch(/theme\.ts sets/);
      const shown = await themeEditShow(slug, {cwd});
      expect(JSON.stringify(shown.data)).not.toMatch(/theme\.ts sets/);
    },
    240_000,
  );

  it('N41: a palette token the own source sets gets no shade note', async () => {
    await themeEditNew('pa', {cwd});
    source('pa', "tokens: {'--color-text-accent': '#888888'}");
    const r = await themeEditSet('pa', 'accent', '#2563eb', {cwd});
    expect(notes(r)).toMatch(/pa\.theme\.ts sets --color-text-accent itself/);
    expect(notes(r)).not.toMatch(/^- ?--color-text-accent uses shade/m);
    expect(r.data.notes.some(n => /^--color-text-accent uses/.test(n))).toBe(
      false,
    );
  }, 240_000);

  it('N39 tail: own source > exact > dial in the notes and after undo', async () => {
    await themeEditNew('or', {cwd});
    await themeEditSet('or', '--radius-element', '12px', {cwd});
    source('or', "tokens: {'--radius-element': '2px'}");
    await themeEditShow('or', {cwd});
    const dial = await themeEditSet('or', 'corners', 'round', {cwd});
    expect(notes(dial)).toMatch(/or\.theme\.ts sets --radius-element itself/);
    expect(notes(dial)).not.toMatch(/keeps your exact --radius-element/);
    const undo = await themeEditUndo('or', {cwd, thing: '--radius-element'});
    expect(/** @type {any} */ (undo.data).now).toMatch(
      /--radius-element = 2px \(set in or\.theme\.ts\)/,
    );
  }, 240_000);

  it('F18-N3: a loop inside one part closes through the base theme part rule', async () => {
    await themeEditNew('bl', {cwd, like: 'stone'});
    const r = await refusal(() =>
      themeEditSet(
        'bl',
        '--color-border-emphasized',
        'var(--color-background-muted)',
        {cwd, on: 'progress-bar'},
      ),
    );
    expect(r.code).toBe('ERR_THEME_BAD_VALUE');
  }, 240_000);

  it('F18-N3: and through the own source part rule', async () => {
    await themeEditNew('ol', {cwd});
    source(
      'ol',
      "components: {card: {base: {'--radius-element': 'var(--radius-container)'}}}",
    );
    await themeEditShow('ol', {cwd});
    const r = await refusal(() =>
      themeEditSet('ol', '--radius-container', 'var(--radius-element)', {
        cwd,
        on: 'card',
      }),
    );
    expect(r.code).toBe('ERR_THEME_BAD_VALUE');
  }, 240_000);

  it('F18-N4: a part setting the own source also sets on that part says so', async () => {
    await themeEditNew('op', {cwd});
    source(
      'op',
      "components: {card: {base: {borderRadius: '0px', '--radius-element': '2px'}}}",
    );
    await themeEditShow('op', {cwd});
    const prop = await themeEditSet('op', 'border-radius', '14px', {
      cwd,
      on: 'card',
    });
    expect(notes(prop)).toMatch(
      /op\.theme\.ts sets border-radius on card itself \(0px\).*undo op border-radius --on card/,
    );
    const token = await themeEditSet('op', '--radius-element', '6px', {
      cwd,
      on: 'card',
    });
    expect(notes(token)).toMatch(
      /sets --radius-element on card itself \(2px\)/,
    );
  }, 240_000);

  it('F18-N1: undo counts only steps it can still go back to', async () => {
    await themeEditNew('un', {cwd});
    await themeEditSet('un', '--radius-page', 'var(--radius-container)', {cwd});
    await themeEditSet('un', '--radius-page', '3rem', {cwd});
    fs.writeFileSync(
      path.join(cwd, 'themes/un/un.theme.ts'),
      "import * as T from '@astryxdesign/core/theme';\nimport {unSettings} from './un.settings';\nexport const unTheme = T.defineTheme({extends: unSettings, name: 'un', tokens: {'--radius-container': 'var(--radius-page)'}});\n",
    );
    await themeEditShow('un', {cwd});
    const r = await themeEditUndo('un', {cwd});
    const left = /** @type {any} */ (r.data).stepsLeft;
    if (left === 0)
      expect((await refusal(() => themeEditUndo('un', {cwd}))).message).toMatch(
        /Nothing to undo/,
      );
    else await themeEditUndo('un', {cwd});
  }, 240_000);
});

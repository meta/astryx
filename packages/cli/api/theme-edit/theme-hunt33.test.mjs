// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The thirty-third pass over `astryx experimental theme editor`: a
 * token the own source sets only in a scope is not page-wide, and a page
 * with text after its render stamp is rendered again.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {themeEditNew, themeEditSet, themeEditShow} from './theme-edit.mjs';
import {ownSourceTokenValues, ownSourceTokens} from './_settings.mjs';
import {withRealRenders} from '../../test-utils/theme-render-stub.mjs';
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
  cwd = makeLinkedFixture('astryx-theme-hunt33-', FIXTURE_PACKAGES);
});

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

/** @param {string} slug @param {string} file */
const at = (slug, file) => path.join(cwd, 'themes', slug, file);

/** @param {string} slug @param {string} add */
const addToSource = (slug, add) => {
  const ts = at(slug, `${slug}.theme.ts`);
  fs.writeFileSync(
    ts,
    fs
      .readFileSync(ts, 'utf8')
      .replace('defineTheme({', `defineTheme({\n${add}`),
  );
};

describe('hunt33', () => {
  it('N1: tokens set only in onDark or components are not page-wide', async () => {
    await themeEditNew('d', {cwd});
    addToSource(
      'd',
      "  onDark: {tokens: {'--color-accent': '#90CAF9'}},\n  components: {button: {base: {'--radius-container': 'var(--radius-page)'}}},\n  tokens: {'--radius-element': '6px'},",
    );
    expect(ownSourceTokens(cwd, 'd')).toEqual(['--radius-element']);
    expect(ownSourceTokenValues(cwd, 'd')).toEqual({'--radius-element': '6px'});
    // The accent dial is not masked by the onDark-only token.
    const set = await themeEditSet('d', 'accent', '#7c3aed', {cwd});
    expect(JSON.stringify(set.data)).not.toMatch(
      /theme\.ts sets --color-accent/,
    );
  }, 240_000);

  it('N1: a value set only in onDark closes no loop', async () => {
    await themeEditNew('l', {cwd});
    addToSource(
      'l',
      "  onDark: {tokens: {'--radius-container': 'var(--radius-page)'}},",
    );
    const r = await themeEditSet(
      'l',
      '--radius-page',
      'var(--radius-container)',
      {
        cwd,
      },
    );
    expect(r.type).toBe('themeEdit.set');
  }, 240_000);

  it('N27: a value set in a part style closes no loop and masks no dial', async () => {
    await themeEditNew('ps', {cwd});
    addToSource(
      'ps',
      "  components: {button: {base: {'--radius-container': 'var(--radius-page)', '--color-accent': '#90CAF9'}}},",
    );
    expect(ownSourceTokens(cwd, 'ps')).toEqual([]);
    const loop = await themeEditSet(
      'ps',
      '--radius-page',
      'var(--radius-container)',
      {cwd},
    );
    expect(loop.type).toBe('themeEdit.set');
    const accent = await themeEditSet('ps', 'accent', '#7c3aed', {cwd});
    expect(JSON.stringify(accent.data)).not.toMatch(
      /theme\.ts sets --color-accent/,
    );
  }, 240_000);

  it('N2: text after the render stamp is rendered over', async () => {
    await themeEditNew('p', {cwd});
    await withRealRenders(async () => {
      await themeEditShow('p', {cwd});
      for (const file of ['preview.html', 'sheet.html'])
        fs.appendFileSync(at('p', file), '<p>added after</p>\n');
      await themeEditShow('p', {cwd});
      for (const file of ['preview.html', 'sheet.html'])
        expect(fs.readFileSync(at('p', file), 'utf8'), file).not.toMatch(
          /added after/,
        );
    });
  }, 480_000);
});

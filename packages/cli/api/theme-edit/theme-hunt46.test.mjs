// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The forty-sixth pass over `astryx experimental theme editor`: a font
 * file or link is never a family, a value pasted with its property name is
 * offered as the value given, a size suggestion is the token's own, and a
 * token typed with a colon is offered without it.
 */

import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {themeEditNew, themeEditSet} from './theme-edit.mjs';
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

beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-hunt46-', FIXTURE_PACKAGES);
  await themeEditNew('b', {cwd});
}, 240_000);

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

/** @param {() => Promise<unknown>} run */
async function refusal(run) {
  try {
    await run();
  } catch (error) {
    return /** @type {any} */ (error);
  }
  throw new Error('expected a refusal');
}

const names = (/** @type {any} */ e) =>
  (e.suggestions ?? []).map((/** @type {any} */ x) => x.name);

describe('N48: a font file or link', () => {
  it.each([
    ['font', './fonts/My.woff2'],
    ['font', 'Inter.woff2'],
    ['font', 'https://fonts.googleapis.com/css2?family=Inter'],
    ['--font-family-body', './fonts/My.woff2'],
    ['--font-family-body', 'url(./My.woff2)'],
  ])('%s %s is refused, never quoted as a name', async (thing, value) => {
    const err = await refusal(() => themeEditSet('b', thing, value, {cwd}));
    expect(err.code).toBe('ERR_THEME_BAD_VALUE');
    expect(err.message).toContain('not a font family name');
    expect(err.message).toContain('@font-face');
    expect(names(err).join('\n')).not.toContain('woff2');
  });
});

describe('N45: a value pasted with its property name', () => {
  it.each([
    ['--font-weight-bold', 'font-weight: 700', '700'],
    ['--text-body-size', 'font-size: 18px', '18px'],
  ])('%s %j is offered as %s', async (thing, value, want) => {
    const err = await refusal(() => themeEditSet('b', thing, value, {cwd}));
    expect(names(err)[0]).toMatch(
      new RegExp(` set b ${thing} '?${want.replace(/[()#]/g, '\\$&')}'?$`),
    );
  });
});

describe('N45: the accent dial', () => {
  it('a color pasted with its property name is the color (one path for every dial)', async () => {
    await themeEditSet('b', 'accent', 'color: #e11d48;', {cwd});
  }, 240_000);

  it.each([
    ['var(--brand, #e11d48)', '#e11d48'],
    ['light-dark(#e11d48, #fb7185)', '#e11d48'],
  ])('%j is offered as %s', async (value, want) => {
    const err = await refusal(() => themeEditSet('b', 'accent', value, {cwd}));
    expect(names(err)[0]).toMatch(new RegExp(` set b accent '?${want}'?$`));
  });
});

describe('N46: a size suggestion', () => {
  it('is the text size token’s own, never 6px', async () => {
    const err = await refusal(() =>
      themeEditSet('b', '--text-body-size', 'big', {cwd}),
    );
    expect(names(err)[0]).not.toMatch(/ 6px$/);
  });
});

describe('N47: a token typed with its colon', () => {
  it('is that token (hunt51: read before any check)', async () => {
    await themeEditSet('b', '--color-accent:', '#e11d48', {cwd});
  }, 240_000);
});

describe('R21-C: a font property pasted with no value', () => {
  it('is refused, and no suggestion names a family with a colon', async () => {
    const err = await refusal(() =>
      themeEditSet('b', 'font', 'font-family: ;', {cwd}),
    );
    expect(err.code).toBe('ERR_MISSING_ARGUMENT');
    expect(names(err).join('\n')).not.toMatch(/font-family:/);
    const colon = await refusal(() =>
      themeEditSet('b', 'font', 'font-family:', {cwd}),
    );
    expect(names(colon).join('\n')).not.toMatch(/font 'font-family:'/);
    const named = await refusal(() =>
      themeEditSet('b', 'font', 'Brand: Sans', {cwd}),
    );
    expect(named.message).toContain('holds a colon');
  });
});

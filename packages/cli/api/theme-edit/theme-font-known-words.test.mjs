// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The font dial: a word the editor knows as itself (Inter Tight) is
 * no weight typo; a misspelled style word is answered as the exact words
 * are; any weight number after a known family is a weight (Inter 650,
 * Inter 6OO); and a value holding NaN or undefined is refused at set.
 */

import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {themeEditNew, themeEditSet} from './theme-edit.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {
  FIXTURE_PACKAGES,
  writeFixtureBaseTheme,
} from '../../test-utils/base-theme-fixture.mjs';

// The assertions are about settings, notes and lines, not rendered pages:
// a render costs seconds, so the pages are written by the stand-in.
vi.mock('./_preview.mjs', async importOriginal =>
  (await import('../../test-utils/theme-render-stub.mjs')).stubRenders(
    /** @type {any} */ (await importOriginal()),
  ),
);

/** @type {string} */
let cwd;

beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-font-known-words-', FIXTURE_PACKAGES);
  writeFixtureBaseTheme(cwd, 'neutral');
  await themeEditNew('w', {cwd});
}, 120_000);

afterAll(() => {
  removeLinkedFixture(cwd);
});

/**
 * The refusal a font value gets on `set w font`.
 * @param {string} value
 */
const refusal = async value => {
  /** @type {any} */
  let err = null;
  try {
    await themeEditSet('w', 'font', value, {cwd});
  } catch (e) {
    err = e;
  }
  expect(err, value).not.toBeNull();
  return {
    code: err.code,
    lines: err.suggestions.map((/** @type {{name: string}} */ s) =>
      s.name.replace(/^.* editor /, ''),
    ),
  };
};

describe('the font dial', () => {
  it('keeps a family whose last word the editor knows as itself', async () => {
    const r = await themeEditSet('w', 'font', 'Inter Tight', {cwd});
    expect(r.data.setting.value).toBe('Inter Tight');
    await themeEditNew('n2', {cwd, settings: {font: 'Inter Tight'}});
  }, 240_000);

  it('answers a misspelled style word as the exact words', async () => {
    const exact = (await refusal('Inter Bold Italic')).lines;
    for (const typed of ['Inter Bold Itallic', 'Inter Blod Italic'])
      expect((await refusal(typed)).lines, typed).toEqual(exact);
  }, 240_000);

  it('reads any weight number after a known family as a weight', async () => {
    expect((await refusal('Inter 650')).lines).toEqual([
      'set w font Inter',
      'set w headings semibold',
    ]);
    expect((await refusal('Inter 6OO')).lines).toContain('set w font Inter');
    const r = await themeEditSet('w', 'font', 'Source Sans 3', {cwd});
    expect(r.data.setting.value).toBe('Source Sans 3');
  }, 240_000);

  it('refuses a value holding NaN or undefined, naming it', async () => {
    for (const typed of ['undefined', 'NaN', 'undefined, serif']) {
      const r = await refusal(typed);
      expect(r.code, typed).toBe('ERR_THEME_BAD_VALUE');
      expect(r.lines, typed).toEqual(['how font']);
    }
  }, 120_000);
});

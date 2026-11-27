// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The font dial reads a weight or style word typed with a typo after
 * a family it knows (`Georgia Blod`) as that word, and a preset typed with
 * a typo inside a list (`Robto, sans-serif`) as that preset, as it reads
 * them alone: refused with the lines that set what was meant.
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

// The assertions are about settings, builds, notes and lines, not rendered
// pages: a render costs seconds, so the pages are written by the stand-in.
vi.mock('./_preview.mjs', async importOriginal =>
  (await import('../../test-utils/theme-render-stub.mjs')).stubRenders(
    /** @type {any} */ (await importOriginal()),
  ),
);

/** @type {string} */
let cwd;

beforeAll(async () => {
  cwd = makeLinkedFixture(
    'astryx-theme-font-dial-weight-style-',
    FIXTURE_PACKAGES,
  );
  writeFixtureBaseTheme(cwd, 'neutral');
  await themeEditNew('w', {cwd});
}, 120_000);

afterAll(() => {
  removeLinkedFixture(cwd);
});

/**
 * The lines a refused font offers, after `set w`.
 * @param {string} value
 */
const offered = async value => {
  /** @type {any} */
  let err = null;
  try {
    await themeEditSet('w', 'font', value, {cwd});
  } catch (e) {
    err = e;
  }
  expect(err, value).not.toBeNull();
  return err.suggestions.map((/** @type {{name: string}} */ s) =>
    s.name.replace(/^.* set w /, ''),
  );
};

describe('a weight or style word typed with a typo after a known family', () => {
  it('is that word: refused with the family, the weight and the name kept as typed', async () => {
    for (const [typed, family, weight] of [
      ['Georgia Blod', 'Georgia', 'bold'],
      ['Inter semibld', 'Inter', 'semibold'],
      ['Inter Semibodl', 'Inter', 'semibold'],
      ['Arial Lihgt', 'Arial', 'light'],
      ['Verdana Medum', 'Verdana', 'medium'],
    ])
      expect(await offered(typed), typed).toEqual([
        `font ${family}`,
        `font '"${typed}"'`,
        `headings ${weight}`,
      ]);
  }, 240_000);

  it('is refused for a style word too, answered as the exact word is', async () => {
    expect(await offered('Courier New Itallic')).toEqual(
      await offered('Courier New Italic'),
    );
  }, 120_000);
});

describe('a preset typed with a typo inside a list', () => {
  it('is that preset, as it is alone', async () => {
    expect(await offered('Robto, sans-serif')).toEqual([
      "font 'roboto, sans-serif'",
      `font '"Robto", sans-serif'`,
    ]);
    expect(await offered('Geogria, serif')).toEqual([
      "font 'georgia, serif'",
      `font '"Geogria", serif'`,
    ]);
  }, 120_000);

  it('leaves a family near only a system font kept as typed, with its note', async () => {
    const r = await themeEditSet('w', 'font', 'Corben, serif', {cwd});
    expect(r.data.setting.value).toBe('Corben, serif');
    expect(r.data.notes.join('\n')).toContain('"Corben" is kept as typed');
  }, 120_000);
});
